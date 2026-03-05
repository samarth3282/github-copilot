"""
Cricket Impact Metric — Scoring Engine
Implements the full per-match and rolling IM computation as specified in the README.
"""
import numpy as np
from typing import Any, Dict, List, Optional

# ── Constants ─────────────────────────────────────────────────────────────────

PHASE_BOWL_WEIGHTS: Dict[str, float] = {
    "powerplay": 1.0,
    "middle":    0.9,
    "death":     1.3,
}

TIER_MULTIPLIERS: Dict[str, float] = {
    "club":          0.7,
    "district":      0.85,
    "national":      1.0,
    "international": 1.2,
}

_DEFAULT_FORMAT_STATS: Dict[str, Dict[str, float]] = {
    "T20":  {"sr_baseline": 100.0, "econ_baseline": 8.0,  "perf_mean": 15.0, "perf_std": 12.0},
    "T10":  {"sr_baseline": 120.0, "econ_baseline": 10.0, "perf_mean": 10.0, "perf_std": 8.0},
    "ODI":  {"sr_baseline": 75.0,  "econ_baseline": 5.5,  "perf_mean": 20.0, "perf_std": 15.0},
    "Test": {"sr_baseline": 50.0,  "econ_baseline": 3.5,  "perf_mean": 30.0, "perf_std": 20.0},
}


# ── Utilities ─────────────────────────────────────────────────────────────────

def sigmoid(x: float, k: float = 1.2) -> float:
    """Numerically stable logistic sigmoid."""
    x = float(x)
    if x >= 0:
        return 1.0 / (1.0 + np.exp(-k * x))
    e = np.exp(k * x)
    return e / (1.0 + e)


def safe_divide(num: float, den: float, default: float = 0.0) -> float:
    return float(num) / float(den) if abs(float(den)) > 1e-9 else default


def get_format_stats(fmt: str) -> Dict[str, float]:
    return _DEFAULT_FORMAT_STATS.get(fmt, _DEFAULT_FORMAT_STATS["T20"])


# ── Step 1: Performance Score ─────────────────────────────────────────────────

def compute_performance_score(
    row: Dict[str, Any],
    params: Dict[str, Any],
    format_stats: Optional[Dict[str, float]] = None,
) -> float:
    """
    Returns Performance_Score ∈ (0, 1).
    Computes batting/bowling/fielding sub-scores, applies z-normalization,
    then squashes via logistic sigmoid.
    """
    if format_stats is None:
        format_stats = get_format_stats(row.get("format", "T20"))

    p          = params
    bat        = row.get("batting") or {}
    bowl       = row.get("bowling") or {}
    field      = row.get("fielding") or {}
    sr_base    = format_stats["sr_baseline"]
    econ_base  = format_stats["econ_baseline"]

    # ── Batting raw ───────────────────────────────────────────────────────────
    runs       = float(bat.get("runs_scored", 0))
    balls      = float(bat.get("balls_faced", 0))
    sr         = safe_divide(runs, balls, 0.0) * 100.0
    boundaries = float(bat.get("fours", 0)) + float(bat.get("sixes", 0))
    dot_frac   = safe_divide(float(bat.get("dots_faced", 0)), balls, 0.0)

    bat_raw = (
        p["w_runs"]        * runs
        + p["w_sr"]        * (sr - sr_base)
        + p["w_boundaries"] * boundaries
        + p["w_dots_avoided"] * (1.0 - dot_frac)
    )

    # ── Bowling raw ───────────────────────────────────────────────────────────
    overs       = float(bowl.get("overs_bowled", 0))
    rc          = float(bowl.get("runs_conceded", 0))
    wkts        = float(bowl.get("wickets_taken", 0))
    maidens     = float(bowl.get("maidens", 0))
    dots_b      = float(bowl.get("dot_balls_bowled", 0))
    full_overs  = int(overs)
    partial     = round((overs % 1) * 10)
    balls_bowled = full_overs * 6 + partial
    eco         = safe_divide(rc, overs, econ_base)
    dot_pct_bowl = safe_divide(dots_b, float(balls_bowled), 0.0)

    bowl_raw = (
        p["w_wkts"]   * wkts
        + p["w_econ"] * (econ_base - eco)
        + p["w_dots"] * dot_pct_bowl * 100.0
        + p["w_maidens"] * maidens
    )

    # ── Fielding raw ─────────────────────────────────────────────────────────
    field_raw = (
        p["w_catch"]    * float(field.get("catches", 0))
        + p["w_runout"] * float(field.get("run_outs", 0))
        + p["w_stumping"] * float(field.get("stumpings", 0))
    )

    # ── Role-based aggregation ────────────────────────────────────────────────
    # Allrounder split is adaptive: weighted by the player's actual contribution
    # magnitude this match rather than a fixed 60/40 ratio. This is data-driven —
    # the weight is derived from what the player actually did, not a prior assumption.
    role = str(row.get("player_role", "batsman")).lower()
    if "bowler" in role and "all" not in role:
        perf_raw = bowl_raw + field_raw
    elif "all" in role:
        bat_pos  = max(bat_raw, 0.0)
        bowl_pos = max(bowl_raw, 0.0)
        denom    = bat_pos + bowl_pos
        if denom > 1e-9:
            bat_w  = bat_pos / denom   # e.g. 0.72 if bat dominated
            bowl_w = bowl_pos / denom  # e.g. 0.28
        else:
            bat_w, bowl_w = 0.6, 0.4  # fallback for DNB/DNB
        perf_raw = bat_w * bat_raw + bowl_w * bowl_raw + field_raw
    else:  # batsman / wk-batsman
        perf_raw = bat_raw + field_raw

    # ── Z-score → sigmoid ────────────────────────────────────────────────────
    mu    = format_stats["perf_mean"]
    sigma = format_stats["perf_std"]
    z     = safe_divide(perf_raw - mu, sigma, 0.0)

    return float(sigmoid(z, k=p.get("perf_sigmoid_k", 1.2)))


