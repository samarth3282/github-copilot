# Cricket Impact Metric (IM) — Hackathon Submission

## Team Submission | CricHeroes Hackathon 2026

---

## 1. Definition of Impact

> **Impact = the measurable influence a player's actions exert on the probability of their team winning a match, adjusted for the difficulty of the context and the pressure of the situation in which those actions occurred.**

Traditional metrics (batting average, economy rate, strike rate) tell you *what* happened. They do not tell you *whether it mattered*. A 40-run innings in a dead rubber is not the same as a 40-run innings chasing 180 with 5 wickets down in the last 5 overs.

The Impact Metric (IM) captures three orthogonal dimensions:

| Dimension | Question answered | Example drivers |
|---|---|---|
| **Performance** | How well did the player actually execute? | Runs, SR above baseline, wickets, economy, dot balls |
| **Match Context** | How hard was the opposition / format? | Opposition Elo, format difficulty, innings position |
| **Game Situation** | How much pressure existed at the moment of contribution? | RRR vs CRR, wickets in hand, match importance, tournament tier |

The final IM is a **rolling, recency-weighted aggregate** of per-match impacts over the last 10 innings, normalised to a 0–100 scale where **50 = neutral baseline**.

---

## 2. Mathematical Formulation

### 2.1 Per-Match Raw Impact

$$
\text{Raw\_Impact}_m = \text{clamp}\!\left(\text{P}_m \times \text{CM}_m \times \text{SM}_m,\ 0,\ 2.0\right)
$$

#### Performance Score P ∈ (0, 1)

$$
\text{Batting\_raw} = w_{\text{runs}} \cdot r + w_{\text{sr}} \cdot (\text{SR} - \text{SR}^*) + w_{\text{bdry}} \cdot b + w_{\text{dot}} \cdot (1 - f_d)
$$

$$
\text{Bowling\_raw} = w_{\text{wkt}} \cdot k + w_{\text{eco}} \cdot (\text{Eco}^* - \text{eco}) + w_{\text{dot\_b}} \cdot f_{d,b} \cdot 100 + w_{\text{maiden}} \cdot m
$$

$$
\text{Fielding\_raw} = w_{\text{catch}} \cdot c + w_{\text{ro}} \cdot \text{ro} + w_{\text{stump}} \cdot s
$$

**Allrounder aggregation (adaptive):**

$$
\text{Perf\_raw} = \alpha_{\text{bat}} \cdot \text{Bat\_raw} + \alpha_{\text{bowl}} \cdot \text{Bowl\_raw} + \text{Field\_raw}
$$

where the split is **data-driven per-match**:

$$
\alpha_{\text{bat}} = \frac{\max(\text{Bat\_raw},0)}{\max(\text{Bat\_raw},0)+\max(\text{Bowl\_raw},0)}, \quad \alpha_{\text{bowl}} = 1 - \alpha_{\text{bat}}
$$

This is not a fixed 60/40 split — the split reflects what the player actually contributed each match.

**Z-normalization then sigmoid squashing:**

$$
z = \frac{\text{Perf\_raw} - \mu_f}{\sigma_f}, \qquad P = \sigma\!\left(k \cdot z\right) = \frac{1}{1+e^{-k z}}, \quad k=1.2
$$

where $\mu_f, \sigma_f$ are the format-specific mean and standard deviation of historical performance scores.

#### Context Multiplier CM ∈ [0.5, 1.8]

$$
\text{CM} = \text{clamp}\!\left(\left(1 + \alpha \cdot \hat{e}_{\text{opp}}\right) \cdot w_f \cdot w_{\text{inn}},\ 0.5,\ 1.8\right)
$$

- $\hat{e}_{\text{opp}} = \text{clip}\!\left(\frac{\text{Elo}_{\text{opp}} - 1000}{1000}, -0.5, 0.5\right)$ — opposition quality normalised around the mean
- $w_f \in \{0.9, 1.0, 1.1, 1.2\}$ for T10/T20/ODI/Test respectively — format-difficulty weight
- $w_{\text{inn}} \in \{1.00, 1.15, 1.20\}$ for 1st, 2nd, 3rd/4th innings — chasing/pressure weight
- $\alpha = 0.4$

