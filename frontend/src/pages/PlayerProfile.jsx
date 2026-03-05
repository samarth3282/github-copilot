import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import ImpactMeter from "../components/ImpactMeter";
import IMTrendChart from "../components/IMTrendChart";
import api from "../api";

const FORMATS = ["T20", "ODI", "Test", "T10"];

function StatCard({ label, value, sub }) {
    return (
        <div className="card p-4 text-center">
            <div className="text-2xl font-black text-white">{value ?? "—"}</div>
            <div className="text-xs text-gray-500 mt-1">{label}</div>
            {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
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

    if (loading) return <div className="text-center text-gray-500 py-20">Loading player profile…</div>;
    if (error) return (
        <div className="text-center py-20 space-y-4">
            <p className="text-red-400">{error}</p>
            <Link to="/leaderboard" className="btn-secondary">← Back to Leaderboard</Link>
        </div>
    );

    // Derived batting stats from breakdown
    const batRows = breakdown.filter((r) => r.runs > 0);
    const bowlRows = breakdown.filter((r) => r.economy != null);
    const avgRuns = batRows.length ? (batRows.reduce((s, r) => s + r.runs, 0) / batRows.length).toFixed(1) : "—";
    const avgEco = bowlRows.length ? (bowlRows.reduce((s, r) => s + r.economy, 0) / bowlRows.length).toFixed(2) : "—";
    const totalWkts = breakdown.reduce((s, r) => s + (r.wickets || 0), 0);

    const TREND_ICON = { rising: "↑", falling: "↓", stable: "→" };
    const TREND_CLASS = { rising: "text-green-400", falling: "text-red-400", stable: "text-gray-400" };

    return (
        <div className="space-y-6">
            {/* Back */}
            <Link to="/leaderboard" className="text-gray-500 hover:text-white text-sm">← Leaderboard</Link>

            {/* Player header */}
            <div className="card p-6 flex flex-wrap items-center gap-6">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-600 to-indigo-600
                        flex items-center justify-center text-2xl font-black text-white">
                    {player?.name?.[0] ?? "?"}
                </div>
                <div className="flex-1">
                    <h1 className="text-2xl font-black text-white">{player?.name}</h1>
                    <div className="flex gap-3 mt-1 text-sm text-gray-400">
                        <span>{player?.team || "—"}</span>
                        <span>•</span>
                        <span className="capitalize">{player?.role}</span>
                        <span>•</span>
                        <span>ID: {id}</span>
                    </div>
                </div>
                {/* Format selector */}
                <div className="flex gap-1 bg-gray-800 rounded-xl p-1">
                    {FORMATS.map((f) => (
                        <button
                            key={f}
                            onClick={() => setFormat(f)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${format === f ? "bg-green-600 text-white" : "text-gray-400 hover:text-white"
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Impact Meter + quick stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card p-6 flex flex-col items-center md:col-span-1">
                    <ImpactMeter
                        score={impact?.im_score}
                        inningsCount={impact?.innings_in_window ?? 0}
                    />
                    {impact && (
                        <div className={`mt-3 text-sm font-semibold flex items-center gap-2 ${TREND_CLASS[impact.trend]}`}>
                            {TREND_ICON[impact.trend]} {impact.trend}
                        </div>
                    )}
                </div>

                <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4 content-start">
                    <StatCard label="IM Score" value={impact?.im_score?.toFixed(1)} />
                    <StatCard label="Percentile" value={impact ? `${impact.im_percentile?.toFixed(0)}th` : null} />
                    <StatCard label="Innings" value={impact?.innings_in_window} />
                    <StatCard label="Rolling Raw" value={impact?.rolling_raw_impact?.toFixed(3)} />
                    <StatCard label="Batting Avg" value={avgRuns} />
                    <StatCard label="Avg Economy" value={avgEco} />
                    <StatCard label="Wickets" value={totalWkts || "—"} sub="last 10" />
                    <StatCard label="Trend"
                        value={<span className={TREND_CLASS[impact?.trend]}>{TREND_ICON[impact?.trend] ?? "—"}</span>}
                    />
                </div>
            </div>

            {/* Trend chart */}
            {history.length > 0 && (
                <div className="card p-6">
                    <h2 className="text-lg font-bold text-white mb-4">IM Trend — Last {history.length} matches</h2>
                    <IMTrendChart history={history} />
                </div>
            )}

            {/* Per-match breakdown */}
            {breakdown.length > 0 && (
                <div className="card p-6">
                    <h2 className="text-lg font-bold text-white mb-4">Per-Match Score Breakdown</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-gray-500 border-b border-gray-800 text-left">
                                    <th className="pb-3 px-2">Match</th>
                                    <th className="pb-3 px-2">Fmt</th>
                                    <th className="pb-3 px-2 text-right">Runs</th>
                                    <th className="pb-3 px-2 text-right">Balls</th>
                                    <th className="pb-3 px-2 text-right">Wkts</th>
                                    <th className="pb-3 px-2 text-right">Eco</th>
                                    <th className="pb-3 px-2 text-right">Perf</th>
                                    <th className="pb-3 px-2 text-right">CM</th>
                                    <th className="pb-3 px-2 text-right">SM</th>
                                    <th className="pb-3 px-2 text-right font-bold">Raw IM</th>
                                </tr>
                            </thead>
                            <tbody>
                                {breakdown.map((r) => (
                                    <tr key={r.match_id} className="border-b border-gray-800/50">
                                        <td className="py-2 px-2 font-mono text-xs text-gray-400">{r.match_id}</td>
                                        <td className="py-2 px-2 text-gray-400">{r.format}</td>
                                        <td className="py-2 px-2 text-right">{r.runs}</td>
                                        <td className="py-2 px-2 text-right text-gray-500">{r.balls}</td>
                                        <td className="py-2 px-2 text-right">{r.wickets}</td>
                                        <td className="py-2 px-2 text-right text-gray-400">{r.economy ?? "—"}</td>
                                        <td className="py-2 px-2 text-right text-gray-400">{r.performance_score?.toFixed(3)}</td>
                                        <td className="py-2 px-2 text-right text-gray-400">{r.context_multiplier?.toFixed(3)}</td>
                                        <td className="py-2 px-2 text-right text-gray-400">{r.situation_multiplier?.toFixed(3)}</td>
                                        <td className="py-2 px-2 text-right font-bold text-indigo-300">{r.raw_impact?.toFixed(3)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