# ── Step 2: Context Multiplier ────────────────────────────────────────────────

def compute_context_multiplier(row: Dict[str, Any], params: Dict[str, Any]) -> float:
    """
    Returns Context_Multiplier ∈ [0.5, 1.8].
    Accounts for opposition Elo, format difficulty, and innings pressure.
    """
    opp_elo  = float(row.get("opposition_elo", 1000.0))
    opp_norm = float(np.clip((opp_elo - 1000.0) / 1000.0, -0.5, 0.5))
    fmt      = str(row.get("format", "T20"))
    fmt_w    = params["format_weight"].get(fmt, 1.0)

    inn_num = int(row.get("innings_number", 1))
    if inn_num == 2:
        inn_w = 1.15
    elif inn_num >= 3:
        inn_w = 1.20
    else:
        inn_w = 1.00

    cm = (1.0 + params["alpha"] * opp_norm) * fmt_w * inn_w
    return float(np.clip(cm, 0.5, 1.8))  # anti-gaming cap


# ── Step 3: Situation Multiplier ──────────────────────────────────────────────

def compute_situation_multiplier(row: Dict[str, Any], params: Dict[str, Any]) -> float:
    """
    Returns Situation_Multiplier ∈ [0.8, 3.0].
    Captures batting pressure, bowling phase, match importance,
    tournament tier, and form-recovery bonus.
    """
    bat  = row.get("batting") or {}
    bowl = row.get("bowling") or {}

    # ── Pressure Index ────────────────────────────────────────────────────────
    has_batting = bat.get("balls_faced", 0) > 0
    rrr = float(bat.get("rrr_at_entry", 0))
    crr = float(bat.get("crr_at_entry", 0))

    if has_batting and rrr > 0 and crr > 0:
        rr_delta = safe_divide(rrr, max(crr, 0.1), 1.0) - 1.0
        wih      = float(bat.get("wickets_in_hand_exit", 5))
        wk_press = 1.0 - (wih / 10.0)
        pressure = float(np.clip(1.0 + params["beta"] * rr_delta * wk_press, 0.8, 2.0))
    elif float(bowl.get("overs_bowled", 0)) > 0:
        phase   = str(bowl.get("match_phase_bowled", "middle"))
        phase_w = PHASE_BOWL_WEIGHTS.get(phase, 1.0)
        pressure = float(np.clip(1.0 + params["gamma"] * (phase_w - 1.0), 0.8, 2.0))
    else:
        pressure = 1.0

    # ── Match Importance ──────────────────────────────────────────────────────
    match_imp = float(row.get("match_importance", 1.0))
    tier      = str(row.get("tournament_tier", "national")).lower()
    tier_mult = TIER_MULTIPLIERS.get(tier, 1.0)
    importance = match_imp * tier_mult

    # ── Form Recovery Bonus ───────────────────────────────────────────────────
    form_bonus = float(row.get("form_recovery_bonus", 1.0))

    return float(np.clip(pressure * importance * form_bonus, 0.8, 3.0))


