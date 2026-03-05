from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, SmallInteger, BigInteger, Numeric,
    Boolean, Date, DateTime, ForeignKey, UniqueConstraint,
)
from db.database import Base


class Player(Base):
    __tablename__ = "players"

    player_id    = Column(String(64), primary_key=True)
    name         = Column(String(128), nullable=False)
    primary_role = Column(String(16))  # batsman | bowler | allrounder | wk-batsman
    team_id      = Column(String(64))
    created_at   = Column(DateTime, default=datetime.utcnow)


class Match(Base):
    __tablename__ = "matches"

    match_id         = Column(String(64), primary_key=True)
    match_date       = Column(Date, nullable=False)
    format           = Column(String(8))
    tournament_id    = Column(String(64))
    tournament_tier  = Column(String(16))
    team_a_id        = Column(String(64))
    team_b_id        = Column(String(64))
    ground_id        = Column(String(64))
    match_importance = Column(Numeric(4, 2), default=1.0)
    result           = Column(String(16))
    created_at       = Column(DateTime, default=datetime.utcnow)


class MatchContribution(Base):
    __tablename__ = "match_contributions"
    __table_args__ = (
        UniqueConstraint("match_id", "player_id", "innings_number"),
    )

    contribution_id      = Column(BigInteger, primary_key=True, autoincrement=True)
    match_id             = Column(String(64), ForeignKey("matches.match_id"))
    player_id            = Column(String(64), ForeignKey("players.player_id"))
    innings_number       = Column(SmallInteger)

    # denormalized match metadata (for fast scoring without joins)
    format               = Column(String(8))
    match_importance     = Column(Numeric(4, 2))
    tournament_tier      = Column(String(16))
    opposition_elo       = Column(Numeric(7, 2))
    player_role          = Column(String(16))
    player_team_won      = Column(Boolean)

    # batting
    runs_scored          = Column(Integer, default=0)
    balls_faced          = Column(Integer, default=0)
    fours                = Column(Integer, default=0)
    sixes                = Column(Integer, default=0)
    dots_faced           = Column(Integer, default=0)
    dismissal_type       = Column(String(32))
    batting_position     = Column(SmallInteger)
    wickets_fallen_entry = Column(SmallInteger)
    rrr_at_entry         = Column(Numeric(6, 2))
    crr_at_entry         = Column(Numeric(6, 2))
    overs_left_at_entry  = Column(Numeric(5, 1))
    wickets_in_hand_exit = Column(SmallInteger)
    match_phase          = Column(String(16))

    # bowling
    overs_bowled         = Column(Numeric(4, 1), default=0)
    runs_conceded        = Column(Integer, default=0)
    wickets_taken        = Column(SmallInteger, default=0)
    maidens              = Column(SmallInteger, default=0)
    dot_balls_bowled     = Column(Integer, default=0)
    match_phase_bowled   = Column(String(16))

    # fielding
    catches              = Column(SmallInteger, default=0)
    run_outs             = Column(SmallInteger, default=0)
    stumpings            = Column(SmallInteger, default=0)
    is_wicketkeeper      = Column(Boolean, default=False)

    # computed scores (filled by pipeline)
    performance_score    = Column(Numeric(8, 6))
    context_multiplier   = Column(Numeric(8, 6))
    situation_multiplier = Column(Numeric(8, 6))
    raw_impact           = Column(Numeric(8, 6))

    created_at           = Column(DateTime, default=datetime.utcnow)


class PlayerImpactScore(Base):
    __tablename__ = "player_impact_scores"
    __table_args__ = (
        UniqueConstraint("player_id", "computed_after_match_id", "format_filter"),
    )

    score_id                = Column(BigInteger, primary_key=True, autoincrement=True)
    player_id               = Column(String(64), ForeignKey("players.player_id"))
    computed_after_match_id = Column(String(64))
    computed_at             = Column(DateTime, default=datetime.utcnow)
    innings_count           = Column(SmallInteger)
    im_score                = Column(Numeric(5, 2))
    im_percentile           = Column(Numeric(5, 2))
    rolling_raw_impact      = Column(Numeric(8, 6))
    trend                   = Column(String(8))  # rising | falling | stable
    format_filter           = Column(String(8))


class TeamEloRating(Base):
    __tablename__ = "team_elo_ratings"

    team_id     = Column(String(64), primary_key=True)
    rating_date = Column(Date, primary_key=True)
    elo         = Column(Numeric(7, 2))
    format      = Column(String(8), primary_key=True)
