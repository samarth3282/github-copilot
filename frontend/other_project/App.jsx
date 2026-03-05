import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from "recharts";

// ─── SCORING ENGINE (JS port of Python spec) ────────────────────────────────

const PARAMS = {
  w_runs: 1.0, w_sr: 0.015, w_boundaries: 0.5, w_dots_avoided: 0.3,
  w_wkts: 2.5, w_econ: 0.4, w_dots: 0.02, w_maidens: 1.0,
  w_catch: 1.0, w_runout: 1.5, w_stumping: 0.5,
  alpha: 0.4, beta: 0.3, gamma: 0.25, sigmoid_k: 1.2,
  format_weight: { T20: 1.0, ODI: 1.1, Test: 1.2 },
  raw_impact_cap: 2.0, lambda: 0.15, sigmoid_k_norm: 0.9,
};

const FORMAT_STATS = {
  T20: { sr_baseline: 100, econ_baseline: 8.0, perf_mean: 15.0, perf_std: 12.0 },
  ODI: { sr_baseline: 75, econ_baseline: 5.5, perf_mean: 18.0, perf_std: 14.0 },
  Test: { sr_baseline: 50, econ_baseline: 3.5, perf_mean: 20.0, perf_std: 16.0 },
};

function sigmoid(x, k = 1.2) { return 1 / (1 + Math.exp(-k * x)); }

function computePerformanceScore(row, params, fs) {
  const bat = row.batting || {};
  const bowl = row.bowling || {};
  const field = row.fielding || {};
  const runs = bat.runs_scored || 0, balls = bat.balls_faced || 0;
  const sr = balls > 0 ? (runs / balls) * 100 : 0;
  const boundaries = (bat.fours || 0) + (bat.sixes || 0);
  const dotFrac = balls > 0 ? (bat.dots_faced || 0) / balls : 0;
  const bat_raw = params.w_runs * runs
    + params.w_sr * (sr - fs.sr_baseline)
    + params.w_boundaries * boundaries
    + params.w_dots_avoided * (1 - dotFrac);

  const overs = bowl.overs_bowled || 0;
  const balls_b = Math.floor(overs) * 6 + Math.round((overs % 1) * 10);
  const rc = bowl.runs_conceded || 0;
  const wkts = bowl.wickets_taken || 0;
  const eco = overs > 0 ? rc / overs : fs.econ_baseline;
  const dot_pct_bowl = balls_b > 0 ? (bowl.dot_balls_bowled || 0) / balls_b : 0;
  const bowl_raw = params.w_wkts * wkts
    + params.w_econ * (fs.econ_baseline - eco)
    + params.w_dots * dot_pct_bowl * 100
    + params.w_maidens * (bowl.maidens || 0);

  const field_raw = params.w_catch * (field.catches || 0)
    + params.w_runout * (field.run_outs || 0)
    + params.w_stumping * (field.stumpings || 0);

  let perf_raw;
  const role = row.player_role || "batsman";
  if (role === "batsman") perf_raw = bat_raw + field_raw;
  else if (role === "bowler") perf_raw = bowl_raw + field_raw;
  else perf_raw = 0.6 * bat_raw + 0.4 * bowl_raw + field_raw;

  const z = (perf_raw - fs.perf_mean) / Math.max(fs.perf_std, 1e-6);
  return sigmoid(z, params.sigmoid_k);
}

function computeContextMultiplier(row, params) {
  const oppElo = row.opposition_elo || 1000;
  const opp_norm = Math.max(-0.5, Math.min(0.5, (oppElo - 1000) / 1000));
  const fmt_w = (params.format_weight[row.format] || 1.0);
  const inn_w = row.innings_number === 2 ? 1.15 : 1.0;
  return Math.max(0.5, (1 + params.alpha * opp_norm) * fmt_w * inn_w);
}

const PHASE_WEIGHTS = { powerplay: 1.0, middle: 0.9, death: 1.3 };

function computeSituationMultiplier(row, params) {
  const bat = row.batting || {};
  const bowl = row.bowling || {};
  let pressure = 1.0;
  if ((bat.balls_faced || 0) > 0) {
    const rrr = bat.rrr_at_entry || 8, crr = bat.crr_at_entry || 8;
    const wih = bat.wickets_in_hand_exit ?? 5;
    const rr_delta = (rrr / Math.max(crr, 0.1)) - 1.0;
    const wk_press = 1.0 - wih / 10.0;
    pressure = Math.max(0.8, Math.min(2.0, 1.0 + params.beta * rr_delta * wk_press));
  } else {
    const phase = bowl.match_phase_bowled || "middle";
    const pw = PHASE_WEIGHTS[phase] || 1.0;
    pressure = 1.0 + params.gamma * (pw - 1.0);
  }
  const tierMap = { club: 0.7, district: 0.85, national: 1.0, international: 1.2 };
  const tier_mult = tierMap[row.tournament_tier] || 1.0;
  const importance = (row.match_importance || 1.0) * tier_mult;
  const form_bonus = row.form_recovery_bonus || 1.0;
  return Math.max(0.8, Math.min(3.0, pressure * importance * form_bonus));
}

function computeRawImpact(row, params, fs) {
  const ps = computePerformanceScore(row, params, fs);
  const cm = computeContextMultiplier(row, params);
  const sm = computeSituationMultiplier(row, params);
  return Math.min(ps * cm * sm, params.raw_impact_cap);
}

function computeRollingIM(impacts, lam = 0.15) {
  const n = Math.min(impacts.length, 10);
  if (n < 3) return null;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.exp(-lam * i);
    num += w * impacts[i]; den += w;
  }
  return num / den;
}

