import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NavBar from "./components/NavBar";
import LeaderboardPage from "./pages/LeaderboardPage";
import PlayerProfile from "./pages/PlayerProfile";
import ComputePage from "./pages/ComputePage";

export default function App() {
    return (
        <BrowserRouter>
            <div className="min-h-screen flex flex-col">
                <NavBar />
                <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
                    <Routes>
                        <Route path="/" element={<Navigate to="/leaderboard" replace />} />
                        <Route path="/leaderboard" element={<LeaderboardPage />} />
                        <Route path="/player/:id" element={<PlayerProfile />} />
                        <Route path="/compute" element={<ComputePage />} />
                    </Routes>
                </main>
                <footer className="text-center text-gray-600 text-xs py-4 border-t border-gray-800">
                    Cricket Impact Metric — CricHeroes Hackathon 2025
                </footer>
            </div>
        </BrowserRouter>
    );
}
