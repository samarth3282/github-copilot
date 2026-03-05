import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";

function getZone(score) {
    if (score >= 80) return { color: "#a78bfa", bg: "rgba(167,139,250,0.15)" };
    if (score >= 65) return { color: "#34d399", bg: "rgba(52,211,153,0.15)" };
    if (score >= 35) return { color: "#fbbf24", bg: "rgba(251,191,36,0.15)" };
    return { color: "#f87171", bg: "rgba(248,113,113,0.15)" };
}

const TREND_ICONS = { rising: "\u2191", falling: "\u2193", stable: "\u2192" };
const TREND_COLORS = { rising: "#34d399", falling: "#f87171", stable: "#fbbf24" };
const RANK_MEDALS = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"];

export default function Leaderboard({ format = "T20", limit = 20 }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        setLoading(true);
        api.getLeaderboard(format, limit)
            .then(setRows)
            .catch(() => setError("Failed to load leaderboard"))
            .finally(() => setLoading(false));
    }, [format, limit]);

    if (loading) return <div style={{ textAlign: "center", color: "#64748b", padding: "48px 0", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1 }}>LOADING LEADERBOARD...</div>;
    if (error) return <div style={{ textAlign: "center", color: "#f87171", padding: "48px 0" }}>{error}</div>;
    if (!rows.length) return <div style={{ textAlign: "center", color: "#64748b", padding: "48px 0" }}>No data yet. Seed the DB first.</div>;

    return (
        <div>
            {/* Header row */}
            <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 100px 100px 90px 90px", gap: 8, padding: "0 12px", marginBottom: 8 }}>
                {["#", "Player", "Role", "IM Score", "Trend", "Innings"].map(h => (
                    <div key={h} style={{ fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, textTransform: "uppercase" }}>{h}</div>
                ))}
            </div>
            {rows.map((row, i) => {
                const zone = getZone(row.im_score);
                const trendColor = TREND_COLORS[row.trend] || "#64748b";
                return (
                    <div key={row.player_id} onClick={() => navigate(`/player/${row.player_id}?format=${format}`)}
                        style={{ display: "grid", gridTemplateColumns: "44px 1fr 100px 100px 90px 90px", gap: 8, alignItems: "center", background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent", borderRadius: 8, padding: "12px 12px", marginBottom: 2, cursor: "pointer", transition: "background 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent"}
                    >
                        <div style={{ fontSize: i < 3 ? 18 : 14, fontWeight: 800, color: i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : i === 2 ? "#cd7f32" : "#475569", fontFamily: "'Barlow Condensed', sans-serif" }}>
                            {i < 3 ? RANK_MEDALS[i] : row.rank}
                        </div>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0", fontFamily: "'Barlow Condensed', sans-serif" }}>{row.name}</div>
                            <div style={{ fontSize: 12, color: "#475569", fontFamily: "'Barlow Condensed', sans-serif" }}>{row.team || "\u2014"}</div>
                        </div>
                        <div style={{ fontSize: 13, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", textTransform: "capitalize" }}>{row.role}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 40, height: 40, borderRadius: "50%", background: zone.bg, border: `2px solid ${zone.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: zone.color, fontFamily: "'Barlow Condensed', sans-serif" }}>
                                {row.im_score.toFixed(0)}
                            </div>
                            <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif" }}>{row.im_percentile?.toFixed(0)}th</div>
                        </div>
                        <div style={{ fontSize: 14, color: trendColor, fontFamily: "'Barlow Condensed', sans-serif" }}>
                            {TREND_ICONS[row.trend] || "\u2014"} <span style={{ fontSize: 12, textTransform: "capitalize" }}>{row.trend}</span>
                        </div>
                        <div style={{ fontSize: 13, color: "#475569", fontFamily: "'Barlow Condensed', sans-serif" }}>{row.innings_count}</div>
                    </div>
                );
            })}
        </div>
    );
}