function normalizeParametric(rolling, mu = 0.65, sigma = 0.28, k = 0.9) {
  const z = (rolling - mu) / Math.max(sigma, 1e-6);
  return Math.max(0, Math.min(100, 100 / (1 + Math.exp(-k * z))));
}

function computeIM(row) {
  const fs = FORMAT_STATS[row.format] || FORMAT_STATS.T20;
  return computeRawImpact(row, PARAMS, fs);
}

// ─── SAMPLE DATA ─────────────────────────────────────────────────────────────

const SAMPLE_PLAYERS = [
  {
    id: "P001", name: "Arjun Sharma", team: "Royal Challengers", role: "allrounder",
    avatar: "AS", format: "T20",
    history: [
      {
        date: "Feb 24", opponent: "Punjab Kings", opp_elo: 1180, format: "T20", innings_number: 2, match_importance: 1.5, tournament_tier: "national",
        batting: { runs_scored: 68, balls_faced: 42, fours: 5, sixes: 3, dots_faced: 8, rrr_at_entry: 11.5, crr_at_entry: 8.2, wickets_in_hand_exit: 4 },
        bowling: { overs_bowled: 4, runs_conceded: 31, wickets_taken: 2, dot_balls_bowled: 12 },
        fielding: { catches: 1 }, player_role: "allrounder"
      },
      {
        date: "Feb 17", opponent: "Chennai Kings", opp_elo: 1050, format: "T20", innings_number: 2, match_importance: 1.0, tournament_tier: "national",
        batting: { runs_scored: 12, balls_faced: 15, fours: 1, sixes: 0, dots_faced: 7, rrr_at_entry: 9.0, crr_at_entry: 7.5, wickets_in_hand_exit: 3 },
        bowling: { overs_bowled: 4, runs_conceded: 38, wickets_taken: 0, dot_balls_bowled: 8 },
        fielding: { catches: 0 }, player_role: "allrounder"
      },
      {
        date: "Jan 24", opponent: "Mumbai Giants", opp_elo: 1200, format: "ODI", innings_number: 2, match_importance: 1.3, tournament_tier: "national",
        batting: { runs_scored: 88, balls_faced: 95, fours: 9, sixes: 2, dots_faced: 18, rrr_at_entry: 7.2, crr_at_entry: 6.1, wickets_in_hand_exit: 5 },
        bowling: { overs_bowled: 0, runs_conceded: 0, wickets_taken: 0, dot_balls_bowled: 0 },
        fielding: { catches: 1 }, player_role: "allrounder"
      },
      {
        date: "Jan 10", opponent: "Delhi Dynamos", opp_elo: 1100, format: "T20", innings_number: 1, match_importance: 1.0, tournament_tier: "national",
        batting: { runs_scored: 45, balls_faced: 30, fours: 4, sixes: 1, dots_faced: 5, rrr_at_entry: 0, crr_at_entry: 0, wickets_in_hand_exit: 6 },
        bowling: { overs_bowled: 4, runs_conceded: 28, wickets_taken: 1, dot_balls_bowled: 14 },
        fielding: { catches: 2 }, player_role: "allrounder"
      },
      {
        date: "Dec 28", opponent: "Kolkata Stars", opp_elo: 1150, format: "T20", innings_number: 2, match_importance: 1.3, tournament_tier: "national",
        batting: { runs_scored: 55, balls_faced: 38, fours: 3, sixes: 2, dots_faced: 9, rrr_at_entry: 10.0, crr_at_entry: 8.8, wickets_in_hand_exit: 5 },
        bowling: { overs_bowled: 3, runs_conceded: 24, wickets_taken: 2, dot_balls_bowled: 10 },
        fielding: { catches: 0 }, player_role: "allrounder"
      },
    ]
  },
  {
    id: "P002", name: "Priya Menon", team: "Mumbai Indians", role: "bowler",
    avatar: "PM", format: "T20",
    history: [
      {
        date: "Feb 22", opponent: "Royal Challengers", opp_elo: 1180, format: "T20", innings_number: 1, match_importance: 1.5, tournament_tier: "national",
        batting: {}, bowling: { overs_bowled: 4, runs_conceded: 22, wickets_taken: 3, dot_balls_bowled: 14, match_phase_bowled: "death" },
        fielding: { catches: 1 }, player_role: "bowler"
      },
      {
        date: "Feb 15", opponent: "Chennai Kings", opp_elo: 1060, format: "T20", innings_number: 1, match_importance: 1.0, tournament_tier: "national",
        batting: {}, bowling: { overs_bowled: 4, runs_conceded: 35, wickets_taken: 1, dot_balls_bowled: 8, match_phase_bowled: "middle" },
        fielding: { catches: 0 }, player_role: "bowler"
      },
      {
        date: "Jan 30", opponent: "Punjab Kings", opp_elo: 1120, format: "T20", innings_number: 1, match_importance: 1.0, tournament_tier: "national",
        batting: {}, bowling: { overs_bowled: 4, runs_conceded: 19, wickets_taken: 4, dot_balls_bowled: 16, match_phase_bowled: "death" },
        fielding: { catches: 2 }, player_role: "bowler"
      },
      {
        date: "Jan 18", opponent: "Delhi Dynamos", opp_elo: 1090, format: "T20", innings_number: 2, match_importance: 1.3, tournament_tier: "national",
        batting: {}, bowling: { overs_bowled: 4, runs_conceded: 40, wickets_taken: 0, dot_balls_bowled: 6, match_phase_bowled: "middle" },
        fielding: { catches: 1 }, player_role: "bowler"
      },
      {
        date: "Jan 5", opponent: "Kolkata Stars", opp_elo: 1140, format: "T20", innings_number: 1, match_importance: 1.0, tournament_tier: "national",
        batting: {}, bowling: { overs_bowled: 4, runs_conceded: 28, wickets_taken: 2, dot_balls_bowled: 12, match_phase_bowled: "powerplay" },
        fielding: { catches: 0 }, player_role: "bowler"
      },
    ]
  },
  {
    id: "P003", name: "Vikas Reddy", team: "Chennai Kings", role: "batsman",
    avatar: "VR", format: "T20",
    history: [
      {
        date: "Feb 20", opponent: "Mumbai Indians", opp_elo: 1200, format: "T20", innings_number: 2, match_importance: 1.5, tournament_tier: "international",
        batting: { runs_scored: 92, balls_faced: 54, fours: 7, sixes: 5, dots_faced: 7, rrr_at_entry: 12.0, crr_at_entry: 9.5, wickets_in_hand_exit: 6 },
        bowling: {}, fielding: { catches: 0 }, player_role: "batsman"
      },
      {
        date: "Feb 8", opponent: "Royal Challengers", opp_elo: 1180, format: "T20", innings_number: 1, match_importance: 1.3, tournament_tier: "national",
        batting: { runs_scored: 38, balls_faced: 28, fours: 3, sixes: 1, dots_faced: 6, rrr_at_entry: 0, crr_at_entry: 0, wickets_in_hand_exit: 7 },
        bowling: {}, fielding: { catches: 1 }, player_role: "batsman"
      },
      {
        date: "Jan 26", opponent: "Delhi Dynamos", opp_elo: 1090, format: "T20", innings_number: 2, match_importance: 1.0, tournament_tier: "national",
        batting: { runs_scored: 5, balls_faced: 10, fours: 0, sixes: 0, dots_faced: 6, rrr_at_entry: 9.5, crr_at_entry: 7.0, wickets_in_hand_exit: 2 },
        bowling: {}, fielding: { catches: 0 }, player_role: "batsman"
      },
      {
        date: "Jan 14", opponent: "Punjab Kings", opp_elo: 1120, format: "T20", innings_number: 2, match_importance: 1.0, tournament_tier: "national",
        batting: { runs_scored: 71, balls_faced: 45, fours: 6, sixes: 3, dots_faced: 9, rrr_at_entry: 10.5, crr_at_entry: 9.0, wickets_in_hand_exit: 5 },
        bowling: {}, fielding: { catches: 1 }, player_role: "batsman"
      },
      {
        date: "Dec 30", opponent: "Kolkata Stars", opp_elo: 1140, format: "T20", innings_number: 1, match_importance: 1.0, tournament_tier: "national",
        batting: { runs_scored: 55, balls_faced: 40, fours: 5, sixes: 2, dots_faced: 8, rrr_at_entry: 0, crr_at_entry: 0, wickets_in_hand_exit: 7 },
        bowling: {}, fielding: { catches: 2 }, player_role: "batsman"
      },
    ]
  },
  {
    id: "P004", name: "Rohan Kapoor", team: "Delhi Dynamos", role: "allrounder",
    avatar: "RK", format: "ODI",
    history: [
      {
        date: "Feb 19", opponent: "Mumbai Indians", opp_elo: 1210, format: "ODI", innings_number: 2, match_importance: 1.3, tournament_tier: "international",
        batting: { runs_scored: 62, balls_faced: 75, fours: 5, sixes: 1, dots_faced: 22, rrr_at_entry: 6.8, crr_at_entry: 5.5, wickets_in_hand_exit: 5 },
        bowling: { overs_bowled: 8, runs_conceded: 42, wickets_taken: 2, dot_balls_bowled: 24 },
        fielding: { catches: 1 }, player_role: "allrounder"
      },
      {
        date: "Feb 5", opponent: "Royal Challengers", opp_elo: 1180, format: "ODI", innings_number: 1, match_importance: 1.0, tournament_tier: "national",
        batting: { runs_scored: 35, balls_faced: 50, fours: 2, sixes: 0, dots_faced: 20, rrr_at_entry: 0, crr_at_entry: 0, wickets_in_hand_exit: 7 },
        bowling: { overs_bowled: 10, runs_conceded: 55, wickets_taken: 3, dot_balls_bowled: 28 },
        fielding: { catches: 2 }, player_role: "allrounder"
      },
      {
        date: "Jan 22", opponent: "Chennai Kings", opp_elo: 1060, format: "ODI", innings_number: 2, match_importance: 1.0, tournament_tier: "national",
        batting: { runs_scored: 82, balls_faced: 90, fours: 8, sixes: 2, dots_faced: 25, rrr_at_entry: 7.5, crr_at_entry: 6.0, wickets_in_hand_exit: 6 },
        bowling: { overs_bowled: 5, runs_conceded: 30, wickets_taken: 1, dot_balls_bowled: 14 },
        fielding: { catches: 0 }, player_role: "allrounder"
      },
      {
        date: "Jan 8", opponent: "Punjab Kings", opp_elo: 1120, format: "ODI", innings_number: 1, match_importance: 1.3, tournament_tier: "national",
        batting: { runs_scored: 15, balls_faced: 25, fours: 1, sixes: 0, dots_faced: 12, rrr_at_entry: 0, crr_at_entry: 0, wickets_in_hand_exit: 4 },
        bowling: { overs_bowled: 10, runs_conceded: 46, wickets_taken: 4, dot_balls_bowled: 30 },
        fielding: { catches: 1 }, player_role: "allrounder"
      },
      {
        date: "Dec 25", opponent: "Kolkata Stars", opp_elo: 1140, format: "ODI", innings_number: 2, match_importance: 1.5, tournament_tier: "international",
        batting: { runs_scored: 50, balls_faced: 60, fours: 4, sixes: 1, dots_faced: 18, rrr_at_entry: 8.0, crr_at_entry: 7.2, wickets_in_hand_exit: 6 },
        bowling: { overs_bowled: 8, runs_conceded: 38, wickets_taken: 2, dot_balls_bowled: 22 },
        fielding: { catches: 2 }, player_role: "allrounder"
      },
    ]
  },
];