# ── Step 4: Per-Match Raw Impact ──────────────────────────────────────────────

def compute_raw_impact(
    row: Dict[str, Any],
    params: Dict[str, Any],
    format_stats: Optional[Dict[str, float]] = None,
) -> float:
    """
    Full per-match Raw_Impact = clamp(P × CM × SM, 0, cap).
    """
    ps  = compute_performance_score(row, params, format_stats)
    cm  = compute_context_multiplier(row, params)
    sm  = compute_situation_multiplier(row, params)
    return float(min(ps * cm * sm, params["raw_impact_cap"]))


# ── Step 5: Recency-Weighted Rolling Aggregation ──────────────────────────────

def compute_rolling_im(
    impacts: List[float],
    dates: Optional[List] = None,
    lam: float = 0.15,
    min_innings: int = 3,
) -> Optional[float]:
    """
    Exponential-decay weighted aggregate over last 10 innings (newest-first).
    Returns None if fewer than `min_innings` valid innings.
    """
    valid = [x for x in impacts if x is not None]
    if len(valid) < min_innings:
        return None
    n       = min(len(valid), 10)
    weights = np.array([np.exp(-lam * i) for i in range(n)], dtype=float)
    values  = np.array(valid[:n], dtype=float)
    return float(np.dot(weights, values) / weights.sum())


# ── Step 6: Normalization ─────────────────────────────────────────────────────

def normalize_parametric(
    rolling_im: float,
    mu: float = 0.65,
    sigma: float = 0.28,
    k: float = 0.9,
) -> float:
    """Parametric z → sigmoid → 100 normalization. z=0 → 50.0."""
    z = safe_divide(rolling_im - mu, sigma, 0.0)
    return float(np.clip(100.0 / (1.0 + np.exp(-k * z)), 0.0, 100.0))


def normalize_percentile(
    rolling_im: float,
    all_scores: List[float],
) -> float:
    """Percentile-rank normalization shifted so the median maps exactly to 50."""
    arr = np.array(all_scores, dtype=float)
    if len(arr) == 0:
        return 50.0
    pct        = float(np.mean(arr <= rolling_im)) * 100.0
    median_val = float(np.median(arr))
    median_pct = float(np.mean(arr <= median_val)) * 100.0
    return float(np.clip(pct + (50.0 - median_pct), 0.0, 100.0))


# ── Utilities ─────────────────────────────────────────────────────────────────

def smooth_and_clip(impacts: List[float], iqr_factor: float = 2.0) -> List[float]:
    """IQR-based outlier clipping before rolling aggregation."""
    arr = np.array(impacts, dtype=float)
    if len(arr) < 4:
        return list(arr)
    q1, q3 = float(np.percentile(arr, 25)), float(np.percentile(arr, 75))
    iqr    = q3 - q1
    return list(np.clip(arr, q1 - iqr_factor * iqr, q3 + iqr_factor * iqr))


def detect_trend(im_scores: List[float]) -> str:
    """
    Compare mean of 3 most-recent scores to the 3 before that.
    Returns 'rising', 'falling', or 'stable'.
    """
    if len(im_scores) < 2:
        return "stable"
    recent = im_scores[:3]
    older  = im_scores[3:6] if len(im_scores) >= 6 else im_scores[3:]
    if not older:
        return "stable"
    diff = float(np.mean(recent)) - float(np.mean(older))
    if diff > 5:
        return "rising"
    if diff < -5:
        return "falling"
    return "stable"


def calibrate_population_stats(all_rolling_scores: List[float]) -> Dict[str, float]:
    """Compute μ and σ for parametric normalization calibration."""
    arr = np.array(all_rolling_scores, dtype=float)
    return {
        "mean":   float(np.mean(arr)),
        "std":    float(np.std(arr)),
        "median": float(np.median(arr)),
        "p10":    float(np.percentile(arr, 10)),
        "p90":    float(np.percentile(arr, 90)),
    }
