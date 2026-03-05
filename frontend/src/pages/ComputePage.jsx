import { useState, useEffect } from "react";
import ImpactMeter from "../components/ImpactMeter";
import api from "../api";

const FORMATS = ["T20", "ODI", "Test", "T10"];
const TIERS = ["club", "district", "national", "international"];
const PHASES = ["powerplay", "middle", "death"];
const ROLES = ["batsman", "bowler", "allrounder", "wk-batsman"];

const defaultForm = {
    match_id: "", player_id: "", player_name: "", team_id: "",
    match_date: new Date().toISOString().slice(0, 10),
    format: "T20", innings_number: 1, match_importance: 1.0,
    tournament_tier: "national", opposition_elo: 1000, player_role: "batsman",
    bat_enabled: false,
    runs_scored: 0, balls_faced: 0, fours: 0, sixes: 0, dots_faced: 0,
    batting_position: 3, wickets_fallen_entry: 0, rrr_at_entry: 8.0,
    crr_at_entry: 7.0, overs_left_at_entry: 10.0, wickets_in_hand_exit: 5, match_phase: "middle",
    bowl_enabled: false,
    overs_bowled: 0, runs_conceded: 0, wickets_taken: 0, maidens: 0, dot_balls_bowled: 0, match_phase_bowled: "middle",
    catches: 0, run_outs: 0, stumpings: 0,
};

