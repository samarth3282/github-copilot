"""
Cricket Impact Metric — Monitoring
Jensen-Shannon divergence based distribution drift detection.
"""
import numpy as np
from typing import Dict, List


def check_distribution_drift(
    current_scores: List[float],
    baseline_scores: List[float],
    threshold: float = 0.1,
) -> Dict[str, object]:
    """
    Detect distribution drift using Jensen-Shannon divergence.
    JSD > threshold triggers an alert.

    Args:
        current_scores:  Latest batch of IM scores (0-100).
        baseline_scores: Historical baseline IM scores.
        threshold:       JSD alert threshold (default 0.1).

    Returns:
        dict with keys: jsd (float), alert (bool), current_stats, baseline_stats.
    """
    bins = np.linspace(0, 100, 21)

    def _hist(scores):
        h, _ = np.histogram(scores, bins=bins, density=True)
        h    = h + 1e-9
        return h / h.sum()

    p_curr = _hist(current_scores)
    p_base = _hist(baseline_scores)

    # Jensen-Shannon divergence (symmetric, bounded [0,1])
    m   = 0.5 * (p_curr + p_base)
    jsd = float(0.5 * np.sum(p_curr * np.log(p_curr / m)) +
                0.5 * np.sum(p_base * np.log(p_base / m)))

    def _stats(arr):
        a = np.array(arr, dtype=float)
        return {
            "mean":   round(float(np.mean(a)), 2),
            "std":    round(float(np.std(a)), 2),
            "median": round(float(np.median(a)), 2),
            "p10":    round(float(np.percentile(a, 10)), 2),
            "p90":    round(float(np.percentile(a, 90)), 2),
            "count":  len(a),
        }

    return {
        "jsd":             round(jsd, 4),
        "alert":           jsd > threshold,
        "threshold":       threshold,
        "current_stats":   _stats(current_scores),
        "baseline_stats":  _stats(baseline_scores),
    }


def check_null_rate(
    total_players: int,
    null_score_players: int,
    threshold: float = 0.20,
) -> Dict[str, object]:
    """Alert when > `threshold` fraction of active players have no valid IM."""
    rate = null_score_players / max(total_players, 1)
    return {
        "null_rate": round(rate, 4),
        "alert":     rate > threshold,
        "threshold": threshold,
    }


def check_player_spike(
    current_im: float,
    previous_im: float,
    spike_threshold: float = 30.0,
) -> Dict[str, object]:
    """Alert when a single match causes an IM jump > spike_threshold points."""
    delta = abs(current_im - previous_im)
    return {
        "delta":     round(delta, 2),
        "alert":     delta > spike_threshold,
        "threshold": spike_threshold,
    }
