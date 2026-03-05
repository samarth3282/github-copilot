"""Unit tests for the Cricket Impact Metric scoring engine."""
import pytest
from scoring.engine import (
    compute_performance_score,
    compute_context_multiplier,
    compute_situation_multiplier,
    compute_rolling_im,
    normalize_parametric,
    normalize_percentile,
    detect_trend,
)

# ── Shared fixtures ────────────────────────────────────────────────────────────

FORMAT_STATS = {
    "sr_baseline":  100.0,
    "econ_baseline": 8.0,
    "perf_mean":    15.0,
    "perf_std":     12.0,
}

PARAMS = {
    "w_runs": 1.0, "w_sr": 0.015, "w_boundaries": 0.5,
    "w_dots_avoided": 0.3, "w_wkts": 2.5, "w_econ": 0.4,
    "w_dots": 0.02, "w_maidens": 1.0, "w_catch": 1.0,
    "w_runout": 1.5, "w_stumping": 0.5,
    "alpha": 0.4, "beta": 0.3, "gamma": 0.25,
    "sigmoid_k": 0.9, "perf_sigmoid_k": 1.2,
    "format_weight": {"T20": 1.0, "ODI": 1.1, "Test": 1.2, "T10": 0.9},
    "raw_impact_cap": 2.0,
}


# ── Performance Score ──────────────────────────────────────────────────────────

def test_performance_score_bounds():
    row = {
        "player_role": "batsman", "format": "T20",
        "batting": {"runs_scored": 50, "balls_faced": 30, "fours": 4, "sixes": 2, "dots_faced": 5},
        "bowling": {}, "fielding": {},
    }
    ps = compute_performance_score(row, PARAMS, FORMAT_STATS)
    assert 0.0 < ps < 1.0, f"Performance score out of (0,1): {ps}"


def test_zero_ball_innings_below_neutral():
    row = {
        "player_role": "batsman", "format": "T20",
        "batting": {"runs_scored": 0, "balls_faced": 0},
        "bowling": {}, "fielding": {},
    }
    ps = compute_performance_score(row, PARAMS, FORMAT_STATS)
    assert ps < 0.5, f"Zero-ball innings should produce below-neutral P score: {ps}"


def test_exceptional_batting_near_one():
    row = {
        "player_role": "batsman", "format": "T20",
        "batting": {"runs_scored": 120, "balls_faced": 50, "fours": 10, "sixes": 8, "dots_faced": 2},
        "bowling": {}, "fielding": {},
    }
    ps = compute_performance_score(row, PARAMS, FORMAT_STATS)
    assert ps > 0.85, f"Exceptional batting should approach 1.0: {ps}"


def test_bowler_performance_score():
    row = {
        "player_role": "bowler", "format": "T20",
        "batting": {}, "fielding": {},
        "bowling": {"overs_bowled": 4.0, "runs_conceded": 22, "wickets_taken": 3,
                    "maidens": 0, "dot_balls_bowled": 14},
    }
    ps = compute_performance_score(row, PARAMS, FORMAT_STATS)
    assert ps > 0.6, f"Strong bowling should produce above-neutral P score: {ps}"


def test_allrounder_weighting():
    row = {
        "player_role": "allrounder", "format": "T20",
        "batting":  {"runs_scored": 40, "balls_faced": 25, "fours": 3, "sixes": 1, "dots_faced": 5},
        "bowling":  {"overs_bowled": 4.0, "runs_conceded": 30, "wickets_taken": 2,
                     "maidens": 0, "dot_balls_bowled": 10},
        "fielding": {"catches": 1, "run_outs": 0, "stumpings": 0},
    }
    ps = compute_performance_score(row, PARAMS, FORMAT_STATS)
    assert 0.0 < ps < 1.0


# ── Context Multiplier ─────────────────────────────────────────────────────────

def test_context_multiplier_elite_opposition():
    row = {"opposition_elo": 1400, "format": "T20", "innings_number": 1}
    cm  = compute_context_multiplier(row, PARAMS)
    assert cm > 1.0, f"Elite opposition should boost CM: {cm}"
    assert cm <= 1.8, f"CM should be capped at 1.8: {cm}"


def test_context_multiplier_weak_opposition():
    row = {"opposition_elo": 700, "format": "T20", "innings_number": 1}
    cm  = compute_context_multiplier(row, PARAMS)
    assert cm < 1.0, f"Weak opposition should lower CM: {cm}"
    assert cm >= 0.5, f"CM should not drop below 0.5: {cm}"


def test_context_second_innings_boost():
    row1 = {"opposition_elo": 1100, "format": "T20", "innings_number": 1}
    row2 = {"opposition_elo": 1100, "format": "T20", "innings_number": 2}
    assert compute_context_multiplier(row2, PARAMS) > compute_context_multiplier(row1, PARAMS)


def test_context_test_format_higher():
    row_t20  = {"opposition_elo": 1100, "format": "T20",  "innings_number": 1}
    row_test = {"opposition_elo": 1100, "format": "Test", "innings_number": 1}
    assert compute_context_multiplier(row_test, PARAMS) > compute_context_multiplier(row_t20, PARAMS)


# ── Situation Multiplier ──────────────────────────────────────────────────────

def test_situation_high_pressure_batting():
    row = {
        "match_importance": 1.5, "tournament_tier": "national",
        "batting": {
            "balls_faced": 20, "rrr_at_entry": 14.0,
            "crr_at_entry": 7.0, "wickets_in_hand_exit": 2,
        },
        "bowling": {},
    }
    sm = compute_situation_multiplier(row, PARAMS)
    assert sm > 1.2, f"High-pressure batting should produce SM > 1.2: {sm}"


