"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

const GAMES = ["All Games", "Free Fire", "Free Fire MAX", "Clash Squad", "Lone Wolf"];
const STATUS = ["All Status", "upcoming", "live", "completed", "disabled"];

function money(v) {
  return `₹${Number(v || 0).toLocaleString("en-IN")}`;
}

function dateTime(v) {
  if (!v) return "Not scheduled";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "live") return "live";
  if (s === "completed") return "completed";
  if (s === "disabled") return "disabled";
  return "upcoming";
}

export default function TournamentManagementPage() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [game, setGame] = useState("All Games");
  const [status, setStatus] = useState("All Status");
  const [selected, setSelected] = useState(null);

  async function load() {
    try {
      setError("");
      setRefreshing(true);
      const { data, error: dbError } = await supabase
        .from("tournaments")
        .select("*")
        .order("start_time", { ascending: false });
      if (dbError) throw dbError;
      setTournaments(data || []);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to load tournaments.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tournaments.filter((t) => {
      const text = `${t.title || ""} ${t.game || ""} ${t.mode || ""} ${t.map || ""}`.toLowerCase();
      return (!q || text.includes(q)) &&
        (game === "All Games" || t.game === game) &&
        (status === "All Status" || String(t.status || "").toLowerCase() === status);
    });
  }, [tournaments, query, game, status]);

  const stats = useMemo(() => ({
    total: tournaments.length,
    upcoming: tournaments.filter((t) => t.status === "upcoming").length,
    live: tournaments.filter((t) => t.status === "live").length,
    completed: tournaments.filter((t) => t.status === "completed").length,
  }), [tournaments]);

  async function toggleStatus(t) {
    const next = t.status === "disabled" ? "upcoming" : "disabled";
    try {
      const { error: dbError } = await supabase.from("tournaments").update({
        status: next, updated_at: new Date().toISOString()
      }).eq("id", t.id);
      if (dbError) throw dbError;
      setTournaments((old) => old.map((x) => x.id === t.id ? { ...x, status: next } : x));
      setSelected(null);
    } catch (e) {
      setError(e?.message || "Failed to update tournament.");
    }
  }

  async function deleteTournament(t) {
    if (!window.confirm(`Delete "${t.title}"? This action cannot be undone.`)) return;
    try {
      const { error: dbError } = await supabase.from("tournaments").delete().eq("id", t.id);
      if (dbError) throw dbError;
      setTournaments((old) => old.filter((x) => x.id !== t.id));
      setSelected(null);
    } catch (e) {
      setError(e?.message || "Failed to delete tournament.");
    }
  }

  return (
    <main className="page">
      <style jsx>{`
        *{box-sizing:border-box}
        .page{min-height:100vh;background:#f6f8fb;color:#111827;padding:18px}
        .container{max-width:1380px;margin:auto}
        .header{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:22px;background:#fff;border:1px solid #e7eaf0;border-radius:18px;box-shadow:0 6px 24px rgba(15,23,42,.04)}
        .eyebrow{color:#ff174f;font-size:10px;font-weight:950;letter-spacing:.12em}
        h1{margin:5px 0 4px;font-size:25px;line-height:1.15;font-weight:950}
        .brandBlock p{margin:0;color:#6b7280;font-size:12px;font-weight:600}
        .headerActions{display:flex;gap:9px;flex-wrap:wrap}
        .btn,.miniCreate,.action,.modalBtn{font-weight:900;text-decoration:none;cursor:pointer}
        .btn{min-height:40px;display:inline-flex;align-items:center;justify-content:center;padding:0 15px;border-radius:10px;font-size:11px}
        .primary{background:#ff174f;color:#fff}
        .secondary{background:#fff;color:#374151;border:1px solid #dfe3e8}
        .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0}
        .statCard{background:#fff;border:1px solid #e7eaf0;border-radius:14px;padding:16px}
        .statCard span{display:block;color:#6b7280;font-size:10px;font-weight:800;text-transform:uppercase}
        .statCard strong{display:block;margin-top:6px;font-size:25px;font-weight:950}
        .toolbar{display:flex;gap:8px;padding:10px;background:#fff;border:1px solid #e7eaf0;border-radius:14px;margin-bottom:14px}
        .search,select,.refresh{height:38px;border:1px solid #dfe3e8;border-radius:9px;background:#fff;color:#111827;padding:0 11px;font-size:11px;font-weight:700;outline:none}
        .search{flex:1;min-width:180px}.search:focus,select:focus{border-color:#ff174f}
        select{min-width:145px}.refresh{cursor:pointer;font-weight:900}
        .listCard{background:#fff;border:1px solid #e7eaf0;border-radius:16px;overflow:hidden}
        .listHead{padding:17px 18px;border-bottom:1px solid #edf0f3;display:flex;justify-content:space-between;align-items:center}
        .listHead h2{margin:0;font-size:15px;font-weight:950}.listHead span{display:block;margin-top:3px;color:#6b7280;font-size:10px;font-weight:700}
        .miniCreate{color:#ff174f;background:#fff1f4;padding:8px 11px;border-radius:8px;font-size:10px}
        .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:14px}
        .card{border:1px solid #e7eaf0;border-radius:14px;padding:15px;background:#fff}
        .card:hover{border-color:rgba(255,23,79,.3);box-shadow:0 8px 25px rgba(15,23,42,.06)}
        .cardTop{display:flex;justify-content:space-between;gap:10px}.game{color:#ff174f;font-size:9px;font-weight:950;text-transform:uppercase}
        .card h3{margin:4px 0 0;font-size:14px;font-weight:950}
        .status{height:fit-content;padding:5px 8px;border-radius:999px;font-size:8px;font-weight:950;text-transform:uppercase}
        .status.upcoming{background:#fff7ed;color:#c2410c}.status.live{background:#ecfdf5;color:#047857}.status.completed{background:#eff6ff;color:#1d4ed8}.status.disabled{background:#f3f4f6;color:#6b7280}
        .meta{display:grid;gap:6px;margin:13px 0;color:#6b7280;font-size:10px;font-weight:700}
        .numbers{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;padding-top:11px;border-top:1px solid #edf0f3}
        .numbers div{background:#f8fafc;border-radius:8px;padding:8px}.numbers small{display:block;color:#6b7280;font-size:8px;font-weight:800}.numbers b{display:block;margin-top:3px;font-size:10px}
        .cardActions{display:flex;gap:7px;margin-top:12px}.action{height:34px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;font-size:9px;padding:0 9px}
        .action.edit{flex:1;color:#fff;background:#ff174f}.action.results{flex:1;color:#047857;background:#ecfdf5}.action.more{width:36px;color:#374151;background:#f3f4f6;border:0}
        .empty{min-height:260px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;color:#6b7280;font-size:11px}.empty strong{color:#111827;font-size:13px}.emptyIcon{font-size:30px}
        .alert{margin:12px 0;padding:11px 13px;border-radius:10px;background:#fff1f2;border:1px solid #fecdd3;color:#be123c;font-size:11px;font-weight:800}
        .overlay{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.58);backdrop-filter:blur(7px)}
        .modal{width:min(540px,100%);background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 30px 90px rgba(15,23,42,.22)}
        .modalHead{padding:18px;display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #edf0f3}
        .modalEyebrow{color:#ff174f;font-size:10px;font-weight:950;letter-spacing:.12em}.modal h2{margin:4px 0 3px;font-size:18px;font-weight:950}.modalHead p{margin:0;color:#6b7280;font-size:10px;font-weight:700}
        .close{width:32px;height:32px;border:0;border-radius:8px;background:#f3f4f6;cursor:pointer}
        .modalGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:16px}.modalGrid div{border:1px solid #e7eaf0;border-radius:9px;padding:10px}.modalGrid span{display:block;color:#6b7280;font-size:8px;font-weight:900;text-transform:uppercase}.modalGrid b{display:block;margin-top:4px;font-size:10px}
        .modalActions{display:grid;gap:8px;padding:0 16px 16px}.modalBtn{min-height:38px;display:flex;align-items:center;justify-content:center;border:0;border-radius:9px;background:#f3f4f6;color:#374151;font-size:10px}.modalBtn.primary{background:#ff174f;color:#fff}.modalBtn.danger{background:#fff1f2;color:#be123c}
        @media(max-width:1000px){.grid{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:700px){.page{padding:9px}.header{flex-direction:column;align-items:stretch;padding:16px}.headerActions{justify-content:stretch}.headerActions .btn{flex:1}.stats{grid-template-columns:repeat(2,1fr)}.toolbar{flex-wrap:wrap}.search{min-width:100%}select,.refresh{flex:1}.grid{grid-template-columns:1fr;padding:10px}}
      `}</style>

      <div className="container">
        <header className="header">
          <div className="brandBlock">
            <div className="eyebrow">GAMERZADDA ADMIN</div>
            <h1>🏆 Tournament Management</h1>
            <p>Create, manage, control and publish your tournaments.</p>
          </div>
          <div className="headerActions">
            <Link href="/admin/tournaments/past-matches" className="btn secondary">🕘 Past Matches</Link>
            <Link href="/admin/tournaments/create" className="btn primary">＋ Create Tournament</Link>
          </div>
        </header>

        {error && <div className="alert">⚠️ {error}</div>}

        <section className="stats">
          <div className="statCard"><span>Total Tournaments</span><strong>{stats.total}</strong></div>
          <div className="statCard"><span>Upcoming</span><strong>{stats.upcoming}</strong></div>
          <div className="statCard"><span>Live</span><strong>{stats.live}</strong></div>
          <div className="statCard"><span>Completed</span><strong>{stats.completed}</strong></div>
        </section>

        <section className="toolbar">
          <input className="search" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="🔎 Search tournament..." />
          <select value={game} onChange={(e)=>setGame(e.target.value)}>{GAMES.map(x=><option key={x}>{x}</option>)}</select>
          <select value={status} onChange={(e)=>setStatus(e.target.value)}>{STATUS.map(x=><option key={x}>{x}</option>)}</select>
          <button className="refresh" onClick={load} disabled={refreshing}>{refreshing ? "Refreshing..." : "↻ Refresh"}</button>
        </section>

        <section className="listCard">
          <div className="listHead">
            <div><h2>All Tournaments</h2><span>{filtered.length} tournaments found</span></div>
            <Link href="/admin/tournaments/create" className="miniCreate">＋ New</Link>
          </div>

          {loading ? <div className="empty">Loading tournaments...</div> :
          filtered.length === 0 ? <div className="empty"><div className="emptyIcon">🏆</div><strong>No tournaments found</strong><span>Try changing the filters or create a new tournament.</span></div> :
          <div className="grid">{filtered.map(t => (
            <article className="card" key={t.id}>
              <div className="cardTop">
                <div><div className="game">{t.game || "Game"}</div><h3>{t.title || "Untitled Tournament"}</h3></div>
                <span className={`status ${statusClass(t.status)}`}>{t.status || "upcoming"}</span>
              </div>
              <div className="meta">
                <span>🎮 {t.mode || "Solo"}</span><span>🗺️ {t.map || "Map not set"}</span><span>🕒 {dateTime(t.start_time)}</span>
              </div>
              <div className="numbers">
                <div><small>Entry</small><b>{money(t.entry_fee)}</b></div>
                <div><small>Prize Pool</small><b>{money(t.prize_pool)}</b></div>
                <div><small>Max Players</small><b>{t.max_players || "—"}</b></div>
              </div>
              <div className="cardActions">
                <Link href={`/admin/tournaments/${t.id}`} className="action edit">⚙ Manage</Link>
                <Link href={`/admin/tournaments/${t.id}/results`} className="action results">🏆 Results</Link>
                <button className="action more" onClick={()=>setSelected(t)}>⋯</button>
              </div>
            </article>
          ))}</div>}
        </section>
      </div>

      {selected && <div className="overlay" onMouseDown={()=>setSelected(null)}>
        <div className="modal" onMouseDown={e=>e.stopPropagation()}>
          <div className="modalHead">
            <div><div className="modalEyebrow">TOURNAMENT CONTROL</div><h2>{selected.title}</h2><p>{selected.game} · {selected.mode}</p></div>
            <button className="close" onClick={()=>setSelected(null)}>✕</button>
          </div>
          <div className="modalGrid">
            <div><span>Status</span><b>{selected.status || "upcoming"}</b></div>
            <div><span>Entry Fee</span><b>{money(selected.entry_fee)}</b></div>
            <div><span>Prize Pool</span><b>{money(selected.prize_pool)}</b></div>
            <div><span>Kill Reward</span><b>{money(selected.kill_reward)}</b></div>
            <div><span>Max Players</span><b>{selected.max_players || "—"}</b></div>
            <div><span>Starts</span><b>{dateTime(selected.start_time)}</b></div>
          </div>
          <div className="modalActions">
            <Link href={`/admin/tournaments/${selected.id}`} className="modalBtn primary">Open Management</Link>
            <Link href={`/admin/tournaments/${selected.id}/results`} className="modalBtn">Open Results</Link>
            <button className="modalBtn" onClick={()=>toggleStatus(selected)}>{selected.status === "disabled" ? "Enable Tournament" : "Disable Tournament"}</button>
            <button className="modalBtn danger" onClick={()=>deleteTournament(selected)}>Delete Tournament</button>
          </div>
        </div>
      </div>}
    </main>
  );
}
