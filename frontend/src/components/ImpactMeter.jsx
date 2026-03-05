// SVG semicircular Impact Meter gauge
// score: 0–100

const ZONES = [
    { range: [0, 35], color: "#EF4444", label: "Below Par", bg: "text-red-400" },
    { range: [35, 65], color: "#F59E0B", label: "Neutral", bg: "text-amber-400" },
    { range: [65, 80], color: "#10B981", label: "High Impact", bg: "text-emerald-400" },
    { range: [80, 101], color: "#6366F1", label: "Elite Impact", bg: "text-indigo-400" },
];

function getZone(score) {
    return ZONES.find((z) => score >= z.range[0] && score < z.range[1]) || ZONES[3];
}

function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
    const s = polarToCartesian(cx, cy, r, endAngle);
    const e = polarToCartesian(cx, cy, r, startAngle);
    const large = endAngle - startAngle <= 180 ? "0" : "1";
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
}

export default function ImpactMeter({ score, inningsCount = 0, size = 240 }) {
    const safeScore = score == null ? 0 : Math.min(100, Math.max(0, score));
    const zone = getZone(safeScore);

    // Arc: -180° (left) to 0° (right) = 180° sweep
    const arcStart = -180;
    const arcEnd = arcStart + safeScore * 1.8;

    // Needle: starts at -90° (pointing up = score 50)
    const needleAngle = -180 + safeScore * 1.8;
    const cx = size / 2;
    const cy = (size * 120) / 240; // 120 when size=240
    const r = (size * 100) / 240;
    const needleLen = r - 8;

    const needle = polarToCartesian(cx, cy, needleLen, needleAngle);

    return (
        <div className="flex flex-col items-center gap-2">
            <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`}>
                {/* Background arc */}
                <path
                    d={describeArc(cx, cy, r, -180, 0)}
                    fill="none"
                    stroke="#374151"
                    strokeWidth={size * 0.083}
                    strokeLinecap="round"
                />
                {/* Coloured fill arc */}
                {safeScore > 0 && (
                    <path
                        d={describeArc(cx, cy, r, arcStart, arcEnd)}
                        fill="none"
                        stroke={zone.color}
                        strokeWidth={size * 0.083}
                        strokeLinecap="round"
                    />
                )}
                {/* Needle */}
                <line
                    x1={cx} y1={cy}
                    x2={needle.x} y2={needle.y}
                    stroke="#F9FAFB"
                    strokeWidth={size * 0.012}
                    strokeLinecap="round"
                />
                <circle cx={cx} cy={cy} r={size * 0.038} fill={zone.color} />

                {/* Scale labels */}
                <text x={size * 0.06} y={size * 0.6} fontSize={size * 0.048} fill="#6B7280" textAnchor="middle">0</text>
                <text x={cx} y={size * 0.09} fontSize={size * 0.048} fill="#6B7280" textAnchor="middle">50</text>
                <text x={size * 0.94} y={size * 0.6} fontSize={size * 0.048} fill="#6B7280" textAnchor="middle">100</text>
            </svg>

            {/* Score display */}
            <div className={`text-5xl font-black ${zone.bg}`}>
                {score == null ? "—" : safeScore.toFixed(1)}
            </div>
            <div className={`text-sm font-semibold ${zone.bg}`}>{zone.label}</div>
            {inningsCount > 0 && (
                <div className="text-xs text-gray-500">Based on last {inningsCount} innings</div>
            )}
        </div>
    );
}