**Elo is auto-maintained**: after each match, team Elo ratings are updated using the standard Elo formula with K-factor proportional to match importance. Opposition Elo is automatically fetched from the database — inputs no longer depend on manual entry.

#### Situation Multiplier SM ∈ [0.8, 3.0]

$$
\text{SM} = \text{clamp}\!\left(P_{\text{game}} \times I_{\text{match}} \times B_{\text{form}},\ 0.8,\ 3.0\right)
$$

**Batting pressure index** (when batting):

$$
P_{\text{game}} = \text{clip}\!\left(1 + \beta \cdot \left(\frac{\text{RRR}}{\max(\text{CRR}, 0.1)} - 1\right) \cdot \left(1 - \frac{W_{\text{exit}}}{10}\right),\ 0.8,\ 2.0\right)
$$

**Bowling pressure index** (when bowling only):

$$
P_{\text{game}} = \text{clip}\!\left(1 + \gamma \cdot (\phi_{\text{phase}} - 1),\ 0.8,\ 2.0\right), \quad \phi \in \{1.0, 0.9, 1.3\}\ \text{(pp, mid, death)}
$$

**Match importance** $I_{\text{match}} = \text{importance} \times \tau_{\text{tier}}$, where:

$$
\tau_{\text{tier}} \in \{0.7, 0.85, 1.0, 1.2\}\ \text{for club, district, national, international}
$$

**Form recovery bonus** $B_{\text{form}} = 1.1$ if the player's average IM score over the last 3 matches $< 35$, else $1.0$. This rewards bounce-backs.

### 2.2 Rolling Aggregation with Recency Decay

$$
\text{Rolling\_IM} = \frac{\sum_{i=0}^{\min(n,10)-1} e^{-\lambda i} \cdot R_i}{\sum_{i=0}^{\min(n,10)-1} e^{-\lambda i}}, \quad \lambda = 0.15
$$

where $R_0$ is the most recent raw impact, $R_1$ the second-most-recent, etc. A minimum of 3 innings is required for a valid score.

### 2.3 Normalization to 0–100

**Small population (< 10 players with scores):**

$$
\text{IM} = \text{clip}\!\left(\frac{100}{1 + e^{-k_s \cdot z}},\ 0,\ 100\right), \quad z = \frac{\text{Rolling\_IM} - \mu_{\text{pop}}}{\sigma_{\text{pop}}}, \quad k_s = 0.9
$$

where $\mu_{\text{pop}}$ and $\sigma_{\text{pop}}$ are the population mean and standard deviation of all rolling raw impacts.

**Large population (≥ 10 players):**

$$
\text{IM} = \text{clip}\!\left(\rho + 50 - \rho_{\text{median}},\ 0,\ 100\right)
$$

where $\rho = 100 \cdot P(\text{Rolling} \leq x)$ is the percentile rank, shifted so the median always maps to exactly 50. This makes the scale self-calibrating as the player pool grows.

---

## 3. Model / Algorithm Explanation

### 3.1 End-to-End Pipeline (per match contribution)

```
Input: player_id, match_id, batting/bowling/fielding stats, context metadata
    │
    ├─ Step 1 : Ensure player + match records exist in DB
    │           Auto-fetch opposition Elo from team_elo_ratings table
    │
    ├─ Step 2 : Form-recovery bonus — pre-fetch last 3 IM scores
    │
    ├─ Step 3 : Compute Performance Score  P ∈ (0, 1)
    │           Compute Context Multiplier CM ∈ [0.5, 1.8]
    │           Compute Situation Multiplier SM ∈ [0.8, 3.0]
    │           Raw Impact = clamp(P × CM × SM, 0, 2.0)
    │
    ├─ Step 4 : Upsert match_contributions with sub-scores stored
    │
    ├─ Step 5 : Fetch last 10 innings → IQR-clip outliers → compute Rolling IM
    │
    ├─ Step 6 : Normalize to 0-100
    │           (parametric if < 10 players, percentile if ≥ 10)
    │
    ├─ Step 7 : Detect trend (compare mean of last 3 vs. prior 3)
    │
    ├─ Step 8 : Persist PlayerImpactScore (score, percentile, trend, format)
    │
    ├─ Step 9 : Auto-update team Elo ratings (standard Elo formula)
    │
    └─ Return : ImpactResponse with full breakdown
```

