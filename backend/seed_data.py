"""
Seed script — populates the database with realistic sample data.
Run once after starting the DB:
    cd backend
    python seed_data.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import date
from db.database import engine, SessionLocal, Base
from db import models  # noqa - registers ORM metadata
from etl.pipeline import ImpactMetricPipeline

# Create all tables
Base.metadata.create_all(bind=engine)

# ── Player definitions ────────────────────────────────────────────────────────
PLAYERS = [
    {"player_id": "P001", "name": "Rohit Sharma",   "primary_role": "allrounder",  "team_id": "MI"},
    {"player_id": "P002", "name": "Virat Kohli",    "primary_role": "batsman",     "team_id": "RCB"},
    {"player_id": "P003", "name": "Jasprit Bumrah", "primary_role": "bowler",      "team_id": "MI"},
    {"player_id": "P004", "name": "Hardik Pandya",  "primary_role": "allrounder",  "team_id": "GT"},
    {"player_id": "P005", "name": "KL Rahul",       "primary_role": "wk-batsman",  "team_id": "LSG"},
    {"player_id": "P006", "name": "Ravindra Jadeja", "primary_role": "allrounder", "team_id": "CSK"},
    {"player_id": "P007", "name": "Shubman Gill",   "primary_role": "batsman",     "team_id": "GT"},
]

# ── Match contribution sequences ──────────────────────────────────────────────
# Each entry becomes one POST /compute call (processes chronologically so rolling window builds)

CONTRIBUTIONS = [
    # ── P001 (all-rounder, strong recent form) ────────────────────────────────
    {
        "match_id": "M001", "player_id": "P001", "player_name": "Rohit Sharma",
        "team_id": "MI", "match_date": "2025-11-10", "format": "T20",
        "innings_number": 1, "match_importance": 1.0, "tournament_tier": "national",
        "opposition_elo": 1080, "player_role": "allrounder", "player_team_won": True,
        "batting": {"runs_scored": 55, "balls_faced": 38, "fours": 5, "sixes": 2, "dots_faced": 8,
                    "batting_position": 1, "wickets_fallen_entry": 0, "rrr_at_entry": 0,
                    "crr_at_entry": 7.5, "overs_left_at_entry": 20, "wickets_in_hand_exit": 8,
                    "match_phase": "powerplay"},
        "bowling": {"overs_bowled": 2.0, "runs_conceded": 16, "wickets_taken": 1,
                    "maidens": 0, "dot_balls_bowled": 5, "match_phase_bowled": "middle"},
    },
    {
        "match_id": "M002", "player_id": "P001", "player_name": "Rohit Sharma",
        "team_id": "MI", "match_date": "2025-11-17", "format": "T20",
        "innings_number": 2, "match_importance": 1.0, "tournament_tier": "national",
        "opposition_elo": 1050, "player_role": "allrounder", "player_team_won": False,
        "batting": {"runs_scored": 22, "balls_faced": 20, "fours": 2, "sixes": 0, "dots_faced": 9,
                    "batting_position": 1, "wickets_fallen_entry": 1, "rrr_at_entry": 9.5,
                    "crr_at_entry": 7.0, "overs_left_at_entry": 13, "wickets_in_hand_exit": 7,
                    "match_phase": "middle"},
        "bowling": {"overs_bowled": 4.0, "runs_conceded": 28, "wickets_taken": 2,
                    "maidens": 0, "dot_balls_bowled": 10, "match_phase_bowled": "middle"},
    },
    {
        "match_id": "M003", "player_id": "P001", "player_name": "Rohit Sharma",
        "team_id": "MI", "match_date": "2025-11-24", "format": "T20",
        "innings_number": 2, "match_importance": 1.3, "tournament_tier": "national",
        "opposition_elo": 1120, "player_role": "allrounder", "player_team_won": True,
        "batting": {"runs_scored": 78, "balls_faced": 48, "fours": 7, "sixes": 3, "dots_faced": 7,
                    "batting_position": 1, "wickets_fallen_entry": 3, "rrr_at_entry": 12.0,
                    "crr_at_entry": 7.8, "overs_left_at_entry": 9, "wickets_in_hand_exit": 5,
                    "match_phase": "death"},
        "bowling": {"overs_bowled": 3.0, "runs_conceded": 22, "wickets_taken": 2,
                    "maidens": 0, "dot_balls_bowled": 8, "match_phase_bowled": "death"},
    },
    {
        "match_id": "M004", "player_id": "P001", "player_name": "Rohit Sharma",
        "team_id": "MI", "match_date": "2025-12-01", "format": "T20",
        "innings_number": 1, "match_importance": 1.0, "tournament_tier": "national",
        "opposition_elo": 1000, "player_role": "allrounder", "player_team_won": True,
        "batting": {"runs_scored": 45, "balls_faced": 30, "fours": 4, "sixes": 1, "dots_faced": 6,
                    "batting_position": 1, "wickets_fallen_entry": 0, "rrr_at_entry": 0,
                    "crr_at_entry": 8.0, "overs_left_at_entry": 20, "wickets_in_hand_exit": 9,
                    "match_phase": "powerplay"},
        "bowling": {"overs_bowled": 4.0, "runs_conceded": 26, "wickets_taken": 3,
                    "maidens": 0, "dot_balls_bowled": 14, "match_phase_bowled": "middle"},
    },
    {
        "match_id": "M005", "player_id": "P001", "player_name": "Rohit Sharma",
        "team_id": "MI", "match_date": "2025-12-15", "format": "T20",
        "innings_number": 2, "match_importance": 1.5, "tournament_tier": "national",
        "opposition_elo": 1180, "player_role": "allrounder", "player_team_won": True,
        "batting": {"runs_scored": 68, "balls_faced": 42, "fours": 5, "sixes": 3, "dots_faced": 8,
                    "batting_position": 1, "wickets_fallen_entry": 5, "rrr_at_entry": 11.5,
                    "crr_at_entry": 8.2, "overs_left_at_entry": 7, "wickets_in_hand_exit": 4,
                    "match_phase": "death"},
        "bowling": {"overs_bowled": 4.0, "runs_conceded": 31, "wickets_taken": 2,
                    "maidens": 0, "dot_balls_bowled": 12, "match_phase_bowled": "death"},
        "fielding": {"catches": 1, "run_outs": 0, "stumpings": 0},
    },

    # ── P002 (batsman, very consistent) ──────────────────────────────────────
    {
        "match_id": "M001", "player_id": "P002", "player_name": "Virat Kohli",
        "team_id": "RCB", "match_date": "2025-11-10", "format": "T20",
        "innings_number": 2, "match_importance": 1.0, "tournament_tier": "national",
        "opposition_elo": 1090, "player_role": "batsman", "player_team_won": True,
        "batting": {"runs_scored": 72, "balls_faced": 54, "fours": 6, "sixes": 2, "dots_faced": 12,
                    "batting_position": 3, "wickets_fallen_entry": 1, "rrr_at_entry": 10.2,
                    "crr_at_entry": 8.0, "overs_left_at_entry": 12, "wickets_in_hand_exit": 6,
                    "match_phase": "middle"},
    },
    {
        "match_id": "M002", "player_id": "P002", "player_name": "Virat Kohli",
        "team_id": "RCB", "match_date": "2025-11-17", "format": "T20",
        "innings_number": 2, "match_importance": 1.0, "tournament_tier": "national",
        "opposition_elo": 1100, "player_role": "batsman", "player_team_won": False,
        "batting": {"runs_scored": 38, "balls_faced": 31, "fours": 3, "sixes": 1, "dots_faced": 9,
                    "batting_position": 3, "wickets_fallen_entry": 2, "rrr_at_entry": 11.0,
                    "crr_at_entry": 7.5, "overs_left_at_entry": 10, "wickets_in_hand_exit": 5,
                    "match_phase": "middle"},
    },
    {
        "match_id": "M003", "player_id": "P002", "player_name": "Virat Kohli",
        "team_id": "RCB", "match_date": "2025-11-24", "format": "T20",
        "innings_number": 1, "match_importance": 1.3, "tournament_tier": "national",
        "opposition_elo": 1050, "player_role": "batsman", "player_team_won": True,
        "batting": {"runs_scored": 85, "balls_faced": 58, "fours": 8, "sixes": 4, "dots_faced": 10,
                    "batting_position": 3, "wickets_fallen_entry": 0, "rrr_at_entry": 0,
                    "crr_at_entry": 8.5, "overs_left_at_entry": 18.5, "wickets_in_hand_exit": 9,
                    "match_phase": "middle"},
    },
    {
        "match_id": "M006", "player_id": "P002", "player_name": "Virat Kohli",
        "team_id": "RCB", "match_date": "2025-12-08", "format": "T20",
        "innings_number": 2, "match_importance": 1.0, "tournament_tier": "national",
        "opposition_elo": 1060, "player_role": "batsman", "player_team_won": True,
        "batting": {"runs_scored": 61, "balls_faced": 44, "fours": 5, "sixes": 2, "dots_faced": 10,
                    "batting_position": 3, "wickets_fallen_entry": 2, "rrr_at_entry": 9.8,
                    "crr_at_entry": 7.5, "overs_left_at_entry": 11, "wickets_in_hand_exit": 6,
                    "match_phase": "middle"},
    },
    {
        "match_id": "M007", "player_id": "P002", "player_name": "Virat Kohli",
        "team_id": "RCB", "match_date": "2026-01-05", "format": "T20",
        "innings_number": 2, "match_importance": 1.5, "tournament_tier": "international",
        "opposition_elo": 1220, "player_role": "batsman", "player_team_won": True,
        "batting": {"runs_scored": 95, "balls_faced": 60, "fours": 10, "sixes": 5, "dots_faced": 8,
                    "batting_position": 3, "wickets_fallen_entry": 4, "rrr_at_entry": 13.0,
                    "crr_at_entry": 8.5, "overs_left_at_entry": 8, "wickets_in_hand_exit": 4,
                    "match_phase": "death"},
    },

    # ── P003 (bowler, elite) ───────────────────────────────────────────────────
    {
        "match_id": "M001", "player_id": "P003", "player_name": "Jasprit Bumrah",
        "team_id": "MI", "match_date": "2025-11-10", "format": "T20",
        "innings_number": 1, "match_importance": 1.0, "tournament_tier": "national",
        "opposition_elo": 1080, "player_role": "bowler", "player_team_won": True,
        "bowling": {"overs_bowled": 4.0, "runs_conceded": 20, "wickets_taken": 3,
                    "maidens": 0, "dot_balls_bowled": 14, "match_phase_bowled": "death"},
    },
    {
        "match_id": "M002", "player_id": "P003", "player_name": "Jasprit Bumrah",
        "team_id": "MI", "match_date": "2025-11-17", "format": "T20",
        "innings_number": 1, "match_importance": 1.0, "tournament_tier": "national",
        "opposition_elo": 1050, "player_role": "bowler", "player_team_won": False,
        "bowling": {"overs_bowled": 4.0, "runs_conceded": 27, "wickets_taken": 1,
                    "maidens": 0, "dot_balls_bowled": 11, "match_phase_bowled": "middle"},
    },
    {
        "match_id": "M003", "player_id": "P003", "player_name": "Jasprit Bumrah",
        "team_id": "MI", "match_date": "2025-11-24", "format": "T20",
        "innings_number": 1, "match_importance": 1.3, "tournament_tier": "national",
        "opposition_elo": 1120, "player_role": "bowler", "player_team_won": True,
        "bowling": {"overs_bowled": 4.0, "runs_conceded": 18, "wickets_taken": 3,
                    "maidens": 1, "dot_balls_bowled": 16, "match_phase_bowled": "death"},
    },
    {
        "match_id": "M005", "player_id": "P003", "player_name": "Jasprit Bumrah",
        "team_id": "MI", "match_date": "2025-12-15", "format": "T20",
        "innings_number": 1, "match_importance": 1.5, "tournament_tier": "national",
        "opposition_elo": 1180, "player_role": "bowler", "player_team_won": True,
        "bowling": {"overs_bowled": 4.0, "runs_conceded": 16, "wickets_taken": 4,
                    "maidens": 1, "dot_balls_bowled": 18, "match_phase_bowled": "death"},
    },
    {
        "match_id": "M007", "player_id": "P003", "player_name": "Jasprit Bumrah",
        "team_id": "MI", "match_date": "2026-01-05", "format": "T20",
        "innings_number": 1, "match_importance": 1.5, "tournament_tier": "international",
        "opposition_elo": 1220, "player_role": "bowler", "player_team_won": True,
        "bowling": {"overs_bowled": 4.0, "runs_conceded": 22, "wickets_taken": 3,
                    "maidens": 0, "dot_balls_bowled": 15, "match_phase_bowled": "death"},
    },

    # ── P004 (all-rounder) ────────────────────────────────────────────────────
    {
        "match_id": "M001", "player_id": "P004", "player_name": "Hardik Pandya",
        "team_id": "GT", "match_date": "2025-11-10", "format": "T20",
        "innings_number": 2, "match_importance": 1.0, "tournament_tier": "national",
        "opposition_elo": 1060, "player_role": "allrounder", "player_team_won": False,
        "batting": {"runs_scored": 32, "balls_faced": 22, "fours": 3, "sixes": 1, "dots_faced": 7,
                    "batting_position": 6, "wickets_fallen_entry": 4, "rrr_at_entry": 11.0,
                    "crr_at_entry": 8.0, "overs_left_at_entry": 6, "wickets_in_hand_exit": 4,
                    "match_phase": "death"},
        "bowling": {"overs_bowled": 4.0, "runs_conceded": 35, "wickets_taken": 1,
                    "maidens": 0, "dot_balls_bowled": 9, "match_phase_bowled": "death"},
    },
    {
        "match_id": "M002", "player_id": "P004", "player_name": "Hardik Pandya",
        "team_id": "GT", "match_date": "2025-11-17", "format": "T20",
        "innings_number": 1, "match_importance": 1.0, "tournament_tier": "national",
        "opposition_elo": 1040, "player_role": "allrounder", "player_team_won": True,
        "batting": {"runs_scored": 58, "balls_faced": 35, "fours": 5, "sixes": 3, "dots_faced": 6,
                    "batting_position": 5, "wickets_fallen_entry": 2, "rrr_at_entry": 0,
                    "crr_at_entry": 9.0, "overs_left_at_entry": 12, "wickets_in_hand_exit": 7,
                    "match_phase": "middle"},
        "bowling": {"overs_bowled": 4.0, "runs_conceded": 30, "wickets_taken": 2,
                    "maidens": 0, "dot_balls_bowled": 11, "match_phase_bowled": "middle"},
    },
    {
        "match_id": "M004", "player_id": "P004", "player_name": "Hardik Pandya",
        "team_id": "GT", "match_date": "2025-12-01", "format": "T20",
        "innings_number": 2, "match_importance": 1.3, "tournament_tier": "national",
        "opposition_elo": 1090, "player_role": "allrounder", "player_team_won": True,
        "batting": {"runs_scored": 47, "balls_faced": 30, "fours": 4, "sixes": 2, "dots_faced": 7,
                    "batting_position": 6, "wickets_fallen_entry": 5, "rrr_at_entry": 12.5,
                    "crr_at_entry": 8.0, "overs_left_at_entry": 5, "wickets_in_hand_exit": 3,
                    "match_phase": "death"},
        "bowling": {"overs_bowled": 4.0, "runs_conceded": 29, "wickets_taken": 2,
                    "maidens": 0, "dot_balls_bowled": 12, "match_phase_bowled": "death"},
    },

    # ── P005 (wk-batsman) ─────────────────────────────────────────────────────
    {
        "match_id": "M001", "player_id": "P005", "player_name": "KL Rahul",
        "team_id": "LSG", "match_date": "2025-11-10", "format": "T20",
        "innings_number": 2, "match_importance": 1.0, "tournament_tier": "national",
        "opposition_elo": 1070, "player_role": "wk-batsman", "player_team_won": True,
        "batting": {"runs_scored": 65, "balls_faced": 47, "fours": 6, "sixes": 2, "dots_faced": 11,
                    "batting_position": 1, "wickets_fallen_entry": 0, "rrr_at_entry": 9.0,
                    "crr_at_entry": 7.0, "overs_left_at_entry": 15, "wickets_in_hand_exit": 7,
                    "match_phase": "middle"},
        "fielding": {"catches": 2, "run_outs": 1, "stumpings": 1, "is_wicketkeeper": True},
    },
    {
        "match_id": "M003", "player_id": "P005", "player_name": "KL Rahul",
        "team_id": "LSG", "match_date": "2025-11-24", "format": "T20",
        "innings_number": 1, "match_importance": 1.0, "tournament_tier": "national",
        "opposition_elo": 1030, "player_role": "wk-batsman", "player_team_won": False,
        "batting": {"runs_scored": 42, "balls_faced": 35, "fours": 4, "sixes": 1, "dots_faced": 8,
                    "batting_position": 1, "wickets_fallen_entry": 0, "rrr_at_entry": 0,
                    "crr_at_entry": 7.0, "overs_left_at_entry": 20, "wickets_in_hand_exit": 8,
                    "match_phase": "powerplay"},
        "fielding": {"catches": 1, "run_outs": 0, "stumpings": 0, "is_wicketkeeper": True},
    },
    {
        "match_id": "M006", "player_id": "P005", "player_name": "KL Rahul",
        "team_id": "LSG", "match_date": "2025-12-08", "format": "T20",
        "innings_number": 2, "match_importance": 1.0, "tournament_tier": "national",
        "opposition_elo": 1050, "player_role": "wk-batsman", "player_team_won": True,
        "batting": {"runs_scored": 50, "balls_faced": 38, "fours": 5, "sixes": 1, "dots_faced": 9,
                    "batting_position": 1, "wickets_fallen_entry": 1, "rrr_at_entry": 9.5,
                    "crr_at_entry": 7.8, "overs_left_at_entry": 12, "wickets_in_hand_exit": 7,
                    "match_phase": "middle"},
        "fielding": {"catches": 2, "run_outs": 0, "stumpings": 2, "is_wicketkeeper": True},
    },

    # ── P006 (all-rounder, Jadeja-style spinner) ──────────────────────────────
    {
        "match_id": "M002", "player_id": "P006", "player_name": "Ravindra Jadeja",
        "team_id": "CSK", "match_date": "2025-11-17", "format": "T20",
        "innings_number": 1, "match_importance": 1.0, "tournament_tier": "national",
        "opposition_elo": 1050, "player_role": "allrounder", "player_team_won": True,
        "batting": {"runs_scored": 35, "balls_faced": 20, "fours": 3, "sixes": 2, "dots_faced": 4,
                    "batting_position": 7, "wickets_fallen_entry": 5, "match_phase": "death"},
        "bowling": {"overs_bowled": 4.0, "runs_conceded": 24, "wickets_taken": 2,
                    "maidens": 1, "dot_balls_bowled": 13, "match_phase_bowled": "middle"},
        "fielding": {"catches": 2, "run_outs": 1, "stumpings": 0},
    },
    {
        "match_id": "M004", "player_id": "P006", "player_name": "Ravindra Jadeja",
        "team_id": "CSK", "match_date": "2025-12-01", "format": "T20",
        "innings_number": 2, "match_importance": 1.0, "tournament_tier": "national",
        "opposition_elo": 1030, "player_role": "allrounder", "player_team_won": True,
        "batting": {"runs_scored": 28, "balls_faced": 16, "fours": 2, "sixes": 2, "dots_faced": 3,
                    "batting_position": 7, "wickets_fallen_entry": 4, "rrr_at_entry": 10.0,
                    "crr_at_entry": 7.5, "overs_left_at_entry": 5, "wickets_in_hand_exit": 4,
                    "match_phase": "death"},
        "bowling": {"overs_bowled": 4.0, "runs_conceded": 28, "wickets_taken": 1,
                    "maidens": 0, "dot_balls_bowled": 12, "match_phase_bowled": "middle"},
        "fielding": {"catches": 1, "run_outs": 0, "stumpings": 0},
    },
    {
        "match_id": "M005", "player_id": "P006", "player_name": "Ravindra Jadeja",
        "team_id": "CSK", "match_date": "2025-12-15", "format": "T20",
        "innings_number": 1, "match_importance": 1.5, "tournament_tier": "national",
        "opposition_elo": 1140, "player_role": "allrounder", "player_team_won": False,
        "batting": {"runs_scored": 14, "balls_faced": 12, "fours": 1, "sixes": 0, "dots_faced": 5,
                    "batting_position": 7, "wickets_fallen_entry": 6, "match_phase": "death"},
        "bowling": {"overs_bowled": 4.0, "runs_conceded": 32, "wickets_taken": 1,
                    "maidens": 0, "dot_balls_bowled": 10, "match_phase_bowled": "middle"},
        "fielding": {"catches": 1, "run_outs": 0, "stumpings": 0},
    },

    # ── P007 (batsman, young opener) ──────────────────────────────────────────
    {
        "match_id": "M003", "player_id": "P007", "player_name": "Shubman Gill",
        "team_id": "GT", "match_date": "2025-11-24", "format": "T20",
        "innings_number": 1, "match_importance": 1.0, "tournament_tier": "national",
        "opposition_elo": 1060, "player_role": "batsman", "player_team_won": True,
        "batting": {"runs_scored": 62, "balls_faced": 44, "fours": 7, "sixes": 2, "dots_faced": 9,
                    "batting_position": 1, "wickets_fallen_entry": 0, "rrr_at_entry": 0,
                    "crr_at_entry": 9.0, "overs_left_at_entry": 20, "wickets_in_hand_exit": 9,
                    "match_phase": "powerplay"},
    },
    {
        "match_id": "M004", "player_id": "P007", "player_name": "Shubman Gill",
        "team_id": "GT", "match_date": "2025-12-01", "format": "T20",
        "innings_number": 1, "match_importance": 1.0, "tournament_tier": "national",
        "opposition_elo": 1040, "player_role": "batsman", "player_team_won": False,
        "batting": {"runs_scored": 18, "balls_faced": 17, "fours": 1, "sixes": 0, "dots_faced": 8,
                    "batting_position": 1, "wickets_fallen_entry": 0, "rrr_at_entry": 0,
                    "crr_at_entry": 7.0, "overs_left_at_entry": 20, "wickets_in_hand_exit": 8,
                    "match_phase": "powerplay"},
    },
    {
        "match_id": "M006", "player_id": "P007", "player_name": "Shubman Gill",
        "team_id": "GT", "match_date": "2025-12-08", "format": "T20",
        "innings_number": 2, "match_importance": 1.0, "tournament_tier": "national",
        "opposition_elo": 1070, "player_role": "batsman", "player_team_won": True,
        "batting": {"runs_scored": 75, "balls_faced": 50, "fours": 8, "sixes": 3, "dots_faced": 8,
                    "batting_position": 1, "wickets_fallen_entry": 2, "rrr_at_entry": 10.5,
                    "crr_at_entry": 8.0, "overs_left_at_entry": 10, "wickets_in_hand_exit": 6,
                    "match_phase": "middle"},
    },
]


def seed():
    db = SessionLocal()
    # Idempotency guard — skip entirely if data is already present
    from db import crud
    if crud.get_player(db, "P001"):
        print("Database already seeded — skipping.")
        db.close()
        return
    pipeline = ImpactMetricPipeline(db)
    inserted = 0
    errors   = 0
    for contrib in CONTRIBUTIONS:
        try:
            r = pipeline.process_contribution(dict(contrib))
            print(f"  [OK] {contrib['player_id']} / {contrib['match_id']}  →  IM={r['im_score']}")
            inserted += 1
        except Exception as exc:
            print(f"  [ERR] {contrib['player_id']} / {contrib['match_id']}: {exc}")
            errors += 1
    db.close()
    print(f"\nDone. Inserted {inserted}, Errors {errors}.")


if __name__ == "__main__":
    print("Seeding database …")
    seed()
