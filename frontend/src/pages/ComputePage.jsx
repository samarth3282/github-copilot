import { useState, useEffect } from "react";
import ImpactMeter from "../components/ImpactMeter";
import api from "../api";

const FORMATS = ["T20", "ODI", "Test", "T10"];
const TIERS = ["club", "district", "national", "international"];
const PHASES = ["powerplay", "middle", "death"];
const ROLES = ["batsman", "bowler", "allrounder", "wk-batsman"];

const defaultForm = {
    /* match */
    match_id: "",
    player_id: "",
    player_name: "",
    team_id: "",
    match_date: new Date().toISOString().slice(0, 10),
    format: "T20",
    innings_number: 1,
    match_importance: 1.0,
    tournament_tier: "national",
    opposition_elo: 1000,
    player_role: "batsman",
    /* batting */
    bat_enabled: false,
    runs_scored: 0,
    balls_faced: 0,
    fours: 0,
    sixes: 0,
    dots_faced: 0,
    batting_position: 3,
    wickets_fallen_entry: 0,
    rrr_at_entry: 8.0,
    crr_at_entry: 7.0,
    overs_left_at_entry: 10.0,
    wickets_in_hand_exit: 5,
    match_phase: "middle",
    /* bowling */
    bowl_enabled: false,
    overs_bowled: 0,
    runs_conceded: 0,
    wickets_taken: 0,
    maidens: 0,
    dot_balls_bowled: 0,
    match_phase_bowled: "middle",
    /* fielding */
    catches: 0,
    run_outs: 0,
    stumpings: 0,
};

function Label({ children }) {
    return <label className="block text-xs text-gray-400 mb-1">{children}</label>;
}
function Input({ label, type = "number", name, value, onChange, step }) {
    return (
        <div>
            <Label>{label}</Label>
            <input
                type={type}
                name={name}
                value={value}
                step={step}
                onChange={onChange}
                className="input w-full"
            />
        </div>
    );
}
function Select({ label, name, value, onChange, options }) {
    return (
        <div>
            <Label>{label}</Label>
            <select name={name} value={value} onChange={onChange} className="input w-full">
                {options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                ))}
            </select>
        </div>
    );
}

