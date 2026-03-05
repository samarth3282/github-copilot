"""
Cricket Impact Metric — Data-Driven Weight Optimizer
=====================================================
Learns optimal feature weights from historical match contributions by
fitting a logistic regression on win/loss outcomes (player_team_won).

Unlike hand-tuned weights, these are derived purely from data:
- Feature: per-contribution stats (runs, SR above base, economy saving, …)
- Target: player_team_won (binary — did this player's team win?)
- Method: scipy.optimize.minimize with logistic loss (equivalent to
          logistic regression without sklearn dependency) + bounds
          that enforce cricket-sensible ranges.

The key intuition: if a contribution *truly* creates impact, it should
statistically correlate with match wins. Weights that maximise this
discriminative power are by definition "data-driven".

Usage:
    from training.optimizer import fit_impact_weights, apply_weights
    result = fit_impact_weights(db_session, FORMAT_STATS)
    if result:
        apply_weights(result["weights"], PARAMS)
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from scipy.optimize import minimize
from sqlalchemy.orm import Session

from db.models import MatchContribution

logger = logging.getLogger(__name__)

# ── Feature layout ────────────────────────────────────────────────────────────
# Indices must match _build_feature_matrix() columns exactly.
FEATURE_NAMES = [
    "runs",           # 0
    "sr_above_base",  # 1  strike-rate premium over format baseline (per point)
    "boundaries",     # 2
    "dots_avoided",   # 3  fraction [0,1]
    "wickets",        # 4
    "econ_saving",    # 5  (baseline_econ - actual_econ)
    "dot_pct_bowl",   # 6  bowling dot-ball fraction
    "maidens",        # 7
    "catches",        # 8
    "run_outs",       # 9
]

# Hard bounds per weight: (lo, hi). Derived from cricket domain knowledge.
# These prevent the optimiser from assigning nonsensical values.
WEIGHT_BOUNDS: List[Tuple[float, float]] = [
    (0.10, 3.00),  # w_runs
    (0.00, 0.05),  # w_sr           (small — SR is measured in 0-200 range)
    (0.10, 2.00),  # w_boundaries
    (0.00, 1.00),  # w_dots_avoided
    (0.50, 5.00),  # w_wkts
    (0.00, 2.00),  # w_econ_saving
    (0.00, 0.50),  # w_dot_pct_bowl
    (0.00, 2.00),  # w_maidens
    (0.10, 2.00),  # w_catch
    (0.10, 3.00),  # w_runout
]

# Starting values — the prior (hand-tuned) weights as warm-start.
# The optimiser will move away from these if data supports it.
W0: np.ndarray = np.array([1.0, 0.015, 0.5, 0.3, 2.5, 0.4, 0.02, 1.0, 1.0, 1.5])


# ── Feature construction ──────────────────────────────────────────────────────

def _build_feature_matrix(
    contributions: List[MatchContribution],
    format_stats_map: Dict[str, Dict[str, float]],
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Build (X, y) from contributions with known outcomes.
    Returns shapes (N, 10) and (N,) respectively.
    """
    X_rows, y_vals = [], []
    for c in contributions:
        if c.player_team_won is None:
            continue

        fmt = c.format or "T20"
        fs  = format_stats_map.get(fmt, format_stats_map.get("T20", {}))
        sr_base   = float(fs.get("sr_baseline",   100.0))
        econ_base = float(fs.get("econ_baseline",   8.0))

        runs  = float(c.runs_scored or 0)
        balls = float(c.balls_faced or 0)
        sr_above  = (runs / balls * 100.0 - sr_base) if balls > 0 else 0.0
        boundaries = float((c.fours or 0) + (c.sixes or 0))
        dots_avoided = 1.0 - float(c.dots_faced or 0) / max(balls, 1.0)

        wkts  = float(c.wickets_taken or 0)
        overs = float(c.overs_bowled or 0)
        rc    = float(c.runs_conceded or 0)
        # partial over handling (e.g. 3.4 = 3 complete + 4 balls)
        full_ov = int(overs)
        partial = round((overs % 1) * 10)
        balls_b = full_ov * 6 + partial
        eco = rc / overs if overs > 0 else econ_base
        econ_saving  = econ_base - eco
        dot_pct_bowl = float(c.dot_balls_bowled or 0) / max(balls_b, 1)
        maidens = float(c.maidens or 0)

        catches  = float(c.catches or 0)
        run_outs = float(c.run_outs or 0)

        X_rows.append([
            runs, sr_above, boundaries, dots_avoided,
            wkts, econ_saving, dot_pct_bowl, maidens,
            catches, run_outs,
        ])
        y_vals.append(1 if c.player_team_won else 0)

    if not X_rows:
        return np.empty((0, len(FEATURE_NAMES))), np.empty(0)
    return np.array(X_rows, dtype=np.float64), np.array(y_vals, dtype=np.float64)


