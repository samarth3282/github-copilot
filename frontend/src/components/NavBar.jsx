import { Link, NavLink } from "react-router-dom";

export default function NavBar() {
    const linkClass = ({ isActive }) =>
        `px-4 py-2 rounded-xl text-sm font-medium transition-colors ${isActive
            ? "bg-green-600 text-white"
            : "text-gray-400 hover:text-white hover:bg-gray-800"
        }`;

    return (
        <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-50">
            <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                <Link to="/leaderboard" className="flex items-center gap-2 font-bold text-xl">
                    <span className="text-2xl">🏏</span>
                    <span className="text-green-400">Impact</span>
                    <span className="text-white">Metric</span>
                </Link>
                <div className="flex items-center gap-1">
                    <NavLink to="/leaderboard" className={linkClass}>Leaderboard</NavLink>
                    <NavLink to="/compute" className={linkClass}>Compute IM</NavLink>
                </div>
            </div>
        </nav>
    );
}
