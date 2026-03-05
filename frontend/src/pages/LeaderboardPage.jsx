import { useState } from "react";
import Leaderboard from "../components/Leaderboard";

const FORMATS = ["T20", "ODI", "Test", "T10"];

export default function LeaderboardPage() {
    const [format, setFormat] = useState("T20");

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white">🏆 Impact Leaderboard</h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Ranked by recency-weighted Impact Metric (0–100 · 50 = neutral)
                    </p>
                </div>

                {/* Format selector */}
                <div className="flex gap-1 bg-gray-900 rounded-xl p-1 border border-gray-800">
                    {FORMATS.map((f) => (
                        <button
                            key={f}
                            onClick={() => setFormat(f)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${format === f
                                    ? "bg-green-600 text-white"
                                    : "text-gray-400 hover:text-white"
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Explanation banner */}
            <div className="card p-4 flex gap-4 text-sm text-gray-400">
                <div className="flex items-start gap-2">
                    <span className="text-red-400 font-bold">0–35</span>
                    <span>Below Par</span>
                </div>
                <div className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold">35–65</span>
                    <span>Neutral</span>
                </div>
                <div className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">65–80</span>
                    <span>High Impact</span>
                </div>
                <div className="flex items-start gap-2">
                    <span className="text-indigo-400 font-bold">80–100</span>
                    <span>Elite Impact</span>
                </div>
            </div>

            {/* Table */}
            <div className="card p-4">
                <Leaderboard format={format} limit={50} />
            </div>
        </div>
    );
}
