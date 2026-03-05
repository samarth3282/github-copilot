import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";

function getZoneColor(scores) {
    const avg = scores.filter(Boolean).reduce((a, b) => a + b, 0) / (scores.filter(Boolean).length || 1);
    if (avg >= 80) return "#a78bfa";
    if (avg >= 65) return "#34d399";
    if (avg >= 35) return "#fbbf24";
    return "#f87171";
}

export default function IMTrendChart({ history = [] }) {
    // history: [{computed_at, im_score, raw_impact, format}, ...] — newest first
    const reversed = [...history].reverse();

    const data = reversed.map((h) => {
        const d = new Date(h.computed_at);
        return {
            name: `${d.getDate()}/${d.getMonth() + 1}`,
            im: h.im_score ?? null,
            raw: h.raw_impact ?? null,
        };
    });

    const color = getZoneColor(data.map(d => d.im));
    const gradId = `imGrad_${color.replace("#", "")}`;

    return (
        <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <ReferenceLine y={50} stroke="#334155" strokeDasharray="4 4" />
                    <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 13 }}
                        itemStyle={{ color }}
                        formatter={(value, name) => [value?.toFixed(1), name === "im" ? "IM Score" : "Raw"]}
                    />
                    <Area type="monotone" dataKey="im" stroke={color} strokeWidth={2} fill={`url(#${gradId})`} dot={{ fill: color, r: 3 }} name="im" />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