### 3.2 Recency via Exponential Decay

The decay factor $e^{-0.15i}$ means:

| Innings ago | Weight |
|---|---|
| 0 (most recent) | 1.000 |
| 1 | 0.861 |
| 2 | 0.741 |
| 5 | 0.472 |
| 9 (oldest in window) | 0.259 |

The most recent innings carries ~3.9× more weight than the oldest. This ensures the metric reflects current form, not career averages.

### 3.3 Data-Driven Weight Learning

The system includes a full weight optimizer (`POST /admin/retrain`) that learns feature coefficients directly from match outcome data:

**Problem setting:** Given a contribution with feature vector $\mathbf{x}$ (runs, SR-above-base, wickets, economy-saving, …), predict $y \in \{0, 1\}$ = did the player's team win?

**Objective:** Minimise the logistic loss with L2 regularisation:

$$
\mathcal{L}(\mathbf{w}) = -\frac{1}{N}\sum_{i=1}^N \left[y_i \log \sigma(\mathbf{x}_i^\top \mathbf{w}) + (1-y_i)\log(1-\sigma(\mathbf{x}_i^\top \mathbf{w}))\right] + \lambda \|\mathbf{w}\|^2
$$

**Solver:** scipy L-BFGS-B with analytical gradients and cricket-sensible box constraints (e.g., w_runs ∈ [0.10, 3.00]).

**Interpretation:** Coefficients that maximise win-prediction power are the statistically optimal weights. The system ships with hand-tuned priors (warm start) and refines them as match data accumulates — a disciplined Bayesian-style update.

---

## 4. Assumptions & Design Choices

| Decision | Choice | Justification |
|---|---|---|
| Rolling window | Last 10 innings | Long enough for signal; short enough to reflect current form. Consistent with CricHeroes data availability. |
| Decay rate λ | 0.15 | Half-life ≈ 4.6 innings: a 5-inning-old performance contributes ~50% of current weight. Cricket careers are volatile; faster decay than λ=0.1 reflects this. |
| Raw impact cap | 2.0 | Prevents a single superhuman performance from permanently inflating the score. Anti-gaming. |
| Context cap | [0.5, 1.8] | Ensures opposition quality adjusts meaningfully without dominating — players cannot manufacture impact by only playing elite teams. |
| Situation cap | [0.8, 3.0] | 3× maximum bonus for the highest-pressure scenario (e.g., death-over heroics in a World Cup final). The 0.8 floor prevents extreme negative weighting. |
| Minimum innings gate | 3 | Avoids spurious IM scores for players with one outlier match. |
| Allrounder split | Adaptive (data-driven per match) | A batsman who scored 75* and took 0 wickets should have that innings weighted 100% batting. Static 60/40 would incorrectly dilute it. |
| Normalization dual-mode | Parametric (< 10 players) → Percentile (≥ 10) | Parametric uses population priors (avoids cold-start artifacts); percentile gives self-calibrating relative scale at scale. |
| Stumping weight (0.5) vs. run-out (1.5) | Run-outs require athleticism + initiative; stumpings are positional. Anti-gaming: WK cannot farm stumpings to inflate IM. |
| Format weights | T10=0.9, T20=1.0, ODI=1.1, Test=1.2 | Reflects duration and tactical complexity; consistent with ICC Championship points weighting. |
| Elo K-factor | K = 32 × match_importance | Standard ELO K=32 for top-level play; scaled so more important matches cause bigger Elo updates. |

