"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "../AdminShell";
import { supabase } from "../../../lib/supabase.js";

const PAGE_SIZE = 20;

const FEATURES = [
  ["full_app", "Full App"],
  ["support", "Support"],
  ["freefire", "Free Fire"],
  ["freefiremax", "Free Fire MAX"],
  ["clashsquad", "Clash Squad"],
  ["lonewolf", "Lone Wolf"],
  ["spin", "Spin"],
  ["scratch_card", "Scratch Card"],
  ["withdrawal", "Withdrawal"],
  ["deposit", "Add Money"],
];

const GAMES = [
  ["freefire", "Free Fire"],
  ["freefiremax", "Free Fire MAX"],
  ["clashsquad", "Clash Squad"],
  ["lonewolf", "Lone Wolf"],
];

function displayName(member) {
  return member?.name || member?.full_name || member?.username || member?.email || "Unknown User";
}

function getInitial(member) {
  return displayName(member).charAt(0).toUpperCase();
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function walletBalance(member) {
  const value = member?.wallet_balance ?? member?.balance ?? member?.winning_balance ?? member?.wallet ?? 0;
  const n = Number(value);
  return Number.isFinite(n) ? `₹${n.toFixed(2)}` : "₹0.00";
}

function expiryFrom(mode, custom) {
  if (mode === "permanent") return null;
  if (mode === "custom") return custom ? new Date(custom).toISOString() : null;
  const hours = mode === "24h" ? 24 : mode === "7d" ? 24 * 7 : 24 * 30;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function expiryLabel(row) {
  if (row.is_permanent) return "Permanent";
  if (!row.expires_at) return "No expiry";
  const d = new Date(row.expires_at);
  if (Number.isNaN(d.getTime())) return "Invalid expiry";
  return `Until ${d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`;
}

export default function MembersPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);

  async function loadMembers() {
    try {
      setLoading(true);
      setError("");
      const { data, error: dbError } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });
      if (dbError) throw dbError;
      setMembers(data || []);
    } catch (err) {
      console.error("Members load error:", err);
      setError(err?.message || "Failed to load members.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMembers(); }, []);
  useEffect(() => { setPage(1); }, [search, status]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((member) => {
      const s = String(member.status || "active").toLowerCase();
      const statusMatch = status === "all" || (status === "active" && s === "active") || (status === "blocked" && ["blocked", "banned", "suspended"].includes(s));
      if (!statusMatch) return false;
      if (!q) return true;
      return [member.name, member.full_name, member.username, member.email, member.uid, member.game_uid, member.ign, member.phone]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [members, search, status]);

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const visibleMembers = filteredMembers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeCount = members.filter((m) => String(m.status || "active").toLowerCase() === "active").length;
  const blockedCount = members.filter((m) => ["blocked", "banned", "suspended"].includes(String(m.status || "").toLowerCase())).length;

  async function toggleMember(member) {
    const current = String(member.status || "active").toLowerCase();
    const nextStatus = current === "active" ? "blocked" : "active";
    if (!window.confirm(nextStatus === "blocked" ? `Block ${displayName(member)}?` : `Unblock ${displayName(member)}?`)) return;
    try {
      setActionLoading(member.id);
      const { error: dbError } = await supabase.from("users").update({ status: nextStatus }).eq("id", member.id);
      if (dbError) throw dbError;
      setMembers((prev) => prev.map((m) => m.id === member.id ? { ...m, status: nextStatus } : m));
      setSelectedMember((prev) => prev?.id === member.id ? { ...prev, status: nextStatus } : prev);
    } catch (err) {
      alert(err?.message || "Failed to update member.");
    } finally {
      setActionLoading(null);
    }
  }

  function openMember(member) {
    setSelectedMember(member);
  }

  return (
    <AdminShell title="Members">
      <div className="members-page">
        <div className="stats-grid">
          <StatCard icon="👥" title="Total Members" value={members.length} subtitle="Registered users" />
          <StatCard icon="🟢" title="Active Members" value={activeCount} subtitle="Currently active" />
          <StatCard icon="🔴" title="Blocked" value={blockedCount} subtitle="Blocked accounts" />
        </div>

        <div className="toolbar">
          <div className="search-box"><span>🔎</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, UID, IGN..." /></div>
          <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All Members</option><option value="active">Active</option><option value="blocked">Blocked</option></select>
          <button className="refresh-btn" onClick={loadMembers} disabled={loading}>↻ Refresh</button>
        </div>

        {error && <div className="error-box"><span>⚠️</span><div><b>Unable to load members</b><p>{error}</p></div><button onClick={loadMembers}>Retry</button></div>}

        <div className="members-card">
          <div className="card-head"><div><h2>All Members</h2><p>{filteredMembers.length} member{filteredMembers.length !== 1 ? "s" : ""} found</p></div><div className="page-info">Page {page} of {totalPages}</div></div>
          {loading ? <LoadingTable /> : visibleMembers.length === 0 ? (
            <div className="empty"><div>👥</div><h3>No members found</h3><p>Try changing your search or filter.</p></div>
          ) : (
            <div className="table-wrap"><table><thead><tr><th>MEMBER</th><th>UID / IGN</th><th>EMAIL</th><th>WALLET</th><th>JOINED</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>
              {visibleMembers.map((member) => {
                const memberStatus = String(member.status || "active").toLowerCase();
                const isActive = memberStatus === "active";
                return <tr key={member.id} className="member-row" onClick={() => openMember(member)}>
                  <td><div className="member-cell"><div className="avatar">{getInitial(member)}</div><div><strong>{displayName(member)}</strong><small>{member.id ? String(member.id).slice(0, 12) : "—"}</small></div></div></td>
                  <td><div className="uid-cell"><b>{member.uid || member.game_uid || "—"}</b><span>{member.ign || member.game_name || "IGN not set"}</span></div></td>
                  <td><span className="email">{member.email || "—"}</span></td>
                  <td><b className="wallet">{walletBalance(member)}</b></td>
                  <td><span className="date">{formatDate(member.created_at)}</span></td>
                  <td><span className={`status ${isActive ? "active" : "blocked"}`}><i />{isActive ? "Active" : "Blocked"}</span></td>
                  <td><button className={`action ${isActive ? "danger" : "success"}`} disabled={actionLoading === member.id} onClick={(e) => { e.stopPropagation(); toggleMember(member); }}>{actionLoading === member.id ? "Saving..." : isActive ? "Block" : "Unblock"}</button></td>
                </tr>;
              })}
            </tbody></table></div>
          )}
          <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Previous</button><div>Page <b>{page}</b> / {totalPages}</div><button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button></div>
        </div>
      </div>

      {selectedMember && <MemberDetailModal member={selectedMember} onClose={() => setSelectedMember(null)} onToggleStatus={() => toggleMember(selectedMember)} actionLoading={actionLoading === selectedMember.id} displayName={displayName} getInitial={getInitial} formatDate={formatDate} walletBalance={walletBalance} />}

      <style jsx>{`
        .members-page{padding:18px}.stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}.stat-card{background:#fff;border:1px solid #e8eaf0;border-radius:14px;padding:15px;display:flex;gap:12px;align-items:center;box-shadow:0 3px 12px rgba(15,23,42,.035)}.stat-icon{width:42px;height:42px;border-radius:12px;background:#fff1f4;display:grid;place-items:center;font-size:19px}.stat-title{font-size:11px;color:#858b97}.stat-value{font-size:22px;font-weight:800;color:#171923;margin-top:2px}.stat-sub{font-size:10px;color:#a0a5af;margin-top:1px}.toolbar{background:#fff;border:1px solid #e8eaf0;border-radius:14px;padding:11px;display:flex;gap:10px;margin-bottom:14px}.search-box{height:40px;flex:1;min-width:220px;display:flex;align-items:center;gap:8px;padding:0 12px;border:1px solid #e1e4ea;border-radius:9px;background:#fafbfc}.search-box input{border:0;outline:0;background:transparent;width:100%;font-size:13px}.toolbar select{height:40px;min-width:145px;border:1px solid #e1e4ea;border-radius:9px;padding:0 10px;background:#fff;outline:0}.refresh-btn{height:40px;padding:0 15px;border:0;border-radius:9px;background:#171923;color:#fff;font-weight:700;cursor:pointer}.refresh-btn:disabled{opacity:.55}.error-box{background:#fff5f5;border:1px solid #ffd4d4;color:#991b1b;border-radius:12px;padding:12px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px}.error-box div{flex:1}.error-box p{margin:2px 0 0;font-size:12px}.error-box button{border:0;background:#991b1b;color:white;border-radius:7px;padding:7px 12px}.members-card{background:#fff;border:1px solid #e8eaf0;border-radius:14px;overflow:hidden;box-shadow:0 3px 12px rgba(15,23,42,.035)}.card-head{min-height:64px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eef0f4}.card-head h2{margin:0;font-size:16px}.card-head p{margin:3px 0 0;font-size:11px;color:#9298a5}.page-info{font-size:12px;color:#777d89}.table-wrap{width:100%;overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:950px}th{text-align:left;background:#fafbfc;color:#8a909d;font-size:10px;letter-spacing:.04em;padding:11px 14px;border-bottom:1px solid #eef0f4;white-space:nowrap}td{padding:11px 14px;border-bottom:1px solid #f0f1f4;font-size:12px;vertical-align:middle}.member-row{cursor:pointer}.member-row:hover{background:#fcfcfd}.member-cell{display:flex;align-items:center;gap:9px;min-width:170px}.avatar{width:34px;height:34px;border-radius:10px;background:#fff1f4;color:#ff174f;display:grid;place-items:center;font-weight:800}.member-cell strong{display:block;color:#20232d;font-size:12px;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.member-cell small{display:block;margin-top:2px;color:#a0a5af;font-size:9px}.uid-cell b{display:block;font-size:11px}.uid-cell span{display:block;color:#9298a5;margin-top:2px;font-size:10px}.email{color:#646a76;font-size:11px}.wallet{font-size:12px}.date{color:#737985;white-space:nowrap;font-size:11px}.status{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:700}.status i{width:6px;height:6px;border-radius:50%;display:block}.status.active{color:#15803d;background:#ecfdf3}.status.active i{background:#22c55e}.status.blocked{color:#b91c1c;background:#fef2f2}.status.blocked i{background:#ef4444}.action{border:0;border-radius:7px;padding:6px 10px;font-size:10px;font-weight:700;cursor:pointer}.action.danger{color:#dc2626;background:#fff1f2}.action.success{color:#15803d;background:#ecfdf3}.action:disabled{opacity:.5}.empty{padding:65px 20px;text-align:center}.empty>div{font-size:35px}.empty h3{margin:0;font-size:15px}.empty p{margin:5px 0 0;color:#969ba7;font-size:12px}.pagination{padding:11px 14px;border-top:1px solid #eef0f4;display:flex;align-items:center;justify-content:center;gap:14px}.pagination button{border:1px solid #e1e4ea;background:#fff;border-radius:7px;padding:7px 11px;font-size:11px;cursor:pointer}.pagination button:disabled{opacity:.4}
        @media(max-width:800px){.stats-grid{grid-template-columns:1fr}.toolbar{flex-wrap:wrap}.search-box{min-width:100%}.toolbar select,.refresh-btn{flex:1}}
      `}</style>
    </AdminShell>
  );
}

function MemberDetailModal({ member, onClose, onToggleStatus, actionLoading, displayName, getInitial, formatDate, walletBalance }) {
  const status = String(member.status || "active").toLowerCase();
  const [restrictions, setRestrictions] = useState([]);
  const [gameLimits, setGameLimits] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [feature, setFeature] = useState("full_app");
  const [duration, setDuration] = useState("24h");
  const [customExpiry, setCustomExpiry] = useState("");
  const [reason, setReason] = useState("");
  const [game, setGame] = useState("freefire");
  const [dailyLimit, setDailyLimit] = useState("1");
  const [gameDuration, setGameDuration] = useState("24h");
  const [gameCustomExpiry, setGameCustomExpiry] = useState("");
  const [gameReason, setGameReason] = useState("");

  async function loadRestrictions() {
    if (!member?.id) return;
    const [r, g] = await Promise.all([
      supabase.from("user_restrictions").select("*").eq("user_id", member.id).eq("is_active", true).order("created_at", { ascending: false }),
      supabase.from("user_game_limits").select("*").eq("user_id", member.id).eq("is_active", true).order("created_at", { ascending: false }),
    ]);
    if (r.error) setMessage(r.error.message); else setRestrictions(r.data || []);
    if (g.error) setMessage(g.error.message); else setGameLimits(g.data || []);
  }

  useEffect(() => { loadRestrictions(); }, [member?.id]);

  async function saveRestriction() {
    if (!member?.id) return;
    if (duration === "custom" && !customExpiry) return setMessage("Select a custom expiry date/time.");
    try {
      setBusy(true); setMessage("");
      const { data: auth } = await supabase.auth.getUser();
      const payload = { user_id: member.id, feature, expires_at: expiryFrom(duration, customExpiry), is_permanent: duration === "permanent", is_active: true, reason: reason.trim() || null, created_by: auth?.user?.id || null, updated_at: new Date().toISOString() };
      const { data: existing, error: findError } = await supabase.from("user_restrictions").select("id").eq("user_id", member.id).eq("feature", feature).eq("is_active", true).maybeSingle();
      if (findError) throw findError;
      const result = existing ? await supabase.from("user_restrictions").update(payload).eq("id", existing.id) : await supabase.from("user_restrictions").insert(payload);
      if (result.error) throw result.error;
      setReason(""); await loadRestrictions(); setMessage("Restriction saved successfully.");
    } catch (err) { setMessage(err?.message || "Failed to save restriction."); } finally { setBusy(false); }
  }

  async function removeRestriction(id) {
    if (!window.confirm("Remove this restriction?")) return;
    try { setBusy(true); const { error } = await supabase.from("user_restrictions").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id); if (error) throw error; await loadRestrictions(); } catch (err) { setMessage(err?.message || "Failed to remove restriction."); } finally { setBusy(false); }
  }

  async function saveGameLimit() {
    if (!member?.id) return;
    const limit = Number(dailyLimit);
    if (!Number.isInteger(limit) || limit < 1) return setMessage("Daily limit must be a whole number greater than 0.");
    if (gameDuration === "custom" && !gameCustomExpiry) return setMessage("Select a custom expiry date/time.");
    try {
      setBusy(true); setMessage("");
      const { data: auth } = await supabase.auth.getUser();
      const payload = { user_id: member.id, game, daily_limit: limit, expires_at: expiryFrom(gameDuration, gameCustomExpiry), is_permanent: gameDuration === "permanent", is_active: true, reason: gameReason.trim() || null, created_by: auth?.user?.id || null, updated_at: new Date().toISOString() };
      const { data: existing, error: findError } = await supabase.from("user_game_limits").select("id").eq("user_id", member.id).eq("game", game).eq("is_active", true).maybeSingle();
      if (findError) throw findError;
      const result = existing ? await supabase.from("user_game_limits").update(payload).eq("id", existing.id) : await supabase.from("user_game_limits").insert(payload);
      if (result.error) throw result.error;
      setGameReason(""); await loadRestrictions(); setMessage("Daily game limit saved successfully.");
    } catch (err) { setMessage(err?.message || "Failed to save daily game limit."); } finally { setBusy(false); }
  }

  async function removeGameLimit(id) {
    if (!window.confirm("Remove this daily game limit?")) return;
    try { setBusy(true); const { error } = await supabase.from("user_game_limits").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id); if (error) throw error; await loadRestrictions(); } catch (err) { setMessage(err?.message || "Failed to remove game limit."); } finally { setBusy(false); }
  }

  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="member-modal">
      <div className="modal-head"><div className="profile"><div className="modal-avatar">{getInitial(member)}</div><div><h2>{displayName(member)}</h2><span>{member.email || member.phone || "Member"}</span></div></div><button className="close" onClick={onClose}>×</button></div>
      <div className="member-info"><Info label="User ID" value={member.id} /><Info label="Game UID" value={member.uid || member.game_uid || "Not set"} /><Info label="IGN" value={member.ign || member.game_name || "Not set"} /><Info label="Wallet" value={walletBalance(member)} /><Info label="Joined" value={formatDate(member.created_at)} /><Info label="Referral Code" value={member.referral_code || member.referralCode || "Not set"} /></div>

      <div className="section"><div className="section-title"><div><h3>Restriction Control</h3><p>Block individual app features for this member.</p></div></div>
        <div className="form-grid"><select value={feature} onChange={(e) => setFeature(e.target.value)}>{FEATURES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select><select value={duration} onChange={(e) => setDuration(e.target.value)}><option value="24h">24 Hours</option><option value="7d">7 Days</option><option value="30d">30 Days</option><option value="custom">Custom Expiry</option><option value="permanent">Permanent</option></select>{duration === "custom" && <input type="datetime-local" value={customExpiry} onChange={(e) => setCustomExpiry(e.target.value)} />}<input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} /><button className="primary" disabled={busy} onClick={saveRestriction}>{busy ? "Saving..." : "Apply Restriction"}</button></div>
        {restrictions.length === 0 ? <div className="none">No active feature restrictions.</div> : <div className="list">{restrictions.map((r) => <div className="restriction-row" key={r.id}><div><b>{FEATURES.find(([v]) => v === r.feature)?.[1] || r.feature}</b><small>{expiryLabel(r)}{r.reason ? ` • ${r.reason}` : ""}</small></div><button onClick={() => removeRestriction(r.id)} disabled={busy}>Remove</button></div>)}</div>}
      </div>

      <div className="section"><div className="section-title"><div><h3>Daily Game Join Limit</h3><p>Limit how many tournaments this user can join for a game.</p></div></div>
        <div className="form-grid"><select value={game} onChange={(e) => setGame(e.target.value)}>{GAMES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select><input type="number" min="1" step="1" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} placeholder="Daily joins" /><select value={gameDuration} onChange={(e) => setGameDuration(e.target.value)}><option value="24h">24 Hours</option><option value="7d">7 Days</option><option value="30d">30 Days</option><option value="custom">Custom Expiry</option><option value="permanent">Permanent</option></select>{gameDuration === "custom" && <input type="datetime-local" value={gameCustomExpiry} onChange={(e) => setGameCustomExpiry(e.target.value)} />}<input placeholder="Reason (optional)" value={gameReason} onChange={(e) => setGameReason(e.target.value)} /><button className="primary" disabled={busy} onClick={saveGameLimit}>{busy ? "Saving..." : "Apply Daily Limit"}</button></div>
        {gameLimits.length === 0 ? <div className="none">No active daily game limits.</div> : <div className="list">{gameLimits.map((r) => <div className="restriction-row" key={r.id}><div><b>{GAMES.find(([v]) => v === r.game)?.[1] || r.game} — {r.daily_limit}/day</b><small>{expiryLabel(r)}{r.reason ? ` • ${r.reason}` : ""}</small></div><button onClick={() => removeGameLimit(r.id)} disabled={busy}>Remove</button></div>)}</div>}
      </div>

      {message && <div className="message">{message}</div>}
      <div className="modal-footer"><span className={`status ${status === "active" ? "active" : "blocked"}`}>{status === "active" ? "● Active" : "● Blocked"}</span><button className={status === "active" ? "block-btn" : "unblock-btn"} disabled={actionLoading} onClick={onToggleStatus}>{actionLoading ? "Saving..." : status === "active" ? "Block Member" : "Unblock Member"}</button></div>
    </div>
    <style jsx>{` .modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.48);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px}.member-modal{width:min(920px,100%);max-height:94vh;overflow:auto;background:#fff;border-radius:20px;box-shadow:0 25px 80px rgba(0,0,0,.25)}.modal-head{padding:17px 18px;border-bottom:1px solid #eef0f4;display:flex;justify-content:space-between;align-items:center}.profile{display:flex;gap:11px;align-items:center}.modal-avatar{width:46px;height:46px;border-radius:14px;background:#fff1f4;color:#ff174f;display:grid;place-items:center;font-weight:900;font-size:18px}.profile h2{margin:0;font-size:17px}.profile span{display:block;color:#8a909d;font-size:11px;margin-top:2px}.close{border:0;background:#f4f5f7;width:34px;height:34px;border-radius:10px;font-size:23px;cursor:pointer}.member-info{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;padding:14px 18px}.info{border:1px solid #eef0f4;border-radius:11px;padding:9px}.info label{display:block;color:#9aa0ab;font-size:9px;text-transform:uppercase}.info b{display:block;margin-top:3px;font-size:11px;word-break:break-all}.section{margin:0 18px 14px;border:1px solid #e9ebf0;border-radius:14px;padding:14px}.section-title h3{margin:0;font-size:14px}.section-title p{margin:3px 0 11px;color:#9298a5;font-size:10px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.form-grid input,.form-grid select{height:38px;border:1px solid #dfe2e8;border-radius:9px;padding:0 10px;font-size:11px;outline:0;background:#fff}.form-grid .primary{height:38px;border:0;border-radius:9px;background:#ff174f;color:#fff;font-weight:800;cursor:pointer}.form-grid .primary:disabled{opacity:.55}.list{margin-top:10px;display:grid;gap:7px}.restriction-row{display:flex;justify-content:space-between;align-items:center;gap:10px;background:#fafbfc;border:1px solid #eef0f4;border-radius:10px;padding:9px 10px}.restriction-row b{font-size:11px}.restriction-row small{display:block;color:#8f95a1;font-size:9px;margin-top:2px}.restriction-row button{border:0;border-radius:8px;background:#fff1f2;color:#dc2626;padding:6px 9px;font-size:10px;font-weight:800;cursor:pointer}.restriction-row button:disabled{opacity:.5}.none{margin-top:9px;color:#9aa0ab;background:#fafbfc;border-radius:9px;padding:10px;text-align:center;font-size:10px}.message{margin:0 18px 12px;padding:9px 11px;border-radius:9px;background:#fff7ed;color:#9a3412;font-size:10px}.modal-footer{padding:13px 18px;border-top:1px solid #eef0f4;display:flex;justify-content:space-between;align-items:center}.status{font-size:11px;font-weight:800}.status.active{color:#15803d}.status.blocked{color:#b91c1c}.block-btn,.unblock-btn{border:0;border-radius:9px;padding:9px 13px;font-size:11px;font-weight:800;cursor:pointer}.block-btn{background:#fff1f2;color:#dc2626}.unblock-btn{background:#ecfdf3;color:#15803d}@media(max-width:650px){.member-info{grid-template-columns:1fr 1fr}.form-grid{grid-template-columns:1fr}.modal-backdrop{padding:8px}.member-modal{max-height:98vh}} `}</style>
  </div>;
}

function Info({ label, value }) { return <div className="info"><label>{label}</label><b>{value || "—"}</b></div>; }
function StatCard({ icon, title, value, subtitle }) { return <div className="stat-card"><div className="stat-icon">{icon}</div><div><div className="stat-title">{title}</div><div className="stat-value">{value}</div><div className="stat-sub">{subtitle}</div></div></div>; }
function LoadingTable() { return <div style={{padding:"12px 14px"}}>{Array.from({length:7}).map((_,i)=><div key={i} style={{height:52,borderBottom:"1px solid #f0f1f4",display:"flex",alignItems:"center",gap:12}}><div style={{width:34,height:34,borderRadius:10,background:"#f1f2f5"}}/><div style={{width:`${180+(i%3)*45}px`,height:10,borderRadius:5,background:"#f1f2f5"}}/></div>)}</div>; }
