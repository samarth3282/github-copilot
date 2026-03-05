import { Link, NavLink } from "react-router-dom";

const navLinkStyle = (isActive) => ({
    background: isActive ? "rgba(99,102,241,0.5)" : "transparent",
    border: isActive ? "1px solid rgba(99,102,241,0.5)" : "1px solid transparent",
    borderRadius: 7,
    padding: "7px 16px",
    color: isActive ? "#e2e8f0" : "#64748b",
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "'Barlow Condensed', sans-serif",
    letterSpacing: 1,
    cursor: "pointer",
    transition: "all 0.15s",
    textTransform: "uppercase",
    textDecoration: "none",
});

export default function NavBar() {
    return (
        <div style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "16px 24px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(10px)" }}>
            <Link to="/leaderboard" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg, #6366f1, #a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏏</div>
                <div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "#e2e8f0", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 2, lineHeight: 1 }}>CRICKET IMPACT METRIC</div>
                    <div style={{ fontSize: 11, color: "#475569", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 3 }}>PERFORMANCE × CONTEXT × SITUATION</div>
                </div>
            </Link>
            <nav style={{ marginLeft: "auto", display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 4 }}>
                <NavLink to="/leaderboard" style={({ isActive }) => navLinkStyle(isActive)}>Leaderboard</NavLink>
                <NavLink to="/compute" style={({ isActive }) => navLinkStyle(isActive)}>Compute IM</NavLink>
            </nav>
        </div>
    );
}
