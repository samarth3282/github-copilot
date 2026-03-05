from datetime import date
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_, func

from db.models import Player, Match, MatchContribution, PlayerImpactScore


# ── Players ───────────────────────────────────────────────────────────────────

def get_player(db: Session, player_id: str) -> Optional[Player]:
    return db.query(Player).filter(Player.player_id == player_id).first()


def create_player(
    db: Session, player_id: str, name: str, role: str = "batsman", team_id: str = ""
) -> Player:
    p = Player(player_id=player_id, name=name, primary_role=role, team_id=team_id)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def get_or_create_player(
    db: Session,
    player_id: str,
    name: str = "",
    role: str = "batsman",
    team_id: str = "",
) -> Player:
    p = get_player(db, player_id)
    if not p:
        p = create_player(db, player_id, name or player_id, role, team_id)
    return p


def list_players(db: Session, skip: int = 0, limit: int = 100) -> List[Player]:
    return db.query(Player).offset(skip).limit(limit).all()


# ── Matches ───────────────────────────────────────────────────────────────────

def get_match(db: Session, match_id: str) -> Optional[Match]:
    return db.query(Match).filter(Match.match_id == match_id).first()


def create_match(db: Session, **kwargs) -> Match:
    m = Match(**kwargs)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


def get_or_create_match(db: Session, match_id: str, **kwargs) -> Match:
    m = get_match(db, match_id)
    if not m:
        m = create_match(db, match_id=match_id, **kwargs)
    return m


# ── Contributions ─────────────────────────────────────────────────────────────

def get_contribution(
    db: Session, match_id: str, player_id: str, innings_number: int
) -> Optional[MatchContribution]:
    return db.query(MatchContribution).filter(
        and_(
            MatchContribution.match_id == match_id,
            MatchContribution.player_id == player_id,
            MatchContribution.innings_number == innings_number,
        )
    ).first()


def upsert_contribution(db: Session, **kwargs) -> MatchContribution:
    existing = get_contribution(
        db, kwargs["match_id"], kwargs["player_id"], kwargs["innings_number"]
    )
    if existing:
        for k, v in kwargs.items():
            setattr(existing, k, v)
        db.commit()
        db.refresh(existing)
        return existing
    c = MatchContribution(**kwargs)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def get_player_recent_contributions(
    db: Session,
    player_id: str,
    limit: int = 10,
    format_filter: Optional[str] = None,
) -> List[MatchContribution]:
    """Return last `limit` contributions for a player, newest first."""
    q = (
        db.query(MatchContribution)
        .join(Match, MatchContribution.match_id == Match.match_id)
        .filter(MatchContribution.player_id == player_id)
    )
    if format_filter:
        q = q.filter(MatchContribution.format == format_filter)
    return q.order_by(desc(Match.match_date)).limit(limit).all()


# ── Impact Scores ─────────────────────────────────────────────────────────────

def get_latest_impact_score(
    db: Session,
    player_id: str,
    format_filter: Optional[str] = None,
    as_of: Optional[date] = None,
) -> Optional[PlayerImpactScore]:
    q = db.query(PlayerImpactScore).filter(
        PlayerImpactScore.player_id == player_id
    )
    if format_filter:
        q = q.filter(PlayerImpactScore.format_filter == format_filter)
    if as_of:
        q = q.filter(PlayerImpactScore.computed_at <= as_of)
    return q.order_by(desc(PlayerImpactScore.computed_at)).first()


def get_impact_score_history(
    db: Session,
    player_id: str,
    n: int = 10,
    format_filter: Optional[str] = None,
) -> List[PlayerImpactScore]:
    q = db.query(PlayerImpactScore).filter(
        PlayerImpactScore.player_id == player_id
    )
    if format_filter:
        q = q.filter(PlayerImpactScore.format_filter == format_filter)
    return q.order_by(desc(PlayerImpactScore.computed_at)).limit(n).all()


def upsert_impact_score(db: Session, **kwargs) -> PlayerImpactScore:
    existing = db.query(PlayerImpactScore).filter(
        PlayerImpactScore.player_id == kwargs["player_id"],
        PlayerImpactScore.computed_after_match_id == kwargs["computed_after_match_id"],
        PlayerImpactScore.format_filter == kwargs["format_filter"],
    ).first()
    if existing:
        for k, v in kwargs.items():
            setattr(existing, k, v)
        db.commit()
        db.refresh(existing)
        return existing
    s = PlayerImpactScore(**kwargs)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def get_leaderboard(
    db: Session,
    format_filter: Optional[str] = None,
    limit: int = 20,
    min_innings: int = 3,
) -> List[dict]:
    """Return top players ordered by latest im_score."""
    q = db.query(
        PlayerImpactScore.player_id,
        func.max(PlayerImpactScore.computed_at).label("latest_at"),
    ).filter(PlayerImpactScore.innings_count >= min_innings)
    if format_filter:
        q = q.filter(PlayerImpactScore.format_filter == format_filter)
    subq = q.group_by(PlayerImpactScore.player_id).subquery()

    rows = (
        db.query(PlayerImpactScore, Player)
        .join(
            subq,
            and_(
                PlayerImpactScore.player_id == subq.c.player_id,
                PlayerImpactScore.computed_at == subq.c.latest_at,
            ),
        )
        .join(Player, PlayerImpactScore.player_id == Player.player_id)
        .order_by(desc(PlayerImpactScore.im_score))
        .limit(limit)
        .all()
    )

    result = []
    for score, player in rows:
        result.append(
            {
                "rank": len(result) + 1,
                "player_id": player.player_id,
                "name": player.name,
                "team": player.team_id,
                "role": player.primary_role,
                "im_score": float(score.im_score or 0),
                "im_percentile": float(score.im_percentile or 0),
                "trend": score.trend or "stable",
                "innings_count": int(score.innings_count or 0),
                "format": score.format_filter,
            }
        )
    return result


def get_all_rolling_scores(
    db: Session,
    format_filter: Optional[str] = None,
    min_innings: int = 3,
) -> List[float]:
    """Return all current rolling_raw_impact values for population normalization."""
    q = db.query(
        PlayerImpactScore.player_id,
        func.max(PlayerImpactScore.computed_at).label("latest_at"),
    ).filter(PlayerImpactScore.innings_count >= min_innings)
    if format_filter:
        q = q.filter(PlayerImpactScore.format_filter == format_filter)
    subq = q.group_by(PlayerImpactScore.player_id).subquery()

    rows = (
        db.query(PlayerImpactScore.rolling_raw_impact)
        .join(
            subq,
            and_(
                PlayerImpactScore.player_id == subq.c.player_id,
                PlayerImpactScore.computed_at == subq.c.latest_at,
            ),
        )
        .all()
    )
    return [float(r.rolling_raw_impact) for r in rows if r.rolling_raw_impact is not None]