def test_situation_death_bowling():
    row = {
        "match_importance": 1.0, "tournament_tier": "national",
        "batting": {"balls_faced": 0},
        "bowling": {"overs_bowled": 2.0, "match_phase_bowled": "death"},
    }
    sm = compute_situation_multiplier(row, PARAMS)
    assert sm >= 1.0, f"Death bowling SM should be ≥ 1.0: {sm}"


def test_situation_low_importance():
    row = {
        "match_importance": 0.5, "tournament_tier": "club",
        "batting": {"balls_faced": 0},
        "bowling": {},
    }
    sm = compute_situation_multiplier(row, PARAMS)
    assert sm < 1.0, f"Low-importance match should produce SM < 1.0: {sm}"


# ── Rolling IM ────────────────────────────────────────────────────────────────

def test_min_innings_gate():
    impacts = [0.8, 0.7]  # only 2 innings
    result  = compute_rolling_im(impacts, min_innings=3)
    assert result is None, "Fewer than min_innings should return None"


def test_rolling_im_recency_weighting():
    im_recent_good = compute_rolling_im([1.5, 0.3, 0.3, 0.3, 0.3])
    im_recent_bad  = compute_rolling_im([0.3, 1.5, 0.3, 0.3, 0.3])
    assert im_recent_good > im_recent_bad, "Recency weighting not working"


def test_rolling_im_uses_max_10():
    impacts = [1.0] * 15
    ri = compute_rolling_im(impacts)
    assert ri is not None
    assert abs(ri - 1.0) < 1e-6, "All-equal impacts should give 1.0"


# ── Normalization ──────────────────────────────────────────────────────────────

def test_parametric_midpoint():
    score = normalize_parametric(0.65, mu=0.65, sigma=0.28, k=0.9)
    assert abs(score - 50.0) < 0.5, f"z=0 should yield ~50: {score}"


def test_parametric_high_scorer():
    score = normalize_parametric(1.21, mu=0.65, sigma=0.28, k=0.9)
    assert score > 65, f"High rolling IM should yield > 65: {score}"


def test_parametric_bounds():
    s_high = normalize_parametric(5.0, mu=0.65, sigma=0.28, k=0.9)
    s_low  = normalize_parametric(-5.0, mu=0.65, sigma=0.28, k=0.9)
    assert s_high == 100.0
    assert s_low  ==   0.0


def test_percentile_normalization():
    all_scores = [0.3, 0.45, 0.52, 0.61, 0.70, 0.84, 0.91, 0.95, 0.4, 0.55]
    score = normalize_percentile(0.84, all_scores)
    assert 70 < score < 95, f"Score 0.84 in given distribution should be ~80: {score}"


# ── Worked example from README (Section 8.1) ─────────────────────────────────

def test_readme_worked_example():
    """
    Validate the README's concrete P001 calculation end-to-end.
    Expected Raw_Impact ≈ 1.907, IM ≈ 78.0
    """
    row = {
        "player_role": "allrounder", "format": "T20", "innings_number": 2,
        "match_importance": 1.5, "tournament_tier": "national",
        "opposition_elo": 1180,
        "batting": {
            "runs_scored": 68, "balls_faced": 42,
            "fours": 5, "sixes": 3, "dots_faced": 8,
            "batting_position": 5, "wickets_fallen_entry": 5,
            "rrr_at_entry": 11.5, "crr_at_entry": 8.2,
            "overs_left_at_entry": 7.0, "wickets_in_hand_exit": 4,
            "match_phase": "death",
        },
        "bowling": {
            "overs_bowled": 4.0, "runs_conceded": 31, "wickets_taken": 2,
            "maidens": 0, "dot_balls_bowled": 12,
        },
        "fielding": {"catches": 1, "run_outs": 0, "stumpings": 0},
        "form_recovery_bonus": 1.0,
    }
    fs = {"sr_baseline": 100.0, "econ_baseline": 8.0, "perf_mean": 15.0, "perf_std": 12.0}

    ps = compute_performance_score(row, PARAMS, fs)
    cm = compute_context_multiplier(row, PARAMS)
    sm = compute_situation_multiplier(row, PARAMS)
    raw = min(ps * cm * sm, PARAMS["raw_impact_cap"])

    # README values: ps≈0.962, cm≈1.233, sm≈1.608, raw≈1.907
    assert abs(ps  - 0.962) < 0.02, f"ps={ps:.4f}"
    assert abs(cm  - 1.233) < 0.02, f"cm={cm:.4f}"
    assert abs(sm  - 1.608) < 0.05, f"sm={sm:.4f}"
    assert abs(raw - 1.907) < 0.05, f"raw={raw:.4f}"

    # Rolling aggregation with full 5-innings window from README
    impacts = [raw, 0.62, 0.84, 0.45, 1.10]
    rolling = compute_rolling_im(impacts)
    assert rolling is not None
    assert abs(rolling - 1.044) < 0.05, f"rolling={rolling:.4f}"

    im = normalize_parametric(rolling, mu=0.65, sigma=0.28, k=0.9)
    assert 70 <= im <= 86, f"Final IM should be ~78: {im:.1f}"


# ── Trend Detection ───────────────────────────────────────────────────────────

def test_trend_rising():
    assert detect_trend([80, 75, 72, 55, 48, 50]) == "rising"


def test_trend_falling():
    assert detect_trend([40, 45, 42, 65, 70, 72]) == "falling"


def test_trend_stable():
    assert detect_trend([55, 53, 57, 52, 56, 54]) == "stable"
