import axios from "axios";

// During dev the Vite proxy rewrites /api → http://localhost:8000
// In production set VITE_API_BASE to the real API URL.
const BASE = import.meta.env.VITE_API_BASE || "/api";

const client = axios.create({ baseURL: BASE, timeout: 15000 });

export const api = {
    // Leaderboard
    getLeaderboard: (format = "T20", limit = 20, minInnings = 3) =>
        client.get("/leaderboard", { params: { format, limit, min_innings: minInnings } }).then((r) => r.data),

    // Player
    getPlayer: (id) => client.get(`/players/${id}`).then((r) => r.data),
    listPlayers: () => client.get("/players").then((r) => r.data),
    createPlayer: (body) => client.post("/players", body).then((r) => r.data),

    // Impact score
    getImpact: (id, format) =>
        client.get(`/player/${id}/impact`, { params: format ? { format } : {} }).then((r) => r.data),

    getHistory: (id, n = 10, format) =>
        client.get(`/player/${id}/history`, { params: { n, ...(format ? { format } : {}) } }).then((r) => r.data),

    getBreakdown: (id, format) =>
        client.get(`/player/${id}/breakdown`, { params: format ? { format } : {} }).then((r) => r.data),

    // Compute
    compute: (body) => client.post("/compute", body).then((r) => r.data),
};

export default api;
