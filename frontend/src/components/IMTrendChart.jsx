import {
    Chart as ChartJS,
    CategoryScale, LinearScale,
    PointElement, LineElement,
    Filler, Tooltip, Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
    CategoryScale, LinearScale,
    PointElement, LineElement,
    Filler, Tooltip, Legend
);

export default function IMTrendChart({ history = [] }) {
    // history: [{computed_at, im_score, raw_impact, format}, ...] — newest first
    const reversed = [...history].reverse();

    const labels = reversed.map((h) => {
        const d = new Date(h.computed_at);
        return `${d.getDate()}/${d.getMonth() + 1}`;
    });
    const scores = reversed.map((h) => h.im_score ?? null);
    const impacts = reversed.map((h) => h.raw_impact ?? null);

    const data = {
        labels,
        datasets: [
            {
                label: "IM Score",
                data: scores,
                borderColor: "#6366F1",
                backgroundColor: "rgba(99,102,241,0.15)",
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: "#6366F1",
            },
            {
                label: "Baseline (50)",
                data: labels.map(() => 50),
                borderColor: "#4B5563",
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false,
            },
        ],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                min: 0,
                max: 100,
                grid: { color: "#1F2937" },
                ticks: { color: "#9CA3AF" },
                title: { display: true, text: "IM Score", color: "#9CA3AF" },
            },
            x: {
                grid: { color: "#1F2937" },
                ticks: { color: "#9CA3AF" },
            },
        },
        plugins: {
            legend: { labels: { color: "#D1D5DB" } },
            tooltip: {
                backgroundColor: "#111827",
                titleColor: "#F9FAFB",
                bodyColor: "#D1D5DB",
                callbacks: {
                    afterBody: (items) => {
                        const idx = items[0].dataIndex;
                        const ri = impacts[idx];
                        return ri != null ? [`Raw Impact: ${ri.toFixed(3)}`] : [];
                    },
                },
            },
        },
    };

    return (
        <div style={{ height: 240 }}>
            <Line data={data} options={options} />
        </div>
    );
}
