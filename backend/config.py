"""
Cricket Impact Metric — Central Configuration
All hyperparameters and environment settings live here.
"""
import os
from typing import Dict, Any

# ── Default system hyperparameters ────────────────────────────────────────────
PARAMS: Dict[str, Any] = {
    # Performance weights (batting)
    "w_runs": 1.0,
    "w_sr": 0.015,          # per SR point above baseline
    "w_boundaries": 0.5,
    "w_dots_avoided": 0.3,

    # Performance weights (bowling)
    "w_wkts": 2.5,
    "w_econ": 0.4,
    "w_dots": 0.02,
    "w_maidens": 1.0,

    # Fielding weights
    "w_catch": 1.0,
    "w_runout": 1.5,
    "w_stumping": 0.5,      # caps WK inflation (see anti-gaming rules)

    # Context multiplier coefficients
    "alpha": 0.4,           # opposition rating scaling
    "format_weight": {"T20": 1.0, "ODI": 1.1, "Test": 1.2, "T10": 0.9},

    # Situation multiplier coefficients
    "beta": 0.3,            # batting pressure scaling
    "gamma": 0.25,          # bowling pressure scaling

    # Recency decay
    "lambda": 0.15,         # exponential decay rate for rolling window

    # Normalization
    "sigmoid_k": 0.9,       # parametric normalization steepness
    "perf_sigmoid_k": 1.2,  # performance score sigmoid steepness

    # Robustness / anti-gaming
    "min_innings": 3,       # minimum innings for a valid IM score
    "raw_impact_cap": 2.0,  # per-match impact ceiling

    # Population defaults (updated by calibration; see Section 6.3)
    "pop_mean": 0.65,
    "pop_std": 0.28,
}

# ── Format-specific baselines ─────────────────────────────────────────────────
FORMAT_STATS: Dict[str, Dict[str, float]] = {
    "T20":  {"sr_baseline": 100.0, "econ_baseline": 8.0,  "perf_mean": 15.0, "perf_std": 12.0},
    "T10":  {"sr_baseline": 120.0, "econ_baseline": 10.0, "perf_mean": 10.0, "perf_std": 8.0},
    "ODI":  {"sr_baseline": 75.0,  "econ_baseline": 5.5,  "perf_mean": 20.0, "perf_std": 15.0},
    "Test": {"sr_baseline": 50.0,  "econ_baseline": 3.5,  "perf_mean": 30.0, "perf_std": 20.0},
}

# ── Environment settings ──────────────────────────────────────────────────────
DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql://im_user:im_pass@localhost:5432/impact_metric",
)
REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")
DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