---

## 5. Sample Outputs

### 5.1 Worked Example: P001 — Rohit Sharma, T20 Hero Knock

**Match:** Chasing 185, MI vs RCB. Score: 75*(43) with 5 sixes, 7 fours. MI won.
**Context:** Opposition Elo 1080, 2nd innings, national tournament.
**Situation entry:** 2 wickets down at entry, RRR = 10.5, CRR = 8.0, 10 overs left.

| Sub-score | Value | Explanation |
|---|---|---|
| Batting raw | ~78.4 | 75 runs + SR premium (174 vs 100 base) + 12 boundaries |
| Performance Score P | 0.952 | z = 5.28 → sigmoid → 0.952 |
| Context Multiplier | 1.167 | Elo +0.08, T20 × 1.0, 2nd innings × 1.15 |
| Pressure Index | 1.241 | RRR/CRR = 1.31, wickets in hand = 5 |
| Match Importance | 1.0 × 1.0 = 1.0 | national, importance 1.0 |
| Situation Multiplier | 1.241 | |
| **Raw Impact** | **1.384** | 0.952 × 1.167 × 1.241 (capped at 2.0) |

After 5 innings with this as the most recent, rolling IM ≈ 0.92. Normalized → **IM ≈ 78.0**

*Classification: High Impact (green zone, 65–80)*

### 5.2 Comparative Table: 7 Sample Players

| Player | Role | IM (T20) | Zone | Trend |
|---|---|---|---|---|
| Rohit Sharma | Allrounder | 78.0 | High Impact | ↑ Rising |
| Jasprit Bumrah | Bowler | 74.2 | High Impact | → Stable |
| Virat Kohli | Batsman | 71.4 | High Impact | ↑ Rising |
| Hardik Pandya | Allrounder | 65.8 | High Impact | → Stable |
| Ravindra Jadeja | Allrounder | 62.3 | Neutral | ↓ Falling |
| KL Rahul | WK-Batsman | 58.1 | Neutral | → Stable |
| Shubman Gill | Batsman | 53.4 | Neutral | ↑ Rising |

*Values from seeded demo data.*

### 5.3 Synthetic Edge Cases (from test suite)

| Scenario | Expected | Observed |
|---|---|---|
| 75*(40), death over, 7 wickets down, elite opp., WC final | IM ∈ [72, 100] | ✅ |
| 25 runs in dead rubber vs. club-level side | IM ∈ [0, 50] | ✅ |
| 4 overs, 2/22, death over, national final | IM ∈ [60, 92] | ✅ |
| Did not bat or bowl | Raw ≤ 0.25 | ✅ |
| Test century (75 balls) vs. elite opposition 2nd innings | IM ∈ [65, 100] | ✅ |

---

## 6. Robustness & Anti-Gaming Analysis

### 6.1 Single-Inning Inflation

**Threat:** A player scores 200* once and rides that for months.

**Mitigations:**
- Raw impact cap at 2.0 — no single inning can exceed this regardless of stats
- Minimum 3 innings gate — one inning cannot produce a valid IM
- Recency decay — a 10-inning-old 200 carries only 25.9% weight
- Rolling window resets perspective every ≤ 10 innings

### 6.2 "Easy Match" Farming

**Threat:** Player pads stats against tier=club, Elo=700 opponents.

**Mitigations:**
- Context Multiplier capped at 0.5 minimum — weak opposition can reduce impact by up to 50%
- Opposition Elo is auto-maintained from actual match results — cannot be manually inflated
- Tournament tier multiplier: club = 0.7× vs. international = 1.2× on Situation Multiplier

### 6.3 Wicketkeeper Stacking

**Threat:** WK claims stumpings on every delivery to inflate fielding score.

**Mitigation:** Stumping weight (0.5) is deliberately less than catch weight (1.0) and run-out weight (1.5). Stumpings are positional; run-outs require team play and initiative.