// Compute raw impacts and IM for each player
function enrichPlayer(player) {
  const rawImpacts = player.history.map(h => computeIM(h));
  const rolling = computeRollingIM(rawImpacts);
  const im_score = rolling !== null ? normalizeParametric(rolling) : null;
  const historyWithIM = player.history.map((h, i) => {
    const raw = rawImpacts[i];
    const rollingUpTo = computeRollingIM(rawImpacts.slice(i));
    const im = rollingUpTo !== null ? normalizeParametric(rollingUpTo) : normalizeParametric(raw, 0.65, 0.28);
    return { ...h, raw_impact: raw, im_score: Math.round(im * 10) / 10 };
  });
  const recent3 = rawImpacts.slice(0, 3).map(x => normalizeParametric(x, 0.65, 0.28));
  const older3 = rawImpacts.slice(2, 5).map(x => normalizeParametric(x, 0.65, 0.28));
  const avgRecent = recent3.reduce((a, b) => a + b, 0) / recent3.length;
  const avgOlder = older3.reduce((a, b) => a + b, 0) / (older3.length || 1);
  const trend = avgRecent > avgOlder + 3 ? "rising" : avgRecent < avgOlder - 3 ? "falling" : "stable";
  return { ...player, rawImpacts, rolling, im_score: im_score ? Math.round(im_score * 10) / 10 : null, historyWithIM, trend };
}

