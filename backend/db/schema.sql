-- ─────────────────────────────────────────────────────────────────────────────
-- Cricket Impact Metric — Database Schema
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS players (
    player_id    VARCHAR(64) PRIMARY KEY,
    name         VARCHAR(128) NOT NULL,
    primary_role VARCHAR(16) CHECK (primary_role IN ('batsman','bowler','allrounder','wk-batsman')),
    team_id      VARCHAR(64),
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
    match_id         VARCHAR(64) PRIMARY KEY,
    match_date       DATE NOT NULL,
    format           VARCHAR(8)  CHECK (format IN ('T20','ODI','Test','T10')),
    tournament_id    VARCHAR(64),
    tournament_tier  VARCHAR(16),
    team_a_id        VARCHAR(64),
    team_b_id        VARCHAR(64),
    ground_id        VARCHAR(64),
    match_importance NUMERIC(4,2) DEFAULT 1.0,
    result           VARCHAR(16),
    created_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_contributions (
    contribution_id      BIGSERIAL PRIMARY KEY,
    match_id             VARCHAR(64) REFERENCES matches(match_id),
    player_id            VARCHAR(64) REFERENCES players(player_id),
    innings_number       SMALLINT,

    -- denormalized
    format               VARCHAR(8),
    match_importance     NUMERIC(4,2),
    tournament_tier      VARCHAR(16),
    opposition_elo       NUMERIC(7,2),
    player_role          VARCHAR(16),
    player_team_won      BOOLEAN,

    -- batting
    runs_scored          INTEGER  DEFAULT 0,
    balls_faced          INTEGER  DEFAULT 0,
    fours                INTEGER  DEFAULT 0,
    sixes                INTEGER  DEFAULT 0,
    dots_faced           INTEGER  DEFAULT 0,
    dismissal_type       VARCHAR(32),
    batting_position     SMALLINT,
    wickets_fallen_entry SMALLINT,
    rrr_at_entry         NUMERIC(6,2),
    crr_at_entry         NUMERIC(6,2),
    overs_left_at_entry  NUMERIC(5,1),
    wickets_in_hand_exit SMALLINT,
    match_phase          VARCHAR(16),

    -- bowling
    overs_bowled         NUMERIC(4,1) DEFAULT 0,
    runs_conceded        INTEGER      DEFAULT 0,
    wickets_taken        SMALLINT     DEFAULT 0,
    maidens              SMALLINT     DEFAULT 0,
    dot_balls_bowled     INTEGER      DEFAULT 0,
    match_phase_bowled   VARCHAR(16),

    -- fielding
    catches              SMALLINT DEFAULT 0,
    run_outs             SMALLINT DEFAULT 0,
    stumpings            SMALLINT DEFAULT 0,
    is_wicketkeeper      BOOLEAN  DEFAULT FALSE,

    -- computed
    performance_score    NUMERIC(8,6),
    context_multiplier   NUMERIC(8,6),
    situation_multiplier NUMERIC(8,6),
    raw_impact           NUMERIC(8,6),

    created_at           TIMESTAMP DEFAULT NOW(),
    UNIQUE (match_id, player_id, innings_number)
);

CREATE TABLE IF NOT EXISTS player_impact_scores (
    score_id                BIGSERIAL PRIMARY KEY,
    player_id               VARCHAR(64) REFERENCES players(player_id),
    computed_after_match_id VARCHAR(64),
    computed_at             TIMESTAMP DEFAULT NOW(),
    innings_count           SMALLINT,
    im_score                NUMERIC(5,2),
    im_percentile           NUMERIC(5,2),
    rolling_raw_impact      NUMERIC(8,6),
    trend                   VARCHAR(8),
    format_filter           VARCHAR(8),
    UNIQUE (player_id, computed_after_match_id, format_filter)
);

CREATE TABLE IF NOT EXISTS team_elo_ratings (
    team_id     VARCHAR(64),
    rating_date DATE,
    elo         NUMERIC(7,2),
    format      VARCHAR(8),
    PRIMARY KEY (team_id, rating_date, format)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contributions_player ON match_contributions(player_id, match_id);
CREATE INDEX IF NOT EXISTS idx_impact_player        ON player_impact_scores(player_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_impact_format        ON player_impact_scores(format_filter, im_score DESC);
