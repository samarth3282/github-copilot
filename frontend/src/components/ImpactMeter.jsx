// SVG multi-segment gauge matching the other_project design
// score: 0–100

function getZone(score) {
    if (score >= 80) return { label: "Elite Impact", color: "#a78bfa", bg: "rgba(167,139,250,0.15)" };
    if (score >= 65) return { label: "High Impact", color: "#34d399", bg: "rgba(52,211,153,0.15)" };
    if (score >= 35) return { label: "Neutral", color: "#fbbf24", bg: "rgba(251,191,36,0.15)" };
    return { label: "Below Par", color: "#f87171", bg: "rgba(248,113,113,0.15)" };
}

export default function ImpactMeter({ score, inningsCount = 0, size = 200 }) {
    const safeScore = score == null ? 0 : Math.min(100, Math.max(0, score));
    const zone = getZone(safeScore);
    const cx = size / 2, cy = size * 0.62, r = size * 0.38;
    const startAngle = 200, endAngle = 340;
    const totalArc = endAngle - startAngle;
    const needleAngle = startAngle + (safeScore / 100) * totalArc;

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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <svg width={size} height={size * 0.78} viewBox={`0 0 ${size} ${size * 0.78}`}>
                <path d={arcPath(startAngle, endAngle, r)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={size * 0.07} />
                {segments.map((seg, i) => {
                    const litEnd = Math.min(seg.to, needleAngle);
                    if (seg.from >= needleAngle) {
                        // Segment is entirely past the needle — render full segment dimmed
                        return <path key={i} d={arcPath(seg.from, seg.to, r)} fill="none" stroke={seg.color} strokeWidth={size * 0.065} opacity={0.15} />;
                    }
                    return (
                        <g key={i}>
                            <path d={arcPath(seg.from, litEnd, r)} fill="none" stroke={seg.color} strokeWidth={size * 0.065} opacity={1} />
                            {litEnd < seg.to && (
                                <path d={arcPath(litEnd, seg.to, r)} fill="none" stroke={seg.color} strokeWidth={size * 0.065} opacity={0.15} />
                            )}
                        </g>
                    );
                })}
                <polygon
                    points={`${needle.x},${needle.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
                    fill={zone.color} opacity={0.95}
                />
                <circle cx={cx} cy={cy} r={size * 0.045} fill="#1a1a2e" stroke={zone.color} strokeWidth={2} />
                <text x={cx} y={cy - r * 1.28} textAnchor="middle" fontSize={size * 0.095} fontWeight="800" fill={zone.color} fontFamily="'Barlow Condensed', sans-serif">
                    {safeScore.toFixed(1)}
                </text>
                <text x={cx} y={cy - r * 1.07} textAnchor="middle" fontSize={size * 0.057} fill={zone.color} fontFamily="'Barlow Condensed', sans-serif" letterSpacing="1">
                    {zone.label.toUpperCase()}
                </text>
            </svg>
            {inningsCount > 0 && (
                <div style={{ fontSize: 12, color: "#64748b", fontFamily: "'Barlow Condensed', sans-serif" }}>
                    Based on {inningsCount} innings
                </div>
            )}
        </div>
    );
}