export default function ComputePage() {
    const [form, setForm] = useState(defaultForm);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [players, setPlayers] = useState([]);

    useEffect(() => {
        api.listPlayers().then(setPlayers).catch(() => { });
    }, []);

    function handle(e) {
        const { name, value, type, checked } = e.target;
        setForm((f) => ({
            ...f,
            [name]: type === "checkbox" ? checked : value,
        }));
    }

    async function submit(e) {
        e.preventDefault();
        setError(null);
        setResult(null);
        setLoading(true);

        const payload = {
            match_id: form.match_id,
            player_id: form.player_id,
            player_name: form.player_name,
            team_id: form.team_id,
            match_date: form.match_date,
            format: form.format,
            innings_number: Number(form.innings_number),
            match_importance: Number(form.match_importance),
            tournament_tier: form.tournament_tier,
            opposition_elo: Number(form.opposition_elo),
            player_role: form.player_role,
        };

        if (form.bat_enabled) {
            payload.batting = {
                runs_scored: Number(form.runs_scored),
                balls_faced: Number(form.balls_faced),
                fours: Number(form.fours),
                sixes: Number(form.sixes),
                dots_faced: Number(form.dots_faced),
                batting_position: Number(form.batting_position),
                wickets_fallen_entry: Number(form.wickets_fallen_entry),
                rrr_at_entry: Number(form.rrr_at_entry),
                crr_at_entry: Number(form.crr_at_entry),
                overs_left_at_entry: Number(form.overs_left_at_entry),
                wickets_in_hand_exit: Number(form.wickets_in_hand_exit),
                match_phase: form.match_phase,
            };
        }
        if (form.bowl_enabled) {
            payload.bowling = {
                overs_bowled: Number(form.overs_bowled),
                runs_conceded: Number(form.runs_conceded),
                wickets_taken: Number(form.wickets_taken),
                maidens: Number(form.maidens),
                dot_balls_bowled: Number(form.dot_balls_bowled),
                match_phase_bowled: form.match_phase_bowled,
            };
        }
        payload.fielding = {
            catches: Number(form.catches),
            run_outs: Number(form.run_outs),
            stumpings: Number(form.stumpings),
        };

        try {
            const res = await api.compute(payload);
            setResult(res);
        } catch (err) {
            setError(err.response?.data?.detail || err.message || "Computation failed.");
        } finally {
            setLoading(false);
        }
    }

    const imScore = result?.im_score;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-black text-white">Compute Impact Metric</h1>
                <p className="text-gray-500 text-sm mt-1">
                    Submit a match contribution to compute or refresh a player's IM score.
                </p>
            </div>

            <form onSubmit={submit} className="space-y-6">
                {/* Match + Player */}
                <div className="card p-6 space-y-4">
                    <h2 className="font-bold text-white">Match &amp; Player</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <Input label="Match ID *" type="text" name="match_id" value={form.match_id} onChange={handle} />
                        <Input label="Player ID *" type="text" name="player_id" value={form.player_id} onChange={handle} />
                        <Input label="Player Name" type="text" name="player_name" value={form.player_name} onChange={handle} />
                        <Input label="Team ID" type="text" name="team_id" value={form.team_id} onChange={handle} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <Input label="Match Date" type="date" name="match_date" value={form.match_date} onChange={handle} />
                        <Select label="Format" name="format" value={form.format} onChange={handle} options={FORMATS} />
                        <Select label="Player Role" name="player_role" value={form.player_role} onChange={handle} options={ROLES} />
                        <div>
                            <Label>Innings Number</Label>
                            <input type="number" name="innings_number" value={form.innings_number} min={1} max={4}
                                onChange={handle} className="input w-full" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <Input label="Match Importance (0.5–2.0)" type="number" step="0.1"
                            name="match_importance" value={form.match_importance} onChange={handle} />
                        <Select label="Tournament Tier" name="tournament_tier" value={form.tournament_tier}
                            onChange={handle} options={TIERS} />
                        <Input label="Opposition Elo" type="number" name="opposition_elo"
                            value={form.opposition_elo} onChange={handle} />
                    </div>
                </div>

                {/* Batting */}
                <div className="card p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <input id="bat-toggle" type="checkbox" name="bat_enabled"
                            checked={form.bat_enabled} onChange={handle} className="w-4 h-4 accent-green-500" />
                        <label htmlFor="bat-toggle" className="font-bold text-white cursor-pointer">Batting</label>
                    </div>
                    {form.bat_enabled && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <Input label="Runs Scored" name="runs_scored" value={form.runs_scored} onChange={handle} />
                            <Input label="Balls Faced" name="balls_faced" value={form.balls_faced} onChange={handle} />
                            <Input label="Fours" name="fours" value={form.fours} onChange={handle} />
                            <Input label="Sixes" name="sixes" value={form.sixes} onChange={handle} />
                            <Input label="Dot Balls (faced)" name="dots_faced" value={form.dots_faced} onChange={handle} />
                            <Input label="Batting Position" name="batting_position" value={form.batting_position} onChange={handle} />
                            <Input label="Wickets at Entry" name="wickets_fallen_entry" value={form.wickets_fallen_entry} onChange={handle} />
                            <Input label="Wickets in Hand (exit)" name="wickets_in_hand_exit" value={form.wickets_in_hand_exit} onChange={handle} />
                            <Input label="RRR at Entry" step="0.1" name="rrr_at_entry" value={form.rrr_at_entry} onChange={handle} />
                            <Input label="CRR at Entry" step="0.1" name="crr_at_entry" value={form.crr_at_entry} onChange={handle} />
                            <Input label="Overs Left" step="0.1" name="overs_left_at_entry" value={form.overs_left_at_entry} onChange={handle} />
                            <Select label="Match Phase" name="match_phase" value={form.match_phase} onChange={handle} options={PHASES} />
                        </div>
                    )}
                </div>

                {/* Bowling */}
                <div className="card p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <input id="bowl-toggle" type="checkbox" name="bowl_enabled"
                            checked={form.bowl_enabled} onChange={handle} className="w-4 h-4 accent-green-500" />
                        <label htmlFor="bowl-toggle" className="font-bold text-white cursor-pointer">Bowling</label>
                    </div>
                    {form.bowl_enabled && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <Input label="Overs Bowled" step="0.1" name="overs_bowled" value={form.overs_bowled} onChange={handle} />
                            <Input label="Runs Conceded" name="runs_conceded" value={form.runs_conceded} onChange={handle} />
                            <Input label="Wickets Taken" name="wickets_taken" value={form.wickets_taken} onChange={handle} />
                            <Input label="Maidens" name="maidens" value={form.maidens} onChange={handle} />
                            <Input label="Dot Balls (bowled)" name="dot_balls_bowled" value={form.dot_balls_bowled} onChange={handle} />
                            <Select label="Phase Bowled" name="match_phase_bowled" value={form.match_phase_bowled} onChange={handle} options={PHASES} />
                        </div>
                    )}
                </div>

                {/* Fielding */}
                <div className="card p-6 space-y-4">
                    <h2 className="font-bold text-white">Fielding</h2>
                    <div className="grid grid-cols-3 gap-4">
                        <Input label="Catches" name="catches" value={form.catches} onChange={handle} />
                        <Input label="Run-Outs" name="run_outs" value={form.run_outs} onChange={handle} />
                        <Input label="Stumpings" name="stumpings" value={form.stumpings} onChange={handle} />
                    </div>
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
                    {loading ? "Computing…" : "Compute Impact Metric"}
                </button>
            </form>

            {/* Error */}
            {error && (
                <div className="card p-4 border border-red-700 text-red-400">{error}</div>
            )}

            {/* Result */}
            {result && (
                <div className="card p-6 space-y-6">
                    <h2 className="text-xl font-black text-white text-center">Result</h2>

                    {/* Meter */}
                    <div className="flex justify-center">
                        <ImpactMeter score={imScore} inningsCount={result.innings_in_window} />
                    </div>

                    {/* Breakdown grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                        {[
                            { label: "IM Score", value: imScore?.toFixed(2) },
                            { label: "Percentile", value: `${result.im_percentile?.toFixed(1)}th` },
                            { label: "Rolling Raw", value: result.rolling_raw_impact?.toFixed(4) },
                            { label: "Innings", value: result.innings_in_window },
                            { label: "Perf Score", value: result.breakdown?.performance_score?.toFixed(4) },
                            { label: "Context ×", value: result.breakdown?.context_multiplier?.toFixed(4) },
                            { label: "Situation ×", value: result.breakdown?.situation_multiplier?.toFixed(4) },
                            { label: "Raw Impact", value: result.breakdown?.raw_impact?.toFixed(4) },
                        ].map(({ label, value }) => (
                            <div key={label} className="bg-gray-800 rounded-xl p-3">
                                <div className="text-xl font-black text-white">{value}</div>
                                <div className="text-xs text-gray-500 mt-1">{label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Rolling window */}
                    {result.last_10_scores?.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold text-gray-400 mb-2">Last {result.last_10_scores.length} Raw Impacts (newest first)</h3>
                            <div className="flex gap-2 flex-wrap">
                                {result.last_10_scores.map((s, i) => (
                                    <span key={i}
                                        className={`px-2 py-1 rounded text-xs font-mono ${i === 0 ? "bg-green-700 text-white" : "bg-gray-800 text-gray-300"
                                            }`}
                                    >
                                        {s.toFixed(3)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
