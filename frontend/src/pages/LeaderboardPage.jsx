import { useState } from "react";
import Leaderboard from "../components/Leaderboard";

const FORMATS = ["T20", "ODI", "Test", "T10"];

const ZONES = [
    { range: "0-35", label: "Below Par", color: "#f87171" },
    { range: "35-65", label: "Neutral", color: "#fbbf24" },
    { range: "65-80", label: "High Impact", color: "#34d399" },
    { range: "80-100", label: "Elite Impact", color: "#a78bfa" },
];

export default function LeaderboardPage() {
    const [format, setFormat] = useState("T20");

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                <div>
                    <div style={{ fontSize: 26, fontWeight: 900, color: "#e2e8f0", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2 }}>
                        {"\uD83C\uDFC6"} IMPACT LEADERBOARD
                    </div>
                    <div style={{ fontSize: 13, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>
                        Ranked by recency-weighted Impact Metric (0-100 · 50 = neutral)
                    </div>
                </div>
                <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 4 }}>
                    {FORMATS.map((f) => (
                        <button key={f} onClick={() => setFormat(f)}
                            style={{ background: format === f ? "rgba(99,102,241,0.5)" : "transparent", border: format === f ? "1px solid rgba(99,102,241,0.5)" : "1px solid transparent", borderRadius: 7, padding: "7px 16px", color: format === f ? "#e2e8f0" : "#64748b", fontSize: 13, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1, cursor: "pointer", transition: "all 0.15s", textTransform: "uppercase" }}>
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Zone legend */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "12px 16px" }}>
                {ZONES.map(z => (
                    <div key={z.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 800, color: z.color, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13 }}>{z.range}</span>
                        <span style={{ color: "#94a3b8", fontSize: 13 }}>{z.label}</span>
                    </div>
                ))}
            </div>

            {/* Table */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "20px 16px" }}>
                <Leaderboard format={format} limit={50} />
            </div>
        </div>
    );
}