const PLAYERS = SAMPLE_PLAYERS.map(enrichPlayer);

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getZone(score) {
  if (score >= 80) return { label: "Elite Impact", color: "#a78bfa", bg: "rgba(167,139,250,0.15)", tier: 4 };
  if (score >= 65) return { label: "High Impact", color: "#34d399", bg: "rgba(52,211,153,0.15)", tier: 3 };
  if (score >= 35) return { label: "Neutral", color: "#fbbf24", bg: "rgba(251,191,36,0.15)", tier: 2 };
  return { label: "Below Par", color: "#f87171", bg: "rgba(248,113,113,0.15)", tier: 1 };
}

function trendIcon(t) {
  if (t === "rising") return { icon: "↑", color: "#34d399" };
  if (t === "falling") return { icon: "↓", color: "#f87171" };
  return { icon: "→", color: "#fbbf24" };
}

// ─── SVG METER ────────────────────────────────────────────────────────────────

function ImpactMeter({ score, size = 200 }) {
  const zone = getZone(score || 0);
  const cx = size / 2, cy = size * 0.62, r = size * 0.38;
  const startAngle = 200, endAngle = 340;
  const totalArc = endAngle - startAngle;
  const needleAngle = startAngle + (score / 100) * totalArc;

  function pt(angle, rad) {
    const a = (angle - 90) * Math.PI / 180;
    return { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) };
  }
  function arcPath(sa, ea, rad) {
    const s = pt(sa, rad), e = pt(ea, rad);
    const large = (ea - sa) > 180 ? 1 : 0;
    return `M${s.x},${s.y} A${rad},${rad} 0 ${large},1 ${e.x},${e.y}`;
  }

  const segments = [
    { from: startAngle, to: startAngle + totalArc * 0.35, color: "#f87171" },
    { from: startAngle + totalArc * 0.35, to: startAngle + totalArc * 0.65, color: "#fbbf24" },
    { from: startAngle + totalArc * 0.65, to: startAngle + totalArc * 0.80, color: "#34d399" },
    { from: startAngle + totalArc * 0.80, to: endAngle, color: "#a78bfa" },
  ];

  const needle = pt(needleAngle, r * 0.82);
  const needleBase1 = pt(needleAngle + 90, r * 0.06);
  const needleBase2 = pt(needleAngle - 90, r * 0.06);

  return (
    <svg width={size} height={size * 0.78} viewBox={`0 0 ${size} ${size * 0.78}`}>
      <path d={arcPath(startAngle, endAngle, r)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={size * 0.07} />
      {segments.map((seg, i) => (
        <path key={i} d={arcPath(seg.from, Math.min(seg.to, startAngle + (score / 100) * totalArc), r)}
          fill="none" stroke={seg.color} strokeWidth={size * 0.065}
          opacity={seg.from < startAngle + (score / 100) * totalArc ? 1 : 0.15}
        />
      ))}
      <polygon
        points={`${needle.x},${needle.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
        fill={zone.color} opacity={0.95}
      />
      <circle cx={cx} cy={cy} r={size * 0.045} fill="#1a1a2e" stroke={zone.color} strokeWidth={2} />
      <text x={cx} y={cy - r * 1.28} textAnchor="middle" fontSize={size * 0.095} fontWeight="800" fill={zone.color} fontFamily="'Barlow Condensed', sans-serif">
        {score?.toFixed(1)}
      </text>
      <text x={cx} y={cy - r * 1.07} textAnchor="middle" fontSize={size * 0.057} fill={zone.color} fontFamily="'Barlow Condensed', sans-serif" letterSpacing="1">
        {zone.label.toUpperCase()}
      </text>
    </svg>
  );
}

// ─── CALCULATOR FORM ─────────────────────────────────────────────────────────

function Calculator({ onResult }) {
  const [form, setForm] = useState({
    format: "T20", innings_number: "2", match_importance: "1.0",
    tournament_tier: "national", opposition_elo: "1100", player_role: "batsman",
    runs_scored: "", balls_faced: "", fours: "", sixes: "", dots_faced: "",
    rrr_at_entry: "", crr_at_entry: "", wickets_in_hand_exit: "5",
    overs_bowled: "", runs_conceded: "", wickets_taken: "", maidens: "", dot_balls_bowled: "",
    catches: "0", run_outs: "0",
  });
  const [result, setResult] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const n = (v, d = 0) => parseFloat(v) || d;

  function calculate() {
    const row = {
      format: form.format, innings_number: parseInt(form.innings_number),
      match_importance: n(form.match_importance, 1), tournament_tier: form.tournament_tier,
      opposition_elo: n(form.opposition_elo, 1000), player_role: form.player_role,
      batting: {
        runs_scored: n(form.runs_scored), balls_faced: n(form.balls_faced),
        fours: n(form.fours), sixes: n(form.sixes), dots_faced: n(form.dots_faced),
        rrr_at_entry: n(form.rrr_at_entry, 8), crr_at_entry: n(form.crr_at_entry, 8),
        wickets_in_hand_exit: n(form.wickets_in_hand_exit, 5),
      },
      bowling: {
        overs_bowled: n(form.overs_bowled), runs_conceded: n(form.runs_conceded),
        wickets_taken: n(form.wickets_taken), maidens: n(form.maidens),
        dot_balls_bowled: n(form.dot_balls_bowled),
      },
      fielding: { catches: n(form.catches), run_outs: n(form.run_outs) },
    };
    const fs = FORMAT_STATS[form.format] || FORMAT_STATS.T20;
    const raw = computeRawImpact(row, PARAMS, fs);
    const ps = computePerformanceScore(row, PARAMS, fs);
    const cm = computeContextMultiplier(row, PARAMS);
    const sm = computeSituationMultiplier(row, PARAMS);
    const im = normalizeParametric(raw);
    setResult({ raw, ps, cm, sm, im });
    onResult && onResult({ raw, im });
  }

  const zone = result ? getZone(result.im) : null;

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <CalculatorSelect label="Format" k="format" form={form} set={set} options={[{ value: "T20", label: "T20" }, { value: "ODI", label: "ODI" }, { value: "Test", label: "Test" }]} />
          <CalculatorSelect label="Innings" k="innings_number" form={form} set={set} options={[{ value: "1", label: "1st Innings" }, { value: "2", label: "2nd Innings (Chase)" }]} />
          <CalculatorSelect label="Match Type" k="match_importance" form={form} set={set} options={[{ value: "0.5", label: "Friendly" }, { value: "1.0", label: "League Stage" }, { value: "1.3", label: "Knockout" }, { value: "1.5", label: "Final" }]} />
          <CalculatorSelect label="Tournament Tier" k="tournament_tier" form={form} set={set} options={[{ value: "club", label: "Club" }, { value: "district", label: "District" }, { value: "national", label: "National" }, { value: "international", label: "International" }]} />
          <CalculatorInput label="Opposition ELO" k="opposition_elo" form={form} set={set} placeholder="1000" />
          <CalculatorSelect label="Player Role" k="player_role" form={form} set={set} options={[{ value: "batsman", label: "Batsman" }, { value: "bowler", label: "Bowler" }, { value: "allrounder", label: "All-Rounder" }]} />
        </div>

        {(form.player_role === "batsman" || form.player_role === "allrounder") && (
          <>
            <div style={{ fontSize: 11, color: "#a78bfa", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2, textTransform: "uppercase", borderBottom: "1px solid rgba(167,139,250,0.2)", paddingBottom: 6 }}>Batting</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <CalculatorInput label="Runs" k="runs_scored" form={form} set={set} />
              <CalculatorInput label="Balls" k="balls_faced" form={form} set={set} />
              <CalculatorInput label="Fours" k="fours" form={form} set={set} />
              <CalculatorInput label="Sixes" k="sixes" form={form} set={set} />
              <CalculatorInput label="Dots Faced" k="dots_faced" form={form} set={set} />
              <CalculatorInput label="Wickets in Hand" k="wickets_in_hand_exit" form={form} set={set} />
              <CalculatorInput label="RRR at Entry" k="rrr_at_entry" form={form} set={set} placeholder="8.0" />
              <CalculatorInput label="CRR at Entry" k="crr_at_entry" form={form} set={set} placeholder="8.0" />
            </div>
          </>
        )}
        {(form.player_role === "bowler" || form.player_role === "allrounder") && (
          <>
            <div style={{ fontSize: 11, color: "#34d399", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2, textTransform: "uppercase", borderBottom: "1px solid rgba(52,211,153,0.2)", paddingBottom: 6 }}>Bowling</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <CalculatorInput label="Overs" k="overs_bowled" form={form} set={set} placeholder="0.0" />
              <CalculatorInput label="Runs Conceded" k="runs_conceded" form={form} set={set} />
              <CalculatorInput label="Wickets" k="wickets_taken" form={form} set={set} />
              <CalculatorInput label="Maidens" k="maidens" form={form} set={set} />
              <CalculatorInput label="Dot Balls" k="dot_balls_bowled" form={form} set={set} />
            </div>
          </>
        )}
        <div style={{ fontSize: 11, color: "#fbbf24", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2, textTransform: "uppercase", borderBottom: "1px solid rgba(251,191,36,0.2)", paddingBottom: 6 }}>Fielding</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <CalculatorInput label="Catches" k="catches" form={form} set={set} />
          <CalculatorInput label="Run Outs" k="run_outs" form={form} set={set} />
        </div>

        <button onClick={calculate}
          style={{ background: "linear-gradient(135deg, #6366f1, #a78bfa)", border: "none", borderRadius: 8, padding: "14px 24px", color: "white", fontSize: 16, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2, cursor: "pointer", textTransform: "uppercase", marginTop: 4 }}>
          Compute Impact Score
        </button>
      </div>

      {result && (
        <div style={{ flex: "0 0 260px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          <ImpactMeter score={result.im} size={220} />
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Performance Score", value: (result.ps * 100).toFixed(1) + "%", color: "#a78bfa" },
              { label: "Context Multiplier", value: "×" + result.cm.toFixed(3), color: "#34d399" },
              { label: "Situation Multiplier", value: "×" + result.sm.toFixed(3), color: "#fbbf24" },
              { label: "Raw Impact", value: result.raw.toFixed(4), color: "#94a3b8" },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "8px 12px" }}>
                <span style={{ fontSize: 12, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif" }}>{row.label}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: row.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{row.value}</span>
              </div>
            ))}
          </div>
          <div style={{ width: "100%", background: zone.bg, border: `1px solid ${zone.color}30`, borderRadius: 8, padding: "12px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, marginBottom: 4 }}>FORMULA</div>
            <div style={{ fontSize: 13, color: "#94a3b8", fontFamily: "'Courier New', monospace" }}>
              IM = normalize(P × C × S)
            </div>
            <div style={{ fontSize: 13, color: zone.color, fontFamily: "'Courier New', monospace", marginTop: 4 }}>
              = normalize({result.ps.toFixed(3)} × {result.cm.toFixed(3)} × {result.sm.toFixed(3)})
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PLAYER CARD ─────────────────────────────────────────────────────────────

function PlayerCard({ player, onClick, selected }) {
  const zone = getZone(player.im_score || 0);
  const trend = trendIcon(player.trend);
  return (
    <div onClick={onClick} style={{
      background: selected ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)",
      border: selected ? `1px solid ${zone.color}60` : "1px solid rgba(255,255,255,0.06)",
      borderRadius: 12, padding: "16px 18px", cursor: "pointer",
      transition: "all 0.2s", display: "flex", alignItems: "center", gap: 14
    }}>
      <div style={{ width: 44, height: 44, borderRadius: "50%", background: `linear-gradient(135deg, ${zone.color}40, ${zone.color}20)`, border: `2px solid ${zone.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: zone.color, fontFamily: "'Barlow Condensed', sans-serif", flexShrink: 0 }}>
        {player.avatar}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", fontFamily: "'Barlow Condensed', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{player.name}</div>
        <div style={{ fontSize: 12, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif" }}>{player.team} · {player.role} · {player.format}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: zone.color, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>{player.im_score}</div>
        <div style={{ fontSize: 13, color: trend.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{trend.icon} {player.trend}</div>
      </div>
    </div>
  );
}

// ─── PLAYER DETAIL ───────────────────────────────────────────────────────────

function PlayerDetail({ player }) {
  const zone = getZone(player.im_score || 0);
  const trend = trendIcon(player.trend);
  const chartData = [...player.historyWithIM].reverse().map((h, i) => ({
    name: h.date, im: Math.round(h.im_score * 10) / 10, raw: Math.round(h.raw_impact * 1000) / 1000
  }));

  const avgRuns = player.historyWithIM.filter(h => h.batting?.runs_scored > 0).reduce((a, h) => a + h.batting.runs_scored, 0) /
    Math.max(player.historyWithIM.filter(h => h.batting?.runs_scored > 0).length, 1);
  const avgSR = player.historyWithIM.filter(h => h.batting?.balls_faced > 0).reduce((a, h) => {
    return a + (h.batting.runs_scored / h.batting.balls_faced) * 100;
  }, 0) / Math.max(player.historyWithIM.filter(h => h.batting?.balls_faced > 0).length, 1);
  const totalWkts = player.historyWithIM.reduce((a, h) => a + (h.bowling?.wickets_taken || 0), 0);
  const totalOvers = player.historyWithIM.reduce((a, h) => a + (h.bowling?.overs_bowled || 0), 0);
  const avgEco = totalOvers > 0
    ? player.historyWithIM.reduce((a, h) => a + (h.bowling?.runs_conceded || 0), 0) / totalOvers
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <ImpactMeter score={player.im_score || 0} size={180} />
          <div style={{ fontSize: 12, color: "#64748b", textAlign: "center", fontFamily: "'Barlow Condensed', sans-serif" }}>
            Based on last {player.historyWithIM.length} innings
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", background: zone.bg, border: `1px solid ${zone.color}40`, borderRadius: 20, padding: "4px 12px" }}>
            <span style={{ color: trend.color, fontSize: 16 }}>{trend.icon}</span>
            <span style={{ fontSize: 12, color: zone.color, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1 }}>{player.trend.toUpperCase()}</span>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2, marginBottom: 10 }}>PERFORMANCE STATS</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "Batting Avg", value: avgRuns > 0 ? avgRuns.toFixed(1) : "—" },
              { label: "Strike Rate", value: avgSR > 0 ? avgSR.toFixed(1) : "—" },
              { label: "Wkts (last 5)", value: totalWkts || "—" },
              { label: "Economy", value: avgEco ? avgEco.toFixed(2) : "—" },
              { label: "Rolling Raw IM", value: player.rolling?.toFixed(3) || "—" },
              { label: "IM Score", value: player.im_score || "—" },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif" }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0", fontFamily: "'Barlow Condensed', sans-serif" }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2, marginBottom: 12 }}>IM TREND — LAST {chartData.length} INNINGS</div>
        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="imGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={zone.color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={zone.color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
              <ReferenceLine y={50} stroke="#334155" strokeDasharray="4 4" />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13 }} itemStyle={{ color: zone.color }} />
              <Area type="monotone" dataKey="im" stroke={zone.color} strokeWidth={2} fill="url(#imGrad)" dot={{ fill: zone.color, r: 3 }} name="IM Score" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2, marginBottom: 10 }}>MATCH HISTORY</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {player.historyWithIM.map((h, i) => {
            const z = getZone(h.im_score);
            return (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "10px 14px", borderLeft: `3px solid ${z.color}` }}>
                <div style={{ flex: "0 0 70px", fontSize: 12, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif" }}>{h.date}</div>
                <div style={{ flex: 1, fontSize: 13, color: "#94a3b8", fontFamily: "'Barlow Condensed', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>vs {h.opponent}</div>
                <div style={{ fontSize: 12, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif" }}>{h.format}</div>
                {h.batting?.runs_scored > 0 && <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "'Barlow Condensed', sans-serif" }}>{h.batting.runs_scored}({h.batting.balls_faced})</div>}
                {h.bowling?.wickets_taken > 0 && <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "'Barlow Condensed', sans-serif" }}>{h.bowling.wickets_taken}/{h.bowling.runs_conceded}</div>}
                <div style={{ fontSize: 12, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif" }}>raw: {h.raw_impact.toFixed(3)}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: z.color, fontFamily: "'Barlow Condensed', sans-serif", minWidth: 40, textAlign: "right" }}>{h.im_score}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── LEADERBOARD ─────────────────────────────────────────────────────────────

function Leaderboard() {
  const sorted = [...PLAYERS].sort((a, b) => (b.im_score || 0) - (a.im_score || 0));
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 80px 80px 80px", gap: 8, marginBottom: 8, padding: "0 12px" }}>
        {["#", "Player", "Format", "IM Score", "Trend"].map(h => (
          <div key={h} style={{ fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, textTransform: "uppercase" }}>{h}</div>
        ))}
      </div>
      {sorted.map((p, i) => {
        const zone = getZone(p.im_score || 0);
        const trend = trendIcon(p.trend);
        return (
          <div key={p.id} style={{ display: "grid", gridTemplateColumns: "40px 1fr 80px 80px 80px", gap: 8, alignItems: "center", background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent", borderRadius: 8, padding: "12px 12px", marginBottom: 2 }}>
            <div style={{ fontSize: i < 3 ? 18 : 14, fontWeight: 800, color: i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : i === 2 ? "#cd7f32" : "#475569", fontFamily: "'Barlow Condensed', sans-serif" }}>
              {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", fontFamily: "'Barlow Condensed', sans-serif" }}>{p.name}</div>
              <div style={{ fontSize: 12, color: "#475569", fontFamily: "'Barlow Condensed', sans-serif" }}>{p.team} · {p.role}</div>
            </div>
            <div style={{ fontSize: 13, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif" }}>{p.format}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: zone.bg, border: `2px solid ${zone.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: zone.color, fontFamily: "'Barlow Condensed', sans-serif" }}>
                {p.im_score}
              </div>
            </div>
            <div style={{ fontSize: 14, color: trend.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{trend.icon} {p.trend}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── FORMULA EXPLAINER ───────────────────────────────────────────────────────

function FormulaExplainer() {
  const blocks = [
    {
      title: "Performance Score", color: "#a78bfa", icon: "🏏",
      formula: "bat_raw = w_runs×R + w_sr×(SR−SR₀) + w_boundaries×B + w_dots_avoided×(1−d%)",
      desc: "Measures what the player statistically did — runs, strike rate above baseline, boundaries, dot ball avoidance for batting; wickets, economy, dots, maidens for bowling. Z-scored against the format population, then squashed into (0,1) via logistic sigmoid."
    },
    {
      title: "Context Multiplier", color: "#34d399", icon: "🌍",
      formula: "CM = (1 + α × opp_norm) × format_weight × innings_weight",
      desc: "Rewards difficult environments. Elite opposition (ELO > 1000) boosts the multiplier. Tests score highest (1.2×), ODIs mid (1.1×), T20s baseline (1.0×). 2nd-innings chasing carries an extra 1.15× for chase pressure."
    },
    {
      title: "Situation Multiplier", color: "#fbbf24", icon: "⚡",
      formula: "SM = Pressure_Index × Match_Importance × Form_Recovery_Bonus",
      desc: "Captures the critical moment. High RRR with wickets falling amplifies batting impact. Finals (1.5×) and knockouts (1.3×) outweigh league games. A player returning from slump gets a 1.1× recovery bonus."
    },
    {
      title: "Recency Weighting", color: "#fb923c", icon: "📅",
      formula: "w_i = e^(−λ×(i−1)),  λ = 0.15",
      desc: "Last 10 innings, exponentially weighted. The most recent innings carries full weight (1.0); an innings from 10 games ago carries ~0.26 weight. Rolling aggregate = Σ(w_i × raw_i) / Σ(w_i)."
    },
    {
      title: "Normalization", color: "#38bdf8", icon: "📊",
      formula: "IM = 100 / (1 + e^(−k × z)),  z = (rolling − μ) / σ",
      desc: "Population z-score fed into a logistic function maps to 0–100. z=0 (average player) → IM=50. z=+2 → IM≈83 (top 20%). z=−2 → IM≈17 (bottom 20%). Percentile-rank method also available for leaderboards."
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: "#e2e8f0", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2 }}>IM = Performance × Context × Situation</div>
        <div style={{ fontSize: 14, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", marginTop: 6 }}>Normalized to 0–100 over rolling 10-innings window · 50 = neutral baseline</div>
      </div>
      {blocks.map((b) => (
        <div key={b.title} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${b.color}25`, borderRadius: 10, padding: 18, borderLeft: `4px solid ${b.color}` }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>{b.icon}</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: b.color, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1 }}>{b.title}</span>
          </div>
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: 13, color: "#94a3b8", background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: "8px 12px", marginBottom: 10, overflowX: "auto", whiteSpace: "pre" }}>{b.formula}</div>
          <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>{b.desc}</div>
        </div>
      ))}

      <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: 18, marginTop: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 12, letterSpacing: 1 }}>IM SCORE INTERPRETATION</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[{ r: "80–100", l: "Elite Impact", c: "#a78bfa", d: "Top ~5% performers" }, { r: "65–79", l: "High Impact", c: "#34d399", d: "Above average with context" }, { r: "35–64", l: "Neutral", c: "#fbbf24", d: "Average contribution" }, { r: "0–34", l: "Below Par", c: "#f87171", d: "Below expectation" }].map(z => (
            <div key={z.r} style={{ flex: "1 1 160px", background: `${z.c}10`, border: `1px solid ${z.c}30`, borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: z.c, fontFamily: "'Barlow Condensed', sans-serif" }}>{z.r}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: z.c, fontFamily: "'Barlow Condensed', sans-serif" }}>{z.l}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{z.d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState("players");
  const [selectedPlayer, setSelectedPlayer] = useState(PLAYERS[0]);

  const tabs = [
    { id: "players", label: "Players" },
    { id: "leaderboard", label: "Leaderboard" },
    { id: "calculator", label: "Calculator" },
    { id: "formula", label: "How It Works" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#070b14",
      color: "#e2e8f0",
      fontFamily: "system-ui, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&display=swap');
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        * { box-sizing: border-box; }
      `}</style>

      {/* Header */}
      <div style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "16px 24px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg, #6366f1, #a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏏</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#e2e8f0", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2, lineHeight: 1 }}>CRICKET IMPACT METRIC</div>
            <div style={{ fontSize: 11, color: "#475569", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 3 }}>PERFORMANCE × CONTEXT × SITUATION</div>
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 4 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ background: tab === t.id ? "rgba(99,102,241,0.5)" : "transparent", border: tab === t.id ? "1px solid rgba(99,102,241,0.5)" : "1px solid transparent", borderRadius: 7, padding: "7px 16px", color: tab === t.id ? "#e2e8f0" : "#64748b", fontSize: 13, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, cursor: "pointer", transition: "all 0.15s", textTransform: "uppercase" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>

        {tab === "players" && (
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <div style={{ flex: "0 0 300px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2, marginBottom: 4 }}>SELECT PLAYER</div>
              {PLAYERS.map(p => (
                <PlayerCard key={p.id} player={p} selected={selectedPlayer?.id === p.id} onClick={() => setSelectedPlayer(p)} />
              ))}
            </div>
            <div style={{ flex: 1, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 22 }}>
              {selectedPlayer ? (
                <>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
                    <div style={{ width: 50, height: 50, borderRadius: "50%", background: `linear-gradient(135deg, ${getZone(selectedPlayer.im_score || 0).color}40, ${getZone(selectedPlayer.im_score || 0).color}15)`, border: `2px solid ${getZone(selectedPlayer.im_score || 0).color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: getZone(selectedPlayer.im_score || 0).color, fontFamily: "'Barlow Condensed', sans-serif" }}>
                      {selectedPlayer.avatar}
                    </div>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#e2e8f0", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1 }}>{selectedPlayer.name}</div>
                      <div style={{ fontSize: 13, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif" }}>{selectedPlayer.team} · {selectedPlayer.role} · {selectedPlayer.format}</div>
                    </div>
                  </div>
                  <PlayerDetail player={selectedPlayer} />
                </>
              ) : <div style={{ color: "#64748b", textAlign: "center", padding: 40 }}>Select a player to view details</div>}
            </div>
          </div>
        )}

        {tab === "leaderboard" && (
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#e2e8f0", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2, marginBottom: 20 }}>🏆 IMPACT LEADERBOARD</div>
            <Leaderboard />
          </div>
        )}

        {tab === "calculator" && (
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 24 }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#e2e8f0", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2 }}>⚡ IMPACT CALCULATOR</div>
              <div style={{ fontSize: 13, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>Enter a player's single-match contribution to compute their raw Impact Score.</div>
            </div>
            <Calculator />
          </div>
        )}

        {tab === "formula" && (
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 24 }}>
            <FormulaExplainer />
          </div>
        )}
      </div>
    </div>
  );
}