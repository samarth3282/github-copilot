import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NavBar from "./components/NavBar";
import LeaderboardPage from "./pages/LeaderboardPage";
import PlayerProfile from "./pages/PlayerProfile";
import ComputePage from "./pages/ComputePage";

export default function App() {
    return (
        <BrowserRouter>
            <div style={{ minHeight: "100vh", background: "#070b14", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
                <NavBar />
                <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
                    <Routes>
                        <Route path="/" element={<Navigate to="/leaderboard" replace />} />
                        <Route path="/leaderboard" element={<LeaderboardPage />} />
                        <Route path="/player/:id" element={<PlayerProfile />} />
                        <Route path="/compute" element={<ComputePage />} />
                    </Routes>
                </main>
                <footer style={{ textAlign: "center", color: "#475569", fontSize: 12, padding: "16px 0", borderTop: "1px solid rgba(255,255,255,0.04)", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2 }}>
                    CRICKET IMPACT METRIC — CRICHEROES HACKATHON 2025
                </footer>
            </div>
        </BrowserRouter>
    );
}