# ── Loss function ─────────────────────────────────────────────────────────────

def _logistic_loss(w: np.ndarray, X: np.ndarray, y: np.ndarray, l2: float = 0.01) -> float:
    """
    Negative log-likelihood of logistic model: P(win) = sigmoid(X @ w).
    L2 regularisation (λ=0.01) prevents weights from diverging on sparse data.
    """
    scores = X @ w
    # Numerically stable log-sigmoid
    log_p  = np.where(scores >= 0,
                      -np.log1p(np.exp(-scores)),
                      scores - np.log1p(np.exp(scores)))
    log_1p = np.where(scores >= 0,
                      -scores - np.log1p(np.exp(-scores)),
                      -np.log1p(np.exp(scores)))
    nll = -np.mean(y * log_p + (1 - y) * log_1p)
    return nll + l2 * np.dot(w, w)


def _logistic_grad(w: np.ndarray, X: np.ndarray, y: np.ndarray, l2: float = 0.01) -> np.ndarray:
    """Analytical gradient of logistic loss (used by L-BFGS-B)."""
    p = 1.0 / (1.0 + np.exp(-X @ w))
    return X.T @ (p - y) / len(y) + 2.0 * l2 * w


# ── Public API ────────────────────────────────────────────────────────────────

def fit_impact_weights(
    db: Session,
    format_stats_map: Dict[str, Dict[str, float]],
    format_filter: Optional[str] = None,
    min_samples: int = 20,
) -> Optional[Dict[str, Any]]:
    """
    Learn optimal feature weights from historical contributions.

    Parameters
    ----------
    db               : SQLAlchemy session
    format_stats_map : FORMAT_STATS from config.py
    format_filter    : limit learning to one format (None = all formats)
    min_samples      : minimum contributions with known outcomes required

    Returns
    -------
    dict with keys:
        weights   – new PARAMS-compatible weight dict
        n_samples – number of training examples used
        win_rate  – base rate in training set
        accuracy  – in-sample classification accuracy
        log_loss  – final logistic loss (lower = better fit)
        coefs     – raw learned coefficients (for interpretability)
    or None if insufficient data.
    """
    from db import crud
    contributions = crud.get_contributions_with_outcomes(db, format_filter)
    X, y = _build_feature_matrix(contributions, format_stats_map)

    n = len(y)
    if n < min_samples:
        logger.info(
            "Weight optimiser: only %d labelled samples (need ≥ %d). "
            "Using prior weights.", n, min_samples
        )
        return None

    if len(set(y.tolist())) < 2:
        logger.warning("Weight optimiser: all outcomes identical — skipping.")
        return None

    logger.info("Weight optimiser: fitting on %d samples (win_rate=%.2f).", n, y.mean())

    # L-BFGS-B: gradient-based, respects box constraints efficiently.
    result = minimize(
        fun=_logistic_loss,
        x0=W0.copy(),
        args=(X, y),
        jac=_logistic_grad,
        method="L-BFGS-B",
        bounds=WEIGHT_BOUNDS,
        options={"maxiter": 1000, "ftol": 1e-9},
    )

    w_opt = result.x

    # In-sample accuracy
    probs = 1.0 / (1.0 + np.exp(-X @ w_opt))
    preds = (probs >= 0.5).astype(int)
    accuracy = float((preds == y).mean())

    weights = {
        "w_runs":         round(float(w_opt[0]), 4),
        "w_sr":           round(float(w_opt[1]), 5),
        "w_boundaries":   round(float(w_opt[2]), 4),
        "w_dots_avoided": round(float(w_opt[3]), 4),
        "w_wkts":         round(float(w_opt[4]), 4),
        "w_econ":         round(float(w_opt[5]), 4),
        "w_dots":         round(float(w_opt[6]), 4),
        "w_maidens":      round(float(w_opt[7]), 4),
        "w_catch":        round(float(w_opt[8]), 4),
        "w_runout":       round(float(w_opt[9]), 4),
    }

    return {
        "weights":   weights,
        "n_samples": int(n),
        "win_rate":  round(float(y.mean()), 4),
        "accuracy":  round(accuracy, 4),
        "log_loss":  round(float(result.fun), 6),
        "converged": bool(result.success),
        "feature_importance": {
            name: round(float(w_opt[i]), 5)
            for i, name in enumerate(FEATURE_NAMES)
        },
    }


def apply_weights(learned_weights: Dict[str, float], params: Dict[str, Any]) -> None:
    """Merge learned weights into the live PARAMS dict (in-place)."""
    params.update(learned_weights)
    logger.info("PARAMS updated with learned weights: %s", learned_weights)