const fieldStyle = { display: "flex", flexDirection: "column", gap: 4 };
const labelStyle = { fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, textTransform: "uppercase" };
const inputStyle = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "#e2e8f0", fontSize: 14, outline: "none", width: "100%", transition: "border-color 0.15s" };
const selectStyle = { ...inputStyle, cursor: "pointer" };
const sectionHeaderStyle = (color, borderColor) => ({ fontSize: 11, color, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${borderColor}`, paddingBottom: 6, marginBottom: 4 });

function Field({ label, name, type = "number", value, onChange, step, placeholder }) {
    return (
        <div style={fieldStyle}>
            <label style={labelStyle}>{label}</label>
            <input type={type} name={name} value={value} step={step} placeholder={placeholder}
                onChange={onChange} style={inputStyle}
                onFocus={e => e.target.style.borderColor = "rgba(99,102,241,0.6)"}
                onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"} />
        </div>
    );
}
function SelectField({ label, name, value, onChange, options }) {
    return (
        <div style={fieldStyle}>
            <label style={labelStyle}>{label}</label>
            <select name={name} value={value} onChange={onChange} style={selectStyle}>
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
        </div>
    );
}

export default function ComputePage() {
    const [form, setForm] = useState(defaultForm);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    function handle(e) {
        const { name, value, type, checked } = e.target;
        setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
    }

    async function submit(e) {
        e.preventDefault();
        setError(null);
        setResult(null);
        setLoading(true);
        const payload = {
            match_id: form.match_id, player_id: form.player_id, player_name: form.player_name,
            team_id: form.team_id, match_date: form.match_date, format: form.format,
            innings_number: Number(form.innings_number), match_importance: Number(form.match_importance),
            tournament_tier: form.tournament_tier, opposition_elo: Number(form.opposition_elo),
            player_role: form.player_role,
        };
        if (form.bat_enabled) {
            payload.batting = {
                runs_scored: Number(form.runs_scored), balls_faced: Number(form.balls_faced),
                fours: Number(form.fours), sixes: Number(form.sixes), dots_faced: Number(form.dots_faced),
                batting_position: Number(form.batting_position), wickets_fallen_entry: Number(form.wickets_fallen_entry),
                rrr_at_entry: Number(form.rrr_at_entry), crr_at_entry: Number(form.crr_at_entry),
                overs_left_at_entry: Number(form.overs_left_at_entry), wickets_in_hand_exit: Number(form.wickets_in_hand_exit),
                match_phase: form.match_phase,
            };
        }
        if (form.bowl_enabled) {
            payload.bowling = {
                overs_bowled: Number(form.overs_bowled), runs_conceded: Number(form.runs_conceded),
                wickets_taken: Number(form.wickets_taken), maidens: Number(form.maidens),
                dot_balls_bowled: Number(form.dot_balls_bowled), match_phase_bowled: form.match_phase_bowled,
            };
        }
        payload.fielding = { catches: Number(form.catches), run_outs: Number(form.run_outs), stumpings: Number(form.stumpings) };
        try {
            const res = await api.compute(payload);
            setResult(res);
        } catch (err) {
            setError(err.response?.data?.detail || err.message || "Computation failed.");
        } finally {
            setLoading(false);
        }
    }

    const imScore = result?.im_score;
    const cardStyle = { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "20px 20px", display: "flex", flexDirection: "column", gap: 16 };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#e2e8f0", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2 }}>
                    {"\u26A1"} IMPACT CALCULATOR
                </div>
                <div style={{ fontSize: 13, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>
                    Submit a match contribution to compute or refresh a player's IM score.
                </div>
            </div>

            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Match + Player */}
                <div style={cardStyle}>
                    <div style={sectionHeaderStyle("#a78bfa", "rgba(167,139,250,0.2)")}>Match &amp; Player</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                        <Field label="Match ID *" type="text" name="match_id" value={form.match_id} onChange={handle} />
                        <Field label="Player ID *" type="text" name="player_id" value={form.player_id} onChange={handle} />
                        <Field label="Player Name" type="text" name="player_name" value={form.player_name} onChange={handle} />
                        <Field label="Team ID" type="text" name="team_id" value={form.team_id} onChange={handle} />
                        <Field label="Match Date" type="date" name="match_date" value={form.match_date} onChange={handle} />
                        <SelectField label="Format" name="format" value={form.format} onChange={handle} options={FORMATS} />
                        <SelectField label="Player Role" name="player_role" value={form.player_role} onChange={handle} options={ROLES} />
                        <Field label="Innings #" name="innings_number" value={form.innings_number} onChange={handle} />
                        <Field label="Match Importance" type="number" step="0.1" name="match_importance" value={form.match_importance} onChange={handle} />
                        <SelectField label="Tournament Tier" name="tournament_tier" value={form.tournament_tier} onChange={handle} options={TIERS} />
                        <Field label="Opposition ELO" name="opposition_elo" value={form.opposition_elo} onChange={handle} />
                    </div>
                </div>

                {/* Batting */}
                <div style={cardStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <input id="bat-toggle" type="checkbox" name="bat_enabled" checked={form.bat_enabled} onChange={handle}
                            style={{ width: 16, height: 16, accentColor: "#a78bfa", cursor: "pointer" }} />
                        <label htmlFor="bat-toggle" style={{ ...sectionHeaderStyle("#a78bfa", "transparent"), borderBottom: "none", paddingBottom: 0, marginBottom: 0, cursor: "pointer" }}>Batting</label>
                    </div>
                    {form.bat_enabled && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                            <Field label="Runs Scored" name="runs_scored" value={form.runs_scored} onChange={handle} />
                            <Field label="Balls Faced" name="balls_faced" value={form.balls_faced} onChange={handle} />
                            <Field label="Fours" name="fours" value={form.fours} onChange={handle} />
                            <Field label="Sixes" name="sixes" value={form.sixes} onChange={handle} />
                            <Field label="Dots Faced" name="dots_faced" value={form.dots_faced} onChange={handle} />
                            <Field label="Bat Position" name="batting_position" value={form.batting_position} onChange={handle} />
                            <Field label="Wkts at Entry" name="wickets_fallen_entry" value={form.wickets_fallen_entry} onChange={handle} />
                            <Field label="Wkts in Hand" name="wickets_in_hand_exit" value={form.wickets_in_hand_exit} onChange={handle} />
                            <Field label="RRR at Entry" step="0.1" name="rrr_at_entry" value={form.rrr_at_entry} onChange={handle} />
                            <Field label="CRR at Entry" step="0.1" name="crr_at_entry" value={form.crr_at_entry} onChange={handle} />
                            <Field label="Overs Left" step="0.1" name="overs_left_at_entry" value={form.overs_left_at_entry} onChange={handle} />
                            <SelectField label="Match Phase" name="match_phase" value={form.match_phase} onChange={handle} options={PHASES} />
                        </div>
                    )}
                </div>

                {/* Bowling */}
                <div style={cardStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <input id="bowl-toggle" type="checkbox" name="bowl_enabled" checked={form.bowl_enabled} onChange={handle}
                            style={{ width: 16, height: 16, accentColor: "#34d399", cursor: "pointer" }} />
                        <label htmlFor="bowl-toggle" style={{ ...sectionHeaderStyle("#34d399", "transparent"), borderBottom: "none", paddingBottom: 0, marginBottom: 0, cursor: "pointer" }}>Bowling</label>
                    </div>
                    {form.bowl_enabled && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                            <Field label="Overs Bowled" step="0.1" name="overs_bowled" value={form.overs_bowled} onChange={handle} />
                            <Field label="Runs Conceded" name="runs_conceded" value={form.runs_conceded} onChange={handle} />
                            <Field label="Wickets Taken" name="wickets_taken" value={form.wickets_taken} onChange={handle} />
                            <Field label="Maidens" name="maidens" value={form.maidens} onChange={handle} />
                            <Field label="Dot Balls" name="dot_balls_bowled" value={form.dot_balls_bowled} onChange={handle} />
                            <SelectField label="Phase Bowled" name="match_phase_bowled" value={form.match_phase_bowled} onChange={handle} options={PHASES} />
                        </div>
                    )}
                </div>

                {/* Fielding */}
                <div style={cardStyle}>
                    <div style={sectionHeaderStyle("#fbbf24", "rgba(251,191,36,0.2)")}>Fielding</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                        <Field label="Catches" name="catches" value={form.catches} onChange={handle} />
                        <Field label="Run Outs" name="run_outs" value={form.run_outs} onChange={handle} />
                        <Field label="Stumpings" name="stumpings" value={form.stumpings} onChange={handle} />
                    </div>
                </div>

                <button type="submit" disabled={loading}
                    style={{ background: "linear-gradient(135deg, #6366f1, #a78bfa)", border: "none", borderRadius: 8, padding: "14px 24px", color: "white", fontSize: 15, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2, cursor: loading ? "not-allowed" : "pointer", textTransform: "uppercase", opacity: loading ? 0.6 : 1, width: "100%" }}>
                    {loading ? "COMPUTING..." : "COMPUTE IMPACT METRIC"}
                </button>
            </form>

            {error && (
                <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, padding: "14px 18px", color: "#f87171", fontSize: 14 }}>{error}</div>
            )}

            {result && (
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 24, display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, flex: "0 0 auto" }}>
                        <ImpactMeter score={imScore} inningsCount={result.innings_in_window} size={220} />
                    </div>
                    <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2, marginBottom: 4 }}>SCORE BREAKDOWN</div>
                        {[
                            { label: "IM Score", value: imScore?.toFixed(2), color: "#a78bfa" },
                            { label: "Percentile", value: `${result.im_percentile?.toFixed(1)}th`, color: "#a78bfa" },
                            { label: "Rolling Raw IM", value: result.rolling_raw_impact?.toFixed(4), color: "#94a3b8" },
                            { label: "Innings (window)", value: result.innings_in_window, color: "#94a3b8" },
                            { label: "Performance Score", value: result.breakdown?.performance_score?.toFixed(4), color: "#a78bfa" },
                            { label: "Context Multiplier", value: result.breakdown?.context_multiplier ? "\u00d7" + result.breakdown.context_multiplier.toFixed(4) : null, color: "#34d399" },
                            { label: "Situation Multiplier", value: result.breakdown?.situation_multiplier ? "\u00d7" + result.breakdown.situation_multiplier.toFixed(4) : null, color: "#fbbf24" },
                            { label: "Raw Impact", value: result.breakdown?.raw_impact?.toFixed(4), color: "#94a3b8" },
                        ].map(row => (
                            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "8px 12px" }}>
                                <span style={{ fontSize: 12, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif" }}>{row.label}</span>
                                <span style={{ fontSize: 14, fontWeight: 700, color: row.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{row.value ?? "\u2014"}</span>
                            </div>
                        ))}
                        {result.last_10_scores?.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2, marginBottom: 8 }}>LAST {result.last_10_scores.length} RAW IMPACTS</div>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    {result.last_10_scores.map((s, i) => (
                                        <span key={i} style={{ padding: "3px 8px", borderRadius: 4, fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", background: i === 0 ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.05)", color: i === 0 ? "#a78bfa" : "#94a3b8", border: i === 0 ? "1px solid rgba(99,102,241,0.5)" : "1px solid transparent" }}>
                                            {s.toFixed(3)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
