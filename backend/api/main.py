"""
Cricket Impact Metric — REST API (FastAPI)
Endpoints: /health, /players, /matches, /compute,
           /player/{id}/impact, /player/{id}/history, /player/{id}/breakdown,
           /leaderboard
"""
import json
import logging
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import redis

from config import FORMAT_STATS, PARAMS, REDIS_URL
from db import crud
from db.database import Base, engine, get_db
from db import models  # noqa: F401 — ensures tables are known to SQLAlchemy
from etl.pipeline import ImpactMetricPipeline
from monitoring.drift import check_distribution_drift, check_null_rate
from scoring.engine import calibrate_population_stats
from training.optimizer import fit_impact_weights, apply_weights

# Create DB tables on startup (idempotent)
Base.metadata.create_all(bind=engine)

logger = logging.getLogger(__name__)

# ── Redis cache helper ────────────────────────────────────────────────────────
_redis_client: Optional[Any] = None


def get_redis():
    """Return a Redis client if reachable, else None. App works without cache."""
    global _redis_client
    if _redis_client is None:
        try:
            _redis_client = redis.from_url(
                REDIS_URL, decode_responses=True, socket_connect_timeout=1
            )
            _redis_client.ping()
        except Exception:
            _redis_client = None
    return _redis_client


app = FastAPI(
    title="Cricket Impact Metric API",
    version="1.0.0",
    description="Context-aware player influence scoring system for cricket.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic Models ────────────────────────────────────────────────────────────

class BattingInput(BaseModel):
    runs_scored:          int   = 0
    balls_faced:          int   = 0
    fours:                int   = 0
    sixes:                int   = 0
    dots_faced:           int   = 0
    dismissal_type:       str   = "not_out"
    batting_position:     int   = 5
    wickets_fallen_entry: int   = 0
    rrr_at_entry:         float = 8.0
    crr_at_entry:         float = 8.0
    overs_left_at_entry:  float = 10.0
    wickets_in_hand_exit: int   = 5
    match_phase:          str   = "middle"


class BowlingInput(BaseModel):
    overs_bowled:       float = 0.0
    runs_conceded:      int   = 0
    wickets_taken:      int   = 0
    maidens:            int   = 0
    dot_balls_bowled:   int   = 0
    match_phase_bowled: str   = "middle"


class FieldingInput(BaseModel):
    catches:        int  = 0
    run_outs:       int  = 0
    stumpings:      int  = 0
    is_wicketkeeper: bool = False


class ContributionRequest(BaseModel):
    match_id:         str
    player_id:        str
    player_name:      str  = ""
    team_id:          str  = ""
    match_date:       date
    format:           str  = "T20"
    innings_number:   int  = 1
    match_importance: float = Field(default=1.0, ge=0.5, le=2.0)
    tournament_tier:  str  = "national"
    opposition_elo:   float = 1000.0
    player_role:      str  = "batsman"
    batting:          Optional[BattingInput]  = None
    bowling:          Optional[BowlingInput]  = None
    fielding:         Optional[FieldingInput] = None
    player_team_won:  Optional[bool]          = None


class ImpactResponse(BaseModel):
    player_id:           str
    im_score:            Optional[float]  # None if < min_innings
    im_percentile:       float
    rolling_raw_impact:  float
    innings_in_window:   int
    trend:               str
    last_10_scores:      List[float]
    computed_at:         str
    breakdown:           Optional[Dict[str, float]] = None


class PlayerCreate(BaseModel):
    player_id:    str
    name:         str
    primary_role: str = "batsman"
    team_id:      str = ""


class MatchCreate(BaseModel):
    match_id:         str
    match_date:       date
    format:           str   = "T20"
    tournament_tier:  str   = "national"
    match_importance: float = 1.0
    team_a_id:        str   = ""
    team_b_id:        str   = ""
    ground_id:        str   = ""
    result:           str   = ""


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/health", tags=["meta"])
def health_check():
    return {"status": "ok", "version": "1.0.0"}


# ── Players ───────────────────────────────────────────────────────────────────

@app.post("/players", status_code=201, tags=["players"])
def create_player(body: PlayerCreate, db: Session = Depends(get_db)):
    if crud.get_player(db, body.player_id):
        raise HTTPException(409, f"Player '{body.player_id}' already exists")
    p = crud.create_player(db, body.player_id, body.name, body.primary_role, body.team_id)
    return {"player_id": p.player_id, "name": p.name, "role": p.primary_role, "team": p.team_id}


@app.get("/players", tags=["players"])
def list_players(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
):
    players = crud.list_players(db, skip=skip, limit=limit)
    return [
        {"player_id": p.player_id, "name": p.name, "role": p.primary_role, "team": p.team_id}
        for p in players
    ]


@app.get("/players/{player_id}", tags=["players"])
def get_player(player_id: str, db: Session = Depends(get_db)):
    p = crud.get_player(db, player_id)
    if not p:
        raise HTTPException(404, f"Player '{player_id}' not found")
    return {"player_id": p.player_id, "name": p.name, "role": p.primary_role, "team": p.team_id}


# ── Matches ───────────────────────────────────────────────────────────────────

@app.post("/matches", status_code=201, tags=["matches"])
def create_match(body: MatchCreate, db: Session = Depends(get_db)):
    if crud.get_match(db, body.match_id):
        raise HTTPException(409, "Match already exists")
    m = crud.create_match(
        db,
        match_id         = body.match_id,
        match_date       = body.match_date,
        format           = body.format,
        tournament_tier  = body.tournament_tier,
        match_importance = body.match_importance,
        team_a_id        = body.team_a_id,
        team_b_id        = body.team_b_id,
        ground_id        = body.ground_id,
        result           = body.result,
    )
    return {"match_id": m.match_id}


# ── Scoring ───────────────────────────────────────────────────────────────────

@app.post("/compute", response_model=ImpactResponse, tags=["scoring"])
def compute_impact(contribution: ContributionRequest, db: Session = Depends(get_db)):
    """Submit a match contribution and receive the updated IM score."""
    pipeline = ImpactMetricPipeline(db, PARAMS)
    data = contribution.model_dump()
    # Flatten nested Pydantic models to plain dicts
    for key in ("batting", "bowling", "fielding"):
        if data[key] is not None:
            data[key] = dict(data[key])
    result = pipeline.process_contribution(data)
    # Invalidate leaderboard cache — a new score has been computed
    r = get_redis()
    if r:
        try:
            keys = r.keys("leaderboard:*")
            if keys:
                r.delete(*keys)
        except Exception:
            pass
    return ImpactResponse(**result)


@app.get("/player/{player_id}/impact", response_model=ImpactResponse, tags=["scoring"])
def get_player_impact(
    player_id: str,
    format: Optional[str] = Query(None, description="Filter by format: T20/ODI/Test"),
    as_of:  Optional[date] = Query(None, description="Historical score as of date"),
    db: Session = Depends(get_db),
):
    """Retrieve the latest (or historical) IM score for a player."""
    score = crud.get_latest_impact_score(db, player_id, format_filter=format, as_of=as_of)
    if not score:
        raise HTTPException(404, f"No impact score found for player '{player_id}'")

    recent = crud.get_player_recent_contributions(db, player_id, limit=10, format_filter=format)
    last_10 = [float(c.raw_impact or 0) for c in recent]

    return ImpactResponse(
        player_id          = player_id,
        im_score           = float(score.im_score) if score.im_score is not None else None,
        im_percentile      = float(score.im_percentile or 0),
        rolling_raw_impact = float(score.rolling_raw_impact or 0),
        innings_in_window  = int(score.innings_count or 0),
        trend              = score.trend or "stable",
        last_10_scores     = last_10,
        computed_at        = score.computed_at.isoformat() + "Z",
    )


@app.get("/player/{player_id}/history", tags=["scoring"])
def player_history(
    player_id: str,
    n:      int = Query(default=10, ge=1, le=50),
    format: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Return last N IM scores and match stats for a player."""
    history = crud.get_impact_score_history(db, player_id, n=n, format_filter=format)
    recent  = crud.get_player_recent_contributions(db, player_id, limit=n, format_filter=format)
    contribs_by_match: Dict[str, Any] = {c.match_id: c for c in recent}

    result = []
    for h in history:
        c = contribs_by_match.get(h.computed_after_match_id)
        result.append({
            "match_id":     h.computed_after_match_id,
            "computed_at":  h.computed_at.isoformat() + "Z",
            "im_score":     float(h.im_score or 0),
            "raw_impact":   float(h.rolling_raw_impact or 0),
            "trend":        h.trend,
            "innings_count": h.innings_count,
            "format":       h.format_filter,
            "runs":         int(c.runs_scored or 0)    if c else None,
            "wickets":      int(c.wickets_taken or 0)  if c else None,
            "balls_faced":  int(c.balls_faced or 0)    if c else None,
            "overs_bowled": float(c.overs_bowled or 0) if c else None,
        })
    return result


@app.get("/player/{player_id}/breakdown", tags=["scoring"])
def player_breakdown(
    player_id: str,
    format: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Return per-match score breakdown for detailed analysis."""
    recent = crud.get_player_recent_contributions(db, player_id, limit=10, format_filter=format)
    return [
        {
            "match_id":           c.match_id,
            "format":             c.format,
            "performance_score":  float(c.performance_score or 0),
            "context_multiplier": float(c.context_multiplier or 0),
            "situation_multiplier": float(c.situation_multiplier or 0),
            "raw_impact":         float(c.raw_impact or 0),
            "runs":               int(c.runs_scored or 0),
            "balls":              int(c.balls_faced or 0),
            "wickets":            int(c.wickets_taken or 0),
            "economy":            (
                round(float(c.runs_conceded) / float(c.overs_bowled), 2)
                if c.overs_bowled and float(c.overs_bowled) > 0 else None
            ),
            "catches":            int(c.catches or 0),
        }
        for c in recent
    ]


# ── Leaderboard ───────────────────────────────────────────────────────────────

@app.get("/leaderboard", tags=["leaderboard"])
def leaderboard(
    format:      str = Query(default="T20", description="Format filter: T20/ODI/Test/T10"),
    limit:       int = Query(default=20, ge=1, le=100),
    min_innings: int = Query(default=3, ge=1),
    db: Session = Depends(get_db),
):
    """Return ranked leaderboard of players ordered by IM score (Redis-cached for 60 s)."""
    cache_key = f"leaderboard:{format}:{limit}:{min_innings}"
    r = get_redis()
    if r:
        try:
            cached = r.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    result = crud.get_leaderboard(db, format_filter=format, limit=limit, min_innings=min_innings)

    if r:
        try:
            r.setex(cache_key, 60, json.dumps(result))
        except Exception:
            pass
    return result

# ── Admin / Data-Science Endpoints ──────────────────────────────────────

@app.post("/admin/retrain", tags=["admin"])
def retrain_weights(
    format:      Optional[str] = Query(None, description="Limit to one format; None = all"),
    min_samples: int           = Query(default=20, ge=5),
    db: Session = Depends(get_db),
):
    """
    Fit logistic-regression weights from historical contributions where
    player_team_won is known.

    **Data-driven design**: instead of hard-coded weights, this endpoint
    optimises every coefficient to maximise prediction of match wins.
    The scipy L-BFGS-B solver minimises logistic loss (with L2 regularisation)
    subject to cricket-sensible box constraints.

    Returns the learned weights and fit quality metrics. If there are fewer
    than `min_samples` labelled contributions, the prior weights are kept
    and a `skipped` flag is returned.
    """
    result = fit_impact_weights(
        db,
        format_stats_map=FORMAT_STATS,
        format_filter=format,
        min_samples=min_samples,
    )
    if result is None:
        return {
            "skipped": True,
            "reason": f"Fewer than {min_samples} contributions with known outcomes.",
            "current_weights": {
                k: PARAMS[k] for k in [
                    "w_runs", "w_sr", "w_boundaries", "w_dots_avoided",
                    "w_wkts", "w_econ", "w_dots", "w_maidens", "w_catch", "w_runout",
                ]
            },
        }
    apply_weights(result["weights"], PARAMS)
    return {
        "skipped":      False,
        "weights":      result["weights"],
        "n_samples":    result["n_samples"],
        "win_rate":     result["win_rate"],
        "accuracy":     result["accuracy"],
        "log_loss":     result["log_loss"],
        "converged":    result["converged"],
        "feature_importance": result["feature_importance"],
    }


@app.post("/admin/calibrate", tags=["admin"])
def calibrate_normalization(
    format:      Optional[str] = Query(None),
    min_innings: int           = Query(default=3, ge=1),
    db: Session = Depends(get_db),
):
    """
    Recompute population μ / σ for parametric normalization from the
    rolling raw impact scores currently in the database.

    Call this after accumulating sufficient player history so that
    the 50-baseline stays well-calibrated as the player pool grows.
    """
    all_scores = crud.get_all_rolling_scores(db, format_filter=format, min_innings=min_innings)
    if len(all_scores) < 3:
        raise HTTPException(400, "Need at least 3 players with scores to calibrate.")
    stats = calibrate_population_stats(all_scores)
    # Update live PARAMS so new /compute calls immediately use the new distribution
    PARAMS["pop_mean"] = round(stats["mean"], 4)
    PARAMS["pop_std"]  = round(max(stats["std"], 0.01), 4)  # guard against zero std
    return {
        "updated":    True,
        "pop_mean":   PARAMS["pop_mean"],
        "pop_std":    PARAMS["pop_std"],
        "population": stats,
    }


@app.get("/admin/drift", tags=["admin"])
def distribution_drift(
    format:      Optional[str] = Query(None, description="Filter by format; None = all"),
    threshold:   float         = Query(default=0.1, ge=0.0, le=1.0, description="JSD alert threshold"),
    min_innings: int           = Query(default=3, ge=1),
    db: Session = Depends(get_db),
):
    """
    Report Jensen-Shannon divergence drift of the IM score distribution.

    Fetches all current player IM scores (0-100), splits them into two halves
    (older half = baseline, newer half = current) and computes JSD between
    the two halves.  JSD > threshold (default 0.1) sets alert=True.
    Also returns the null-rate: fraction of players with no valid IM score.
    """
    im_scores    = crud.get_all_im_scores(db, format_filter=format, min_innings=min_innings)
    total_players = len(crud.list_players(db))
    scored_count  = len(im_scores)
    null_count    = max(total_players - scored_count, 0)

    if len(im_scores) >= 6:
        mid      = len(im_scores) // 2
        baseline = im_scores[:mid]
        current  = im_scores[mid:]
        drift    = check_distribution_drift(current, baseline, threshold=threshold)
    else:
        drift = {
            "jsd": 0.0, "alert": False, "threshold": threshold,
            "note": "Need ≥ 6 scored players for drift detection.",
        }

    null_report = check_null_rate(total_players, null_count, threshold=0.20)

    return {
        "format":        format or "all",
        "drift":         drift,
        "null_rate":     null_report,
        "player_counts": {
            "total":          total_players,
            "with_scores":    scored_count,
            "without_scores": null_count,
        },
    }


@app.get("/teams/{team_id}/elo", tags=["elo"])
def get_team_elo(
    team_id: str,
    format: str = Query(default="T20"),
    db: Session = Depends(get_db),
):
    """Get the current Elo rating for a team."""
    rec = crud.get_latest_team_elo(db, team_id, format)
    if not rec:
        return {"team_id": team_id, "format": format, "elo": 1000.0, "rating_date": None}
    return {
        "team_id":     rec.team_id,
        "format":      rec.format,
        "elo":         float(rec.elo),
        "rating_date": rec.rating_date.isoformat(),
    }


class EloSetRequest(BaseModel):
    elo: float = Field(default=1000.0, ge=500.0, le=2000.0)
    format: str = "T20"
    rating_date: Optional[date] = None


@app.post("/teams/{team_id}/elo", tags=["elo"])
def set_team_elo(
    team_id: str,
    body: EloSetRequest,
    db: Session = Depends(get_db),
):
    """Manually seed or override a team's Elo rating."""
    from datetime import datetime
    rd = body.rating_date or datetime.utcnow().date()
    rec = crud.upsert_team_elo(db, team_id, body.elo, body.format, rd)
    return {"team_id": rec.team_id, "elo": float(rec.elo), "format": rec.format, "rating_date": rec.rating_date.isoformat()}