import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import ImpactMeter from "../components/ImpactMeter";
import IMTrendChart from "../components/IMTrendChart";
import api from "../api";

const FORMATS = ["T20", "ODI", "Test", "T10"];

const TREND_ICONS = { rising: "\u2191", falling: "\u2193", stable: "\u2192" };
const TREND_COLORS = { rising: "#34d399", falling: "#f87171", stable: "#fbbf24" };

function getZone(score) {
    if (score == null) return { color: "#64748b", bg: "rgba(100,116,139,0.15)" };
    if (score >= 80) return { color: "#a78bfa", bg: "rgba(167,139,250,0.15)" };
    if (score >= 65) return { color: "#34d399", bg: "rgba(52,211,153,0.15)" };
    if (score >= 35) return { color: "#fbbf24", bg: "rgba(251,191,36,0.15)" };
    return { color: "#f87171", bg: "rgba(248,113,113,0.15)" };
}

function StatBox({ label, value }) {
    return (
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif" }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0", fontFamily: "'Barlow Condensed', sans-serif" }}>{value ?? "\u2014"}</div>
        </div>
    );
}

export default function PlayerProfile() {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const [format, setFormat] = useState(searchParams.get("format") || "T20");
    const [player, setPlayer] = useState(null);
    const [impact, setImpact] = useState(null);
    const [history, setHistory] = useState([]);
    const [breakdown, setBreakdown] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        setLoading(true);
        setError(null);
        Promise.all([
            api.getPlayer(id),
            api.getImpact(id, format).catch(() => null),
            api.getHistory(id, 10, format),
            api.getBreakdown(id, format),
        ])
            .then(([p, imp, hist, brk]) => {
                setPlayer(p);
                setImpact(imp);
                setHistory(hist);
                setBreakdown(brk);
            })
            .catch(() => setError("Player not found or no data yet."))
            .finally(() => setLoading(false));
    }, [id, format]);

    if (loading) return <div style={{ textAlign: "center", color: "#64748b", padding: "80px 0", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1 }}>LOADING PLAYER PROFILE...</div>;
    if (error) return (
        <div style={{ textAlign: "center", padding: "80px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <p style={{ color: "#f87171" }}>{error}</p>
            <Link to="/leaderboard" className="btn-secondary">{"\u2190"} Back to Leaderboard</Link>
        </div>
    );

    const batRows = breakdown.filter((r) => r.runs > 0);
    const bowlRows = breakdown.filter((r) => r.economy != null);
    const avgRuns = batRows.length ? (batRows.reduce((s, r) => s + r.runs, 0) / batRows.length).toFixed(1) : null;
    const avgEco = bowlRows.length ? (bowlRows.reduce((s, r) => s + r.economy, 0) / bowlRows.length).toFixed(2) : null;
    const totalWkts = breakdown.reduce((s, r) => s + (r.wickets || 0), 0);
    const zone = getZone(impact?.im_score);
    const trendColor = TREND_COLORS[impact?.trend] || "#64748b";

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Back link */}
            <Link to="/leaderboard" style={{ color: "#64748b", fontSize: 13, textDecoration: "none", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1 }}>
                {"\u2190"} LEADERBOARD
            </Link>

            {/* Player header card */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "20px 24px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: `linear-gradient(135deg, ${zone.color}40, ${zone.color}15)`, border: `2px solid ${zone.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: zone.color, fontFamily: "'Barlow Condensed', sans-serif", flexShrink: 0 }}>
                    {player?.name?.[0] ?? "?"}
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#e2e8f0", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1 }}>{player?.name}</div>
                    <div style={{ fontSize: 13, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {player?.team || "\u2014"} &middot; <span style={{ textTransform: "capitalize" }}>{player?.role}</span> &middot; ID: {id}
                    </div>
                </div>
                <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 4 }}>
                    {FORMATS.map((f) => (
                        <button key={f} onClick={() => setFormat(f)}
                            style={{ background: format === f ? "rgba(99,102,241,0.5)" : "transparent", border: format === f ? "1px solid rgba(99,102,241,0.5)" : "1px solid transparent", borderRadius: 7, padding: "5px 12px", color: format === f ? "#e2e8f0" : "#64748b", fontSize: 12, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, cursor: "pointer", transition: "all 0.15s", textTransform: "uppercase" }}>
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Impact Meter + stats row */}
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
                {/* Meter panel */}
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, flex: "0 0 auto" }}>
                    <ImpactMeter score={impact?.im_score} inningsCount={impact?.innings_in_window ?? 0} size={200} />
                    {impact && (
                        <div style={{ display: "flex", gap: 6, alignItems: "center", background: zone.bg, border: `1px solid ${zone.color}40`, borderRadius: 20, padding: "4px 14px" }}>
                            <span style={{ color: trendColor, fontSize: 16 }}>{TREND_ICONS[impact.trend]}</span>
                            <span style={{ fontSize: 12, color: zone.color, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1 }}>{impact.trend?.toUpperCase()}</span>
                        </div>
                    )}
                </div>

                {/* Stats grid */}
                <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2, marginBottom: 10 }}>PERFORMANCE STATS</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <StatBox label="IM Score" value={impact?.im_score?.toFixed(1)} />
                        <StatBox label="Percentile" value={impact ? `${impact.im_percentile?.toFixed(0)}th` : null} />
                        <StatBox label="Innings (window)" value={impact?.innings_in_window} />
                        <StatBox label="Rolling Raw IM" value={impact?.rolling_raw_impact?.toFixed(3)} />
                        <StatBox label="Batting Avg" value={avgRuns} />
                        <StatBox label="Avg Economy" value={avgEco} />
                        <StatBox label="Wickets (last 10)" value={totalWkts || null} />
                        <StatBox label="Format" value={format} />
                    </div>
                </div>
            </div>

            {/* Trend chart */}
            {history.length > 0 && (
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 24 }}>
                    <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2, marginBottom: 14 }}>IM TREND \u2014 LAST {history.length} MATCHES</div>
                    <IMTrendChart history={history} />
                </div>
            )}

            {/* Per-match breakdown */}
            {breakdown.length > 0 && (
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 24 }}>
                    <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2, marginBottom: 14 }}>PER-MATCH SCORE BREAKDOWN</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {breakdown.map((r) => {
                            const raw = r.raw_impact ?? 0;
                            const rz = getZone(raw * 50);
                            return (
                                <div key={r.match_id} style={{ display: "flex", gap: 10, alignItems: "center", background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "10px 14px", borderLeft: `3px solid ${rz.color}` }}>
                                    <div style={{ flex: "0 0 90px", fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.match_id}</div>
                                    <div style={{ fontSize: 12, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", flexShrink: 0 }}>{r.format}</div>
                                    {r.runs > 0 && <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "'Barlow Condensed', sans-serif" }}>{r.runs}({r.balls})</div>}
                                    {r.wickets > 0 && <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "'Barlow Condensed', sans-serif" }}>{r.wickets}wkts</div>}
                                    {r.economy != null && <div style={{ fontSize: 12, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif" }}>eco:{r.economy?.toFixed(2)}</div>}
                                    <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
                                        <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif" }}>P:{r.performance_score?.toFixed(3)}</div>
                                        <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif" }}>C:{r.context_multiplier?.toFixed(3)}</div>
                                        <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif" }}>S:{r.situation_multiplier?.toFixed(3)}</div>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: rz.color, fontFamily: "'Barlow Condensed', sans-serif", minWidth: 48, textAlign: "right" }}>{r.raw_impact?.toFixed(3)}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
