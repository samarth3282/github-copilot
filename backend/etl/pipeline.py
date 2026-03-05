"""
Cricket Impact Metric — ETL / Scoring Pipeline
Processes a single contribution end-to-end: validate → score → store → normalize.
"""
import numpy as np
from datetime import datetime, date as date_type
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from config import PARAMS
from scoring.engine import (
    compute_performance_score,
    compute_context_multiplier,
    compute_situation_multiplier,
    compute_rolling_im,
    normalize_parametric,
    normalize_percentile,
    detect_trend,
    get_format_stats,
    smooth_and_clip,
)
from db import crud


class ImpactMetricPipeline:
    """
    End-to-end pipeline for computing a player's Impact Metric after a match.

    Usage:
        pipeline = ImpactMetricPipeline(db_session)
        result   = pipeline.process_contribution(contribution_dict)
    """

    def __init__(self, db: Session, params: Optional[Dict] = None):
        self.db     = db
        self.params = params or PARAMS

    # ── Public API ────────────────────────────────────────────────────────────

    def process_contribution(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Full pipeline:
          1. Ensure player and match records exist
          2. Compute per-match performance / context / situation scores
          3. Upsert contribution row with computed sub-scores
          4. Compute recency-weighted rolling IM over last 10 innings
          5. Normalize to 0-100 (percentile if ≥10 players, parametric otherwise)
          6. Persist PlayerImpactScore record
          7. Return structured response dict compatible with ImpactResponse schema
        """
        player_id   = data["player_id"]
        match_id    = data["match_id"]
        fmt         = str(data.get("format", "T20"))
        innings_num = int(data.get("innings_number", 1))

        # ── 1. Ensure player and match exist ─────────────────────────────────
        crud.get_or_create_player(
            self.db,
            player_id=player_id,
            name=data.get("player_name", player_id),
            role=data.get("player_role", "batsman"),
            team_id=data.get("team_id", ""),
        )

        match_date = data.get("match_date")
        if isinstance(match_date, str):
            match_date = date_type.fromisoformat(match_date)
        if match_date is None:
            match_date = datetime.utcnow().date()

        crud.get_or_create_match(
            self.db,
            match_id=match_id,
            match_date=match_date,
            format=fmt,
            tournament_tier=data.get("tournament_tier", "national"),
            match_importance=float(data.get("match_importance", 1.0)),
            team_a_id=data.get("team_a_id", ""),
            team_b_id=data.get("team_b_id", ""),
            ground_id=data.get("ground_id", ""),
            result=data.get("match_result", ""),
        )

        # ── 1b. Auto-resolve opposition Elo from DB if not explicitly provided ─
        raw_opp_elo = data.get("opposition_elo")
        if not raw_opp_elo or float(raw_opp_elo) == 1000.0:
            match_rec = crud.get_match(self.db, match_id)
            if match_rec and match_rec.team_a_id and match_rec.team_b_id:
                player_team = data.get("team_id", "")
                opp_team_id = (
                    match_rec.team_b_id
                    if match_rec.team_a_id == player_team
                    else match_rec.team_a_id
                )
                elo_rec = crud.get_latest_team_elo(self.db, opp_team_id, fmt)
                if elo_rec:
                    data["opposition_elo"] = float(elo_rec.elo)

        # ── 2. Form-recovery bonus (pre-fetch last 3 IM scores) ───────────────
        recent_scores = crud.get_impact_score_history(
            self.db, player_id, n=3, format_filter=fmt
        )
        if recent_scores:
            avg_last_3 = float(np.mean([float(s.im_score) for s in recent_scores]))
        else:
            avg_last_3 = 50.0
        data["form_recovery_bonus"] = 1.1 if avg_last_3 < 35 else 1.0

        # ── 3. Compute per-match sub-scores ───────────────────────────────────
        format_stats = get_format_stats(fmt)
        ps  = compute_performance_score(data, self.params, format_stats)
        cm  = compute_context_multiplier(data, self.params)
        sm  = compute_situation_multiplier(data, self.params)
        raw = min(ps * cm * sm, self.params["raw_impact_cap"])

        # ── 4. Upsert contribution record ─────────────────────────────────────
        bat   = data.get("batting") or {}
        bowl  = data.get("bowling") or {}
        field = data.get("fielding") or {}

        crud.upsert_contribution(
            self.db,
            match_id             = match_id,
            player_id            = player_id,
            innings_number       = innings_num,
            format               = fmt,
            match_importance     = float(data.get("match_importance", 1.0)),
            tournament_tier      = data.get("tournament_tier", "national"),
            opposition_elo       = float(data.get("opposition_elo", 1000.0)),
            player_role          = data.get("player_role", "batsman"),
            player_team_won      = data.get("player_team_won"),
            # batting
            runs_scored          = int(bat.get("runs_scored", 0)),
            balls_faced          = int(bat.get("balls_faced", 0)),
            fours                = int(bat.get("fours", 0)),
            sixes                = int(bat.get("sixes", 0)),
            dots_faced           = int(bat.get("dots_faced", 0)),
            dismissal_type       = bat.get("dismissal_type", "not_out"),
            batting_position     = bat.get("batting_position"),
            wickets_fallen_entry = bat.get("wickets_fallen_entry"),
            rrr_at_entry         = bat.get("rrr_at_entry"),
            crr_at_entry         = bat.get("crr_at_entry"),
            overs_left_at_entry  = bat.get("overs_left_at_entry"),
            wickets_in_hand_exit = bat.get("wickets_in_hand_exit"),
            match_phase          = bat.get("match_phase"),
            # bowling
            overs_bowled         = float(bowl.get("overs_bowled", 0)),
            runs_conceded        = int(bowl.get("runs_conceded", 0)),
            wickets_taken        = int(bowl.get("wickets_taken", 0)),
            maidens              = int(bowl.get("maidens", 0)),
            dot_balls_bowled     = int(bowl.get("dot_balls_bowled", 0)),
            match_phase_bowled   = bowl.get("match_phase_bowled"),
            # fielding
            catches              = int(field.get("catches", 0)),
            run_outs             = int(field.get("run_outs", 0)),
            stumpings            = int(field.get("stumpings", 0)),
            is_wicketkeeper      = bool(field.get("is_wicketkeeper", False)),
            # computed
            performance_score    = round(float(ps), 6),
            context_multiplier   = round(float(cm), 6),
            situation_multiplier = round(float(sm), 6),
            raw_impact           = round(float(raw), 6),
        )

        # ── 5. Compute rolling IM (last 10 innings) ───────────────────────────
        recent_contribs = crud.get_player_recent_contributions(
            self.db, player_id, limit=10, format_filter=fmt
        )
        impacts = [float(c.raw_impact) for c in recent_contribs if c.raw_impact is not None]
        impacts = smooth_and_clip(impacts)

        rolling      = compute_rolling_im(impacts, lam=self.params["lambda"],
                                          min_innings=self.params["min_innings"])
        innings_count = len(impacts)

        # ── 6. Normalize to 0–100 ─────────────────────────────────────────────
        all_rolling = crud.get_all_rolling_scores(self.db, format_filter=fmt)

        if rolling is None:
            im_score   = None
            percentile = None
        elif len(all_rolling) >= 10:
            all_rolling_with_current = all_rolling + [rolling]
            im_score   = normalize_percentile(rolling, all_rolling_with_current)
            percentile = float(np.mean(np.array(all_rolling_with_current) <= rolling) * 100)
        else:
            im_score   = normalize_parametric(
                rolling, self.params["pop_mean"], self.params["pop_std"]
            )
            percentile = (
                float(np.mean(np.array(all_rolling) <= rolling) * 100)
                if all_rolling else 50.0
            )

        # ── 7. Detect trend ───────────────────────────────────────────────────
        history     = crud.get_impact_score_history(self.db, player_id, n=6, format_filter=fmt)
        past_scores = [float(h.im_score) for h in history if h.im_score is not None]
        if im_score is not None:
            trend = detect_trend([im_score] + past_scores)
        else:
            trend = "stable"

        # ── 8. Persist PlayerImpactScore ──────────────────────────────────────
        if im_score is not None:
            crud.upsert_impact_score(
                self.db,
                player_id               = player_id,
                computed_after_match_id = match_id,
                innings_count           = innings_count,
                im_score                = round(im_score, 2),
                im_percentile           = round(percentile or 0.0, 2),
                rolling_raw_impact      = round(rolling, 6),
                trend                   = trend,
                format_filter           = fmt,
            )

        # ── 9. Auto-update team Elo ratings (Elo formula, K=32×importance) ──
        player_team_won = data.get("player_team_won")
        if player_team_won is not None:
            match_rec = crud.get_match(self.db, match_id)
            if match_rec and match_rec.team_a_id and match_rec.team_b_id:
                player_team = data.get("team_id", "")
                if player_team in (match_rec.team_a_id, match_rec.team_b_id):
                    winner = player_team if player_team_won else (
                        match_rec.team_b_id
                        if match_rec.team_a_id == player_team
                        else match_rec.team_a_id
                    )
                    loser = (
                        match_rec.team_b_id
                        if winner == match_rec.team_a_id
                        else match_rec.team_a_id
                    )
                    # K-factor scales with match importance
                    k_factor = 32.0 * float(data.get("match_importance", 1.0))
                    w_rec = crud.get_latest_team_elo(self.db, winner, fmt)
                    l_rec = crud.get_latest_team_elo(self.db, loser, fmt)
                    w_elo = float(w_rec.elo) if w_rec else 1000.0
                    l_elo = float(l_rec.elo) if l_rec else 1000.0
                    expected_winner = 1.0 / (1.0 + 10.0 ** ((l_elo - w_elo) / 400.0))
                    crud.upsert_team_elo(
                        self.db, winner,
                        w_elo + k_factor * (1.0 - expected_winner), fmt, match_date
                    )
                    crud.upsert_team_elo(
                        self.db, loser,
                        l_elo + k_factor * (0.0 - (1.0 - expected_winner)), fmt, match_date
                    )

        # ── 10. Build response ─────────────────────────────────────────────────
        last_10 = [float(c.raw_impact or 0) for c in recent_contribs]

        return {
            "player_id":            player_id,
            "im_score":             round(im_score, 2) if im_score is not None else None,
            "im_percentile":        round(percentile or 0.0, 2),
            "rolling_raw_impact":   round(rolling or 0.0, 4),
            "innings_in_window":    innings_count,
            "trend":                trend,
            "last_10_scores":       last_10,
            "computed_at":          datetime.utcnow().isoformat() + "Z",
            "breakdown": {
                "performance_score":    round(float(ps), 4),
                "context_multiplier":   round(float(cm), 4),
                "situation_multiplier": round(float(sm), 4),
                "raw_impact":           round(float(raw), 4),
            },
        }
