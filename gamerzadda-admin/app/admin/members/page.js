"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "../AdminShell";

const PAGE_SIZE = 15;

const FEATURES = [
  { key: "full_app", label: "Full App", icon: "🚫", desc: "Block access to the entire app" },
  { key: "freefire", label: "Free Fire", icon: "🔥", desc: "Restrict Free Fire tournaments" },
  { key: "freefiremax", label: "Free Fire MAX", icon: "🎮", desc: "Restrict Free Fire MAX" },
  { key: "clashsquad", label: "Clash Squad", icon: "⚔️", desc: "Restrict Clash Squad" },
  { key: "lonewolf", label: "Lone Wolf", icon: "🐺", desc: "Restrict Lone Wolf" },
  { key: "spin", label: "Spin", icon: "🎡", desc: "Restrict Lucky Spin" },
  { key: "scratch_card", label: "Scratch Card", icon: "🎟️", desc: "Restrict Scratch Card" },
  { key: "withdrawal", label: "Withdrawal", icon: "💸", desc: "Restrict withdrawals" },
  { key: "deposit", label: "Add Money", icon: "💰", desc: "Restrict deposits" },
  { key: "support", label: "Support", icon: "🎧", desc: "Restrict support access" },
];

export default function MembersPage() {
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [walletModal, setWalletModal] = useState(null);
  const [walletType, setWalletType] = useState("bonus");
  const [walletAction, setWalletAction] = useState("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [restrictionModal, setRestrictionModal] = useState(null);
  const [restrictionFeature, setRestrictionFeature] = useState("full_app");
  const [restrictionMode, setRestrictionMode] = useState("temporary");
  const [restrictionDays, setRestrictionDays] = useState("7");
  const [restrictionReason, setRestrictionReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function authHeaders() {
    try {
      const { supabase } = await import("../../../lib/supabase.js");
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token
        ? { Authorization: `Bearer ${data.session.access_token}` }
        : {};
    } catch {
      return {};
    }
  }

  async function api(url, options = {}) {
    return fetch(url, {
      cache: "no-store",
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(await authHeaders()),
      },
    });
  }

  async function loadMembers() {
    try {
      setLoading(true);
      setError("");
      const res = await api("/api/admin/members");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Unable to load members.");
      setMembers(json.members || []);
    } catch (e) {
      setError(e.message || "Unable to load members.");
    } finally {
      setLoading(false);
    }
  }

  async function openMember(member) {
    setSelected(member);
    setDetailLoading(true);
    try {
      const res = await api(`/api/admin/members?userId=${encodeURIComponent(member.id)}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Unable to load member.");
      setDetail({ member: { ...member, ...(json.member || {}) }, ...json });
    } catch (e) {
      alert(e.message || "Unable to load member.");
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => { loadMembers(); }, []);
  useEffect(() => { setPage(1); }, [search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      [
        m.id, m.full_name, m.name, m.username, m.email, m.phone,
        m.game_name, m.ign, m.uid, m.game_uid, m.free_fire_uid,
        m.referral_code, m.referred_by, m.last_ip, m.ip_address,
      ].filter(Boolean).some(v => String(v).toLowerCase().includes(q))
    );
  }, [members, search]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const restrictedCount = members.filter(m => Number(m.active_restrictions_count || 0) > 0).length;
  const activeCount = members.length - restrictedCount;

  const m = detail?.member || selected;
  const wallet = detail?.wallet || {};
  const referrals = detail?.referral?.users || [];
  const txns = detail?.history || [];
  const restrictions = detail?.restrictions || [];
  const isFullRestricted = restrictions.some(r => r.feature === "full_app" && r.is_active);

  function displayName(x) {
    return x?.full_name || x?.name || x?.username || x?.email || "Unknown User";
  }

  function money(v) {
    return `₹${Number(v || 0).toFixed(2)}`;
  }

  function date(v) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime())
      ? "—"
      : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function copy(v) {
    if (!v) return;
    navigator.clipboard?.writeText(String(v)).then(() => {}).catch(() => {});
  }

  async function walletSubmit() {
    if (!walletModal || !amount || Number(amount) <= 0) return alert("Enter a valid amount.");
    try {
      setBusy(true);
      const res = await api("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: walletModal.id,
          walletType,
          action: walletAction,
          amount: Number(amount),
          reason,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Wallet update failed.");
      setWalletModal(null);
      setAmount("");
      setReason("");
      await loadMembers();
      if (selected) await openMember({ ...selected });
    } catch (e) {
      alert(e.message || "Wallet update failed.");
    } finally {
      setBusy(false);
    }
  }

  function openRestriction(member, feature = "full_app") {
    setRestrictionModal(member);
    setRestrictionFeature(feature);
    setRestrictionMode("temporary");
    setRestrictionDays("7");
    setRestrictionReason("");
  }

  async function restrictionSubmit() {
    if (!restrictionModal) return;
    if (!restrictionReason.trim()) return alert("Restriction reason is required.");
    if (restrictionMode === "temporary") {
      const days = Number(restrictionDays);
      if (!Number.isInteger(days) || days < 1 || days > 365) return alert("Duration must be between 1 and 365 days.");
    }

    try {
      setBusy(true);
      const res = await api("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: restrictionModal.id,
          action: "set_restriction",
          feature: restrictionFeature,
          mode: restrictionMode,
          durationDays: restrictionMode === "temporary" ? Number(restrictionDays) : null,
          reason: restrictionReason.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Restriction update failed.");
      setRestrictionModal(null);
      await loadMembers();
      if (selected) await openMember({ ...selected });
    } catch (e) {
      alert(e.message || "Restriction update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function removeRestriction(feature) {
    if (!m) return;
    if (!window.confirm(`Remove ${featureLabel(feature)} restriction?`)) return;
    try {
      setBusy(true);
      const res = await api("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: m.id, action: "remove_restriction", feature }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Unable to remove restriction.");
      await loadMembers();
      await openMember({ ...m, ...(json.member || {}) });
    } catch (e) {
      alert(e.message || "Unable to remove restriction.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Members">
      <div className="members-page">
        <div className="toolbar">
          <div className="search-wrap">
            <span>⌕</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, UID, IGN, referral code or User ID..." />
            {search && <button className="clear-search" onClick={() => setSearch("")}>×</button>}
          </div>
          <button className="refresh" onClick={loadMembers} disabled={loading}>↻ Refresh</button>
        </div>

        <div className="stats">
          <Stat icon="👥" title="Total" value={members.length} />
          <Stat icon="🟢" title="Active" value={activeCount} />
          <Stat icon="🔒" title="Restricted" value={restrictedCount} />
          <Stat icon="🎁" title="Results" value={filtered.length} />
        </div>

        {error && <div className="error">{error}<button onClick={loadMembers}>Retry</button></div>}

        <section className="directory">
          <div className="directory-head">
            <div><h2>Member Directory</h2><p>{filtered.length} member{filtered.length === 1 ? "" : "s"} • Click a row to open profile</p></div>
            <span>Page {page} / {pages}</span>
          </div>

          {loading ? <div className="loading">Loading members…</div> :
          !rows.length ? <div className="empty"><span>👥</span><b>No members found</b><small>Try another search.</small></div> :
          <div className="table-scroll">
            <table>
              <thead><tr><th>MEMBER</th><th>GAME</th><th>EMAIL</th><th>WALLET</th><th>REFERRAL</th><th>JOINED</th><th>STATUS</th><th></th></tr></thead>
              <tbody>
                {rows.map(member => {
                  const status = Number(member.active_restrictions_count || 0) > 0 ? "restricted" : "active";
                  return <tr key={member.id} onClick={() => openMember(member)}>
                    <td><MemberCell member={member}/></td>
                    <td><b>{member.game_name || member.ign || "—"}</b><small>UID {member.uid || member.game_uid || member.free_fire_uid || "—"}</small></td>
                    <td className="email-cell">{member.email || "—"}</td>
                    <td><strong className="money">{money(member.wallet_total)}</strong></td>
                    <td><span className="ref-pill">🎁 {member.referral_code || "—"}</span></td>
                    <td>{date(member.created_at)}</td>
                    <td><span className={`status ${status}`}>{status === "restricted" ? "🔒 Restricted" : "● Active"}</span></td>
                    <td><button className="view-btn" onClick={e => { e.stopPropagation(); openMember(member); }}>View</button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>}

          {!loading && rows.length > 0 && <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
            <b>{page}</b><span>of {pages}</span>
            <button disabled={page === pages} onClick={() => setPage(p => p + 1)}>›</button>
          </div>}
        </section>
      </div>

      {selected && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}>
        <aside className="drawer member-popup">
          <button className="drawer-close" onClick={() => setSelected(null)}>×</button>
          {detailLoading ? <div className="drawer-loading">Loading member…</div> : m && <>
            <div className="profile">
              <Avatar member={m} size={64}/>
              <div className="profile-text"><span>MEMBER PROFILE</span><h2>{displayName(m)}</h2><p>{m.email || "No email"} · {m.phone || "No phone"}</p></div>
            </div>

            <div className="section">
              <SectionTitle title="Account Information" icon="👤"/>
              <div className="info-grid account-grid">
                <Info label="Real Name" value={m.full_name || m.name}/>
                <Info label="User ID" value={m.id} copy={copy}/>
                <Info label="Email" value={m.email}/>
                <Info label="Last IP" value={m.last_ip || m.ip_address || m.ip} copy={copy}/>
                <Info label="FCM Token" value={m.fcm_token || m.fcmToken} copy={copy} long/>
                <Info label="Account Created" value={date(m.created_at)}/>
                <Info label="IGN" value={m.game_name || m.ign}/>
                <Info label="UID" value={m.uid || m.game_uid || m.free_fire_uid} copy={copy}/>
              </div>
            </div>

            <div className="section">
              <SectionTitle title="Wallet" icon="💳" right="Tap balance to edit"/>
              <div className="wallet-grid">
                <Wallet title="Bonus" value={wallet.bonus_balance} onClick={() => {setWalletModal(m);setWalletType("bonus");setWalletAction("add");}}/>
                <Wallet title="Deposit" value={wallet.deposit_balance} onClick={() => {setWalletModal(m);setWalletType("deposit");setWalletAction("add");}}/>
                <Wallet title="Winning" value={wallet.winning_balance} onClick={() => {setWalletModal(m);setWalletType("winning");setWalletAction("add");}}/>
              </div>
              <div className="wallet-buttons">
                <button onClick={() => {setWalletModal(m);setWalletAction("add");}}>＋ Add Balance</button>
                <button className="deduct" onClick={() => {setWalletModal(m);setWalletAction("deduct");}}>− Deduct Balance</button>
              </div>
            </div>

            <div className="section">
              <SectionTitle title="Referral Network" icon="🎁" right={`${detail?.referral?.total_referrals || 0} referred`}/>
              <div className="info-grid two"><Info label="Referral Code" value={m.referral_code} copy={copy}/><Info label="Referred By" value={m.referred_by || "Direct / None"}/></div>
              {referrals.length ? <div className="ref-list">{referrals.map(u => <div className="ref-user" key={u.id}><Avatar member={u} size={38}/><div><b>{u.full_name || u.email || "User"}</b><small>{u.email || "—"} · {u.game_name || "IGN not set"}</small></div></div>)}</div> : <div className="empty-mini">No referred users.</div>}
            </div>

            <div className="section restriction-section">
              <div className="section-title"><div><span>🔒</span><div><h3>Restrictions</h3><small>Control individual features, games or the full app.</small></div></div><span className={isFullRestricted ? "danger-text" : "ok-text"}>{isFullRestricted ? "Full app restricted" : "No full-app restriction"}</span></div>

              <div className="feature-grid">
                {FEATURES.map(f => {
                  const active = restrictions.find(r => r.feature === f.key && r.is_active);
                  return <div className={`feature-card ${active ? "active" : ""}`} key={f.key}>
                    <div className="feature-icon">{f.icon}</div>
                    <div className="feature-copy"><b>{f.label}</b><small>{active ? (active.is_permanent ? "Permanent" : `Until ${date(active.expires_at)}`) : f.desc}</small></div>
                    {active ? <button className="remove" disabled={busy} onClick={() => removeRestriction(f.key)}>Remove</button> : <button className="restrict" onClick={() => openRestriction(m, f.key)}>Restrict</button>}
                  </div>;
                })}
              </div>
            </div>

            <div className="section">
              <SectionTitle title="Wallet Transactions" icon="📜" right="Latest 8"/>
              {txns.length ? <div className="tx-list">{txns.map(t => <div className="tx" key={t.id}><strong className={Number(t.amount) >= 0 ? "tx-plus" : "tx-minus"}>{Number(t.amount) >= 0 ? "+" : ""}{money(t.amount)}</strong><div><b>{t.type || "Transaction"}</b><small>{t.description || "—"} · {date(t.created_at)}</small></div></div>)}</div> : <div className="empty-mini">No wallet transactions.</div>}
            </div>
          </>}
        </aside>
      </div>}

      {walletModal && <div className="modal-layer" onMouseDown={e => e.target === e.currentTarget && setWalletModal(null)}>
        <div className="modal">
          <button className="modal-close" onClick={() => setWalletModal(null)}>×</button>
          <span className="modal-kicker">WALLET CONTROL</span><h2>{walletAction === "add" ? "Add Balance" : "Deduct Balance"}</h2><p>{displayName(walletModal)}</p>
          <div className="seg"><button className={walletAction === "add" ? "selected" : ""} onClick={() => setWalletAction("add")}>＋ Add</button><button className={walletAction === "deduct" ? "selected red" : ""} onClick={() => setWalletAction("deduct")}>− Deduct</button></div>
          <Field label="Wallet"><select value={walletType} onChange={e => setWalletType(e.target.value)}><option value="bonus">Bonus Balance</option><option value="deposit">Deposit Balance</option><option value="winning">Winning Balance</option></select></Field>
          <Field label="Amount"><input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="₹ 0.00"/></Field>
          <Field label="Reason"><input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason / audit note"/></Field>
          <button className={`primary ${walletAction}`} disabled={busy} onClick={walletSubmit}>{busy ? "Processing…" : walletAction === "add" ? "Confirm Add" : "Confirm Deduct"}</button>
        </div>
      </div>}

      {restrictionModal && <div className="modal-layer" onMouseDown={e => e.target === e.currentTarget && setRestrictionModal(null)}>
        <div className="modal restriction-modal">
          <button className="modal-close" onClick={() => setRestrictionModal(null)}>×</button>
          <span className="modal-kicker">ACCOUNT RESTRICTION</span><h2>Restrict Access</h2><p>{displayName(restrictionModal)}</p>

          <label className="field-label">What should be restricted?</label>
          <div className="feature-select">
            {FEATURES.map(f => <button key={f.key} className={restrictionFeature === f.key ? "chosen" : ""} onClick={() => setRestrictionFeature(f.key)}><span>{f.icon}</span><b>{f.label}</b></button>)}
          </div>

          <label className="field-label">Restriction duration</label>
          <div className="mode-select">
            <button className={restrictionMode === "temporary" ? "chosen" : ""} onClick={() => setRestrictionMode("temporary")}><b>⏱ Temporary</b><small>Auto-unlock after selected days</small></button>
            <button className={restrictionMode === "permanent" ? "chosen" : ""} onClick={() => setRestrictionMode("permanent")}><b>∞ Permanent</b><small>Stay restricted until admin removes it</small></button>
          </div>

          {restrictionMode === "temporary" && <Field label="Days (1–365)"><input value={restrictionDays} onChange={e => setRestrictionDays(e.target.value)} type="number" min="1" max="365"/></Field>}
          <Field label="Reason"><input value={restrictionReason} onChange={e => setRestrictionReason(e.target.value)} placeholder="Why is this restriction being applied?"/></Field>
          <button className="primary restriction-primary" disabled={busy} onClick={restrictionSubmit}>{busy ? "Applying…" : `🔒 Restrict ${featureLabel(restrictionFeature)}`}</button>
        </div>
      </div>}

      <style jsx>{`
        .members-page{width:100%;max-width:100%;padding:2px 0 32px;color:#171923}
        .toolbar{display:flex;gap:10px;align-items:center;margin-bottom:14px}
        .search-wrap{height:46px;flex:1;display:flex;align-items:center;gap:8px;padding:0 14px;background:#fff;border:1px solid #e8eaf0;border-radius:14px;box-shadow:0 5px 18px rgba(16,24,40,.05)}
        .search-wrap span{color:#9299a7;font-size:18px}.search-wrap input{width:100%;border:0;outline:0;background:transparent;font-size:13px;color:#1c2230}.clear-search{border:0;background:#f1f3f7;border-radius:50%;width:27px;height:27px;cursor:pointer}
        .refresh{height:46px;padding:0 17px;border:1px solid #f0d5dc;background:#fff;border-radius:14px;color:#ff174f;font-weight:800;cursor:pointer;box-shadow:0 5px 18px rgba(16,24,40,.05)}
        .refresh:disabled{opacity:.55}
        .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}
        .stat{min-width:0;background:#fff;border:1px solid #eceef2;border-radius:17px;padding:14px 16px;display:grid;grid-template-columns:32px 1fr;grid-template-rows:auto auto;column-gap:10px;box-shadow:0 5px 18px rgba(16,24,40,.045)}
        .stat-icon{grid-row:1/3;width:32px;height:32px;display:grid;place-items:center;border-radius:10px;background:#fff0f4}.stat small{color:#8b92a0;font-size:10px}.stat b{font-size:20px;line-height:1.15}
        .error{padding:12px 14px;border-radius:12px;background:#fff2f4;color:#bd2148;margin-bottom:12px;font-size:12px}.error button{float:right;border:0;background:#fff;border-radius:999px;padding:5px 10px;color:#bd2148}
        .directory{background:#fff;border:1px solid #e7eaf0;border-radius:18px;overflow:hidden;box-shadow:0 7px 24px rgba(16,24,40,.05)}
        .directory-head{display:flex;justify-content:space-between;align-items:center;padding:17px 18px;border-bottom:1px solid #edf0f4}.directory-head h2{font-size:16px;margin:0}.directory-head p{font-size:11px;color:#9299a7;margin:4px 0 0}.directory-head>span{font-size:11px;color:#9299a7}
        .table-scroll{width:100%;overflow-x:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}.table-scroll::-webkit-scrollbar{height:7px}.table-scroll::-webkit-scrollbar-thumb{background:#d9dde5;border-radius:20px}
        table{width:100%;border-collapse:collapse;min-width:1000px}th{padding:10px 13px;text-align:left;font-size:9px;letter-spacing:.7px;color:#969daa;background:#fafbfc}td{padding:11px 13px;border-top:1px solid #f0f2f5;font-size:11px;vertical-align:middle}tbody tr{cursor:pointer;transition:background .12s}tbody tr:hover{background:#fcf4f6}td small{display:block;color:#9aa1ad;margin-top:3px;font-size:9px}.email-cell{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.money{color:#ff174f}.ref-pill{display:inline-flex;align-items:center;max-width:150px;padding:6px 9px;border-radius:999px;background:#fff1f4;color:#e5164a;font-size:9px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.status{display:inline-flex;padding:6px 9px;border-radius:999px;font-size:9px;font-weight:800;white-space:nowrap}.status.active{background:#e9f9f0;color:#12844c}.status.restricted{background:#fff0e9;color:#c85d20}.view-btn{border:1px solid #f1d3db;background:#fff7f9;color:#ff174f;border-radius:9px;padding:7px 10px;font-size:10px;font-weight:800;cursor:pointer}
        .member-cell{display:flex;align-items:center;gap:9px;min-width:170px}.member-cell b{font-size:11px}.loading,.empty{text-align:center;padding:60px;color:#9299a7}.empty span{font-size:28px;display:block}.empty b,.empty small{display:block;margin-top:7px}.pagination{display:flex;align-items:center;justify-content:center;gap:10px;padding:13px;border-top:1px solid #edf0f4;font-size:11px}.pagination button{width:32px;height:32px;border:1px solid #e8ebf0;background:#fff;border-radius:10px;cursor:pointer;font-size:19px}.pagination button:disabled{opacity:.35;cursor:default}
        .overlay,.modal-layer{position:fixed;inset:0;background:rgba(15,20,31,.45);backdrop-filter:blur(5px);z-index:2000}.overlay{display:grid;place-items:center;padding:22px;box-sizing:border-box;overscroll-behavior:contain}.drawer{width:min(980px,92vw);height:min(88dvh,900px);background:#f5f7fa;overflow-y:auto;overflow-x:hidden;padding:26px;box-sizing:border-box;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scroll-behavior:smooth;scrollbar-gutter:stable;border:1px solid rgba(255,255,255,.8);border-radius:26px;box-shadow:0 30px 90px rgba(0,0,0,.25),0 8px 28px rgba(16,24,40,.10);animation:memberPopupIn .18s ease-out} @keyframes memberPopupIn{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}.drawer::-webkit-scrollbar{width:8px}.drawer::-webkit-scrollbar-thumb{background:#cfd4dd;border-radius:20px}.drawer-close,.modal-close{position:absolute;top:17px;right:17px;width:35px;height:35px;border:1px solid #e1e4ea;background:#fff;border-radius:50%;font-size:22px;line-height:1;cursor:pointer;box-shadow:0 5px 14px rgba(16,24,40,.08)}.profile{display:flex;align-items:center;gap:14px;padding:6px 48px 18px 0}.profile-text>span,.modal-kicker{font-size:9px;letter-spacing:1.4px;font-weight:900;color:#ff174f}.profile h2{font-size:23px;margin:3px 0}.profile p{font-size:11px;color:#8e95a2;margin:0;overflow-wrap:anywhere}
        .section{background:#fff;border:1px solid #e7eaf0;border-radius:17px;padding:15px;margin-bottom:12px;box-shadow:0 5px 18px rgba(16,24,40,.04)}.section-title{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.section-title>div{display:flex;align-items:center;gap:9px}.section-title h3{font-size:13px;margin:0}.section-title small{display:block;color:#949ba8;font-size:9px;margin-top:2px}.ok-text{font-size:9px;color:#12844c}.danger-text{font-size:9px;color:#c85d20}
        .info-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.info-box{min-width:0;position:relative;background:linear-gradient(145deg,#ffffff 0%,#f7f8fb 100%);border:1px solid #e6e9ef;border-radius:18px;padding:14px 15px;box-sizing:border-box;box-shadow:inset 1px 1px 4px rgba(255,255,255,.9),inset -2px -2px 5px rgba(18,25,38,.035),0 5px 16px rgba(18,25,38,.035);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.info-box:hover{transform:translateY(-1px);border-color:#ffd0db;box-shadow:inset 1px 1px 4px rgba(255,255,255,.9),0 8px 22px rgba(255,23,79,.08)}.info-box.long{grid-column:1/-1}.info-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.info-label-wrap{display:flex;align-items:center;gap:7px;min-width:0}.info-mini-icon{width:25px;height:25px;display:grid;place-items:center;border-radius:9px;background:#fff0f4;border:1px solid #ffd9e2;font-size:12px;flex:none}.info-label{font-size:8px;text-transform:uppercase;letter-spacing:.8px;color:#858d9b;margin:0;font-weight:900}.info-value{font-size:12px;font-weight:800;line-height:1.5;overflow-wrap:anywhere;word-break:break-word;color:#202532;min-height:18px}.copy-btn{border:1px solid #ffd1dc;background:#fff0f4;color:#ff174f;border-radius:999px;padding:6px 9px;font-size:8px;font-weight:900;cursor:pointer;flex:none;box-shadow:0 3px 8px rgba(255,23,79,.08);transition:transform .12s ease,background .12s ease}.copy-btn:hover{background:#ffe5ed;transform:translateY(-1px)}.account-grid{align-items:stretch}.account-grid .info-box{min-height:78px}.account-grid .info-box.long{min-height:100px}.account-grid .info-value{max-width:100%;max-height:82px;overflow:auto;scrollbar-width:thin}.account-grid .info-box.long .info-value{font-size:10px;line-height:1.55}.restriction-section{border-color:#f0e3e7}
        .wallet-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.wallet-box{position:relative;background:linear-gradient(145deg,#fbfcfe,#f4f6f9);border:1px solid #e7eaf0;border-radius:18px;padding:13px 14px;cursor:pointer;box-shadow:inset 2px 2px 5px rgba(20,28,45,.04),0 4px 12px rgba(20,28,45,.035);transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}.wallet-box:hover{transform:translateY(-1px);border-color:#ffc4d1;box-shadow:0 7px 18px rgba(255,23,79,.10)}.wallet-box:active{transform:scale(.99)}.wallet-box small{color:#8d95a2;font-size:9px}.wallet-box b{display:block;color:#ff174f;font-size:18px;margin:5px 0}.wallet-box small:last-child{display:inline-flex;padding:4px 8px;border-radius:999px;background:#fff0f4;color:#e5164a;font-weight:800}.wallet-buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.wallet-buttons button,.feature-card button{border:0;border-radius:11px;padding:10px;font-weight:800;font-size:10px;background:#ff174f;color:#fff;cursor:pointer}.wallet-buttons .deduct{background:#fff0f2;color:#d84455;border:1px solid #ffd2da}
        .ref-list{margin-top:8px;border-top:1px solid #eef0f3}.ref-user{display:flex;align-items:center;gap:9px;padding:9px 0;border-bottom:1px solid #eef0f3}.ref-user b{font-size:10px}.ref-user small{display:block;color:#9299a7;font-size:9px;margin-top:2px;overflow-wrap:anywhere}.empty-mini{padding:13px 0;color:#9299a7;font-size:10px}.tx{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #eef0f3}.tx strong{width:72px;flex:none;font-size:12px}.tx-plus{color:#07944b}.tx-minus{color:#e14b59}.tx b{font-size:10px}.tx small{display:block;color:#9299a7;font-size:9px;margin-top:3px;overflow-wrap:anywhere}
        .feature-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.feature-card{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #e9ecf0;border-radius:12px;background:#fafbfc;min-width:0}.feature-card.active{background:#fff4ef;border-color:#ffd7c8}.feature-icon{width:31px;height:31px;flex:none;display:grid;place-items:center;background:#fff;border-radius:9px}.feature-copy{min-width:0;flex:1}.feature-copy b{display:block;font-size:10px}.feature-copy small{display:block;color:#949ba8;font-size:8px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.feature-card button{padding:6px 8px;font-size:8px;flex:none}.feature-card .remove{background:#fff;color:#c85d20;border:1px solid #ffd3c5}.feature-card .restrict{background:#fff0f4;color:#ff174f;border:1px solid #ffd0da}
        .modal-layer{display:grid;place-items:center;padding:18px;box-sizing:border-box}.modal{position:relative;width:min(480px,94vw);max-height:92dvh;overflow:auto;background:#fff;border-radius:20px;padding:24px;box-sizing:border-box;box-shadow:0 25px 70px rgba(0,0,0,.24)}.modal h2{font-size:21px;margin:5px 0}.modal>p{font-size:11px;color:#8e95a2;margin:0 0 15px}.modal-close{top:14px;right:14px}.seg{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:13px}.seg button{border:1px solid #e8ebf0;background:#f8f9fb;border-radius:10px;padding:10px;font-weight:800;cursor:pointer}.seg .selected{background:#ff174f;color:#fff;border-color:#ff174f}.seg .red{background:#e14b59;border-color:#e14b59}.field{display:block;margin:10px 0}.field-label{display:block;font-size:10px;font-weight:800;margin:12px 0 7px}.field>span{display:block;font-size:9px;font-weight:800;margin-bottom:5px}.field input,.field select{width:100%;height:42px;box-sizing:border-box;border:1px solid #e2e6eb;border-radius:10px;padding:0 11px;outline:0;background:#fafbfc;font-size:11px}.primary{width:100%;border:0;border-radius:11px;height:43px;background:#ff174f;color:#fff;font-weight:900;cursor:pointer;margin-top:7px}.primary.deduct{background:#e14b59}.restriction-primary{margin-top:14px}
        .feature-select{display:grid;grid-template-columns:1fr 1fr;gap:7px}.feature-select button{display:flex;align-items:center;gap:7px;border:1px solid #e6e9ee;background:#fafbfc;border-radius:10px;padding:9px;text-align:left;cursor:pointer}.feature-select button span{font-size:16px}.feature-select button b{font-size:9px}.feature-select button.chosen{border-color:#ff174f;background:#fff0f4;color:#e5164a}.mode-select{display:grid;grid-template-columns:1fr 1fr;gap:8px}.mode-select button{border:1px solid #e6e9ee;background:#fafbfc;border-radius:11px;padding:10px;text-align:left;cursor:pointer}.mode-select button b{display:block;font-size:10px}.mode-select button small{display:block;color:#9299a7;font-size:8px;margin-top:3px}.mode-select button.chosen{border-color:#ff174f;background:#fff0f4}
        @media(max-width:900px){.stats{grid-template-columns:1fr 1fr}.overlay{padding:12px}.drawer{width:100%;height:min(94dvh,900px);padding:18px;border-radius:20px}.feature-grid{grid-template-columns:1fr}}@media(max-width:700px){.info-grid{grid-template-columns:1fr}.info-box.long{grid-column:auto}.wallet-grid{grid-template-columns:1fr 1fr}.wallet-box b{font-size:16px}.toolbar{flex-direction:column;align-items:stretch}.refresh{width:100%}.stats{grid-template-columns:1fr 1fr}.info-grid{grid-template-columns:1fr}.info-box.long{grid-column:auto}.wallet-grid{grid-template-columns:1fr}.feature-select,.mode-select{grid-template-columns:1fr}.profile h2{font-size:19px}}
      `}</style>
    </AdminShell>
  );
}

function featureLabel(key) {
  return FEATURES.find(x => x.key === key)?.label || key;
}

function MemberCell({ member }) {
  return <div className="member-cell"><Avatar member={member} size={40}/><div><b>{member.full_name || member.name || member.username || member.email || "Unknown User"}</b><small>{String(member.id || "—").slice(0, 18)}</small></div></div>;
}

function Avatar({ member, size = 40 }) {
  const src = member?.profile_pic || member?.profile_picture || member?.avatar_url || "";
  const label = (member?.full_name || member?.name || member?.username || member?.email || "U").charAt(0).toUpperCase();
  return <div style={{ width:size, height:size, minWidth:size, borderRadius:size > 50 ? 18 : 12, overflow:"hidden", display:"grid", placeItems:"center", background:"linear-gradient(135deg,#ff174f,#ff5578)", color:"#fff", fontWeight:900, fontSize:size > 50 ? 24 : 14 }}>{src ? <img src={src} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} onError={e => { e.currentTarget.style.display="none"; }} /> : label}</div>;
}

function Info({ label, value, copy, long }) {
  const icons = {
    "Real Name": "👤",
    "User ID": "🆔",
    "Email": "✉️",
    "Last IP": "🌐",
    "FCM Token": "🔔",
    "Account Created": "📅",
    "IGN": "🎮",
    "UID": "🔢",
  };
  return (
    <div className={`info-box premium-info ${long ? "long" : ""}`}>
      <div className="info-top">
        <div className="info-label-wrap">
          <span className="info-mini-icon">{icons[label] || "•"}</span>
          <span className="info-label">{label}</span>
        </div>
        {copy && value ? (
          <button
            type="button"
            className="copy-btn"
            onClick={(e) => { e.stopPropagation(); copy(value); }}
          >
            ⧉ Copy
          </button>
        ) : null}
      </div>
      <div className="info-value">{value || "—"}</div>
    </div>
  );
}

function Wallet({ title, value, onClick }) {
  return <div className="wallet-box" onClick={onClick}><small>{title} Balance</small><b>₹{Number(value || 0).toFixed(2)}</b><small>Manage balance →</small></div>;
}

function Stat({ icon, title, value }) {
  return <div className="stat"><div className="stat-icon">{icon}</div><small>{title}</small><b>{value}</b></div>;
}

function SectionTitle({ title, icon, right }) {
  return <div className="section-title"><div><span>{icon}</span><div><h3>{title}</h3>{right ? <small>{right}</small> : null}</div></div></div>;
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