### 6.4 Allrounder Double-Counting

**Threat:** Allrounder plays both roles every match, double-accumulating.

**Mitigation:** The adaptive split ($\alpha_{\text{bat}} + \alpha_{\text{bowl}} = 1$) **normalises** the allrounder contribution — total weight is always 1.0 × perf_raw regardless of how it is split between bat and bowl. There is no additive double-count.

### 6.5 Distribution Drift

**Threat:** Score distribution drifts as more players enter the system (grade inflation/deflation).

**Mitigations:**
- `POST /admin/calibrate` recalculates population $\mu$/$\sigma$ from real data and updates the normalization curve live
- `GET /admin/drift` — live drift-detection endpoint: fetches all current IM scores, splits into baseline / current halves, computes Jensen-Shannon divergence and alerts when JSD > configurable threshold (default 0.1). Also reports the null-rate (fraction of players with no valid IM score).
- At ≥ 10 players, normalization automatically switches to percentile-based (fully self-calibrating)

### 6.6 Small Sample Noise

**Threat:** Players with 1–2 innings receive extreme scores.

**Mitigation:** `min_innings = 3` gate — the API returns `im_score = null` until a player has at least 3 labelled innings. IQR-based outlier clipping (`smooth_and_clip`) further dampens spikes before rolling aggregation.

---

## 7. Appendix: System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                           │
│  LeaderboardPage  │  PlayerProfile   │  ComputePage             │
│  ImpactMeter (SVG gauge 0–100)       │  IMTrendChart            │
└──────────────────────┬──────────────────────────────────────────┘
                       │ /api/* (Vite proxy → FastAPI)
┌──────────────────────▼──────────────────────────────────────────┐
│                   FastAPI REST API (:8000)                       │
│  POST /compute          GET /leaderboard (Redis-cached 60s)     │
│  GET /player/{id}/impact│ GET /player/{id}/history              │
│  POST /admin/retrain    │ POST /admin/calibrate                 │
│  GET /admin/drift       │ GET|POST /teams/{id}/elo              │
└────────────┬──────────────────────────────┬─────────────────────┘
             │                              │
┌────────────▼──────────┐       ┌───────────▼───────────┐
│  Scoring Engine       │       │  Training Optimizer   │
│  engine.py            │       │  optimizer.py         │
│  P × CM × SM formula  │       │  scipy L-BFGS-B       │
│  Rolling IM + decay   │       │  logistic loss        │
│  Normalization (dual) │       │  weight learning      │
└────────────┬──────────┘       └───────────────────────┘
             │
┌────────────▼──────────────────────────────────────────┐
│  PostgreSQL 15                                        │
│  players │ matches │ match_contributions              │
│  player_impact_scores │ team_elo_ratings              │
└────────────┬──────────────────────────────────────────┘
             │
┌────────────▼──────────┐       ┌───────────────────────┐
│  Redis 7              │       │  Monitoring           │
│  leaderboard cache    │       │  drift.py             │
│  (60s TTL, auto-      │       │  JSD drift detection  │
│   invalidated on      │       │  null-rate alerting   │
│   POST /compute)      │       │  spike detection      │
└───────────────────────┘       └───────────────────────┘
```

### Key Design Choices Summary

| Property | How achieved |
|---|---|
| **Robust** | Caps, gates, IQR clipping, JSD drift monitoring |
| **Data-driven** | Weight optimizer learns from win/loss outcomes; Elo auto-updated; adaptive allrounder split; dual normalization calibrates from real data |
| **Context-aware** | Opposition Elo (auto-maintained), format weights, innings position, phase, pressure index |
| **Scalable** | PostgreSQL + connection pooling; Redis for leaderboard caching (60s TTL, fault-tolerant, auto-invalidated on new scores); Docker-composable; endpoints paginated |
| **Non-gameable** | Anti-inflation caps, weak-opponent penalty, stumping weight, min innings gate, allrounder normalization |
