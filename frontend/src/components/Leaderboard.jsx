import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";

const TREND_ICON = { rising: "↑", falling: "↓", stable: "→" };
const TREND_CLASS = {
    rising: "text-green-400",
    falling: "text-red-400",
    stable: "text-gray-400",
};

const IM_COLOR = (score) => {
    if (score >= 80) return "text-indigo-400";
    if (score >= 65) return "text-emerald-400";
    if (score >= 35) return "text-amber-400";
    return "text-red-400";
};

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

    if (loading) return <div className="text-center text-gray-500 py-12">Loading leaderboard…</div>;
    if (error) return <div className="text-center text-red-500 py-12">{error}</div>;
    if (!rows.length) return <div className="text-center text-gray-500 py-12">No data yet. Seed the DB first.</div>;

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-gray-500 border-b border-gray-800 text-left">
                        <th className="pb-3 px-2 w-10">#</th>
                        <th className="pb-3 px-2">Player</th>
                        <th className="pb-3 px-2">Team</th>
                        <th className="pb-3 px-2">Role</th>
                        <th className="pb-3 px-2 text-right">IM Score</th>
                        <th className="pb-3 px-2 text-right">Percentile</th>
                        <th className="pb-3 px-2 text-center">Trend</th>
                        <th className="pb-3 px-2 text-center">Innings</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr
                            key={row.player_id}
                            onClick={() => navigate(`/player/${row.player_id}?format=${format}`)}
                            className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
                        >
                            <td className="py-3 px-2 text-gray-500 font-mono">{row.rank}</td>
                            <td className="py-3 px-2 font-semibold text-white">{row.name}</td>
                            <td className="py-3 px-2">
                                <span className="badge bg-gray-800 text-gray-300">{row.team || "—"}</span>
                            </td>
                            <td className="py-3 px-2 capitalize text-gray-400">{row.role}</td>
                            <td className={`py-3 px-2 text-right font-bold text-xl ${IM_COLOR(row.im_score)}`}>
                                {row.im_score.toFixed(1)}
                            </td>
                            <td className="py-3 px-2 text-right text-gray-400">
                                {row.im_percentile.toFixed(0)}th
                            </td>
                            <td className={`py-3 px-2 text-center font-bold ${TREND_CLASS[row.trend] || "text-gray-400"}`}>
                                {TREND_ICON[row.trend] || "—"} <span className="text-xs font-normal capitalize">{row.trend}</span>
                            </td>
                            <td className="py-3 px-2 text-center text-gray-500">{row.innings_count}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
