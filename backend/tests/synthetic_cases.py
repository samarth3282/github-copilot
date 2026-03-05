"""
Synthetic test cases from README Section 12.
Run with: python -m tests.synthetic_cases
"""
from scoring.engine import compute_raw_impact, normalize_parametric

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
FORMAT_STATS = {"sr_baseline": 100.0, "econ_baseline": 8.0, "perf_mean": 15.0, "perf_std": 12.0}
POP_MU, POP_SIGMA = 0.65, 0.28

SYNTHETIC_CASES = [
    {
        "name": "Hero knock under extreme pressure",
        "input": {
            "player_role": "batsman", "format": "T20",
            "innings_number": 2, "match_importance": 1.5,
            "tournament_tier": "international", "opposition_elo": 1300,
            "batting": {
                "runs_scored": 75, "balls_faced": 40, "fours": 6, "sixes": 4,
                "dots_faced": 5, "batting_position": 6,
                "wickets_fallen_entry": 7, "rrr_at_entry": 14.0,
                "crr_at_entry": 8.0, "overs_left_at_entry": 4.0,
                "wickets_in_hand_exit": 2, "match_phase": "death",
            },
        },
        "expected_im_range": [72, 100],
        "comment": "Elite IM expected",
    },
    {
        "name": "Quiet innings in easy match",
        "input": {
            "player_role": "batsman", "format": "T20",
            "innings_number": 1, "match_importance": 0.5,
            "tournament_tier": "club", "opposition_elo": 900,
            "batting": {
                "runs_scored": 25, "balls_faced": 22, "fours": 2, "sixes": 0,
                "dots_faced": 8, "batting_position": 3,
                "wickets_fallen_entry": 0, "rrr_at_entry": 0,
                "crr_at_entry": 8.0, "overs_left_at_entry": 15.0,
                "wickets_in_hand_exit": 9, "match_phase": "middle",
            },
        },
        "expected_im_range": [0, 50],
        "comment": "Below-neutral IM expected",
    },
    {
        "name": "Economy spell in death overs",
        "input": {
            "player_role": "bowler", "format": "T20",
            "innings_number": 2, "match_importance": 1.3,
            "tournament_tier": "national", "opposition_elo": 1100,
            "bowling": {
                "overs_bowled": 4.0, "runs_conceded": 22,
                "wickets_taken": 2, "maidens": 0,
                "dot_balls_bowled": 14, "match_phase_bowled": "death",
            },
        },
        "expected_im_range": [60, 92],
        "comment": "5.5 eco + 2 wkts in death — high impact",
    },
    {
        "name": "Did not bat or bowl",
        "input": {
            "player_role": "batsman", "format": "T20",
            "innings_number": 1, "match_importance": 1.0,
            "tournament_tier": "national", "opposition_elo": 1000,
            "batting": {"runs_scored": 0, "balls_faced": 0},
        },
        "expected_raw_max": 0.25,
        "comment": "Near-zero contribution",
    },
    {
        "name": "Dominant Test century",
        "input": {
            "player_role": "batsman", "format": "Test",
            "innings_number": 1, "match_importance": 1.0,
            "tournament_tier": "national", "opposition_elo": 1200,
            "batting": {
                "runs_scored": 145, "balls_faced": 220, "fours": 18, "sixes": 2,
                "dots_faced": 50, "batting_position": 4,
                "wickets_fallen_entry": 2, "match_phase": "middle",
            },
        },
        "expected_im_range": [65, 100],
        "comment": "Quality Test century — high impact",
    },
]


def run_synthetic_tests(verbose: bool = True) -> bool:
    all_passed = True
    for case in SYNTHETIC_CASES:
        ri = compute_raw_impact(case["input"], PARAMS, FORMAT_STATS)
        im = normalize_parametric(ri, mu=POP_MU, sigma=POP_SIGMA)

        expected_range = case.get("expected_im_range")
        expected_raw   = case.get("expected_raw_max")

        if expected_range:
            passed = expected_range[0] <= im <= expected_range[1]
        else:
            passed = ri <= expected_raw

        status = "PASS" if passed else "FAIL"
        if not passed:
            all_passed = False

        if verbose:
            detail = f"IM={im:.1f} (expected {expected_range})" if expected_range else \
                     f"raw_impact={ri:.3f} (expected ≤ {expected_raw})"
            print(f"[{status}] {case['name']} | {detail} | {case['comment']}")

    return all_passed


if __name__ == "__main__":
    import sys
    ok = run_synthetic_tests(verbose=True)
    sys.exit(0 if ok else 1)
