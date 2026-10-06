 "use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "../AdminShell";

const PAGE_SIZE = 15;

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
  const [restrictionDays, setRestrictionDays] = useState("7");
  const [restrictionReason, setRestrictionReason] = useState("");
  const [busy, setBusy] = useState(false);

  const authHeaders = async () => {
    try {
      const { supabase } = await import("../../../lib/supabase.js");
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token
        ? { Authorization: `Bearer ${data.session.access_token}` }
        : {};
    } catch {
      return {};
    }
  };

  async function loadMembers() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/admin/members", {
        cache: "no-store",
        headers: await authHeaders(),
      });
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
    setDetail(null);
    try {
      const res = await fetch(`/api/admin/members?userId=${encodeURIComponent(member.id)}`, {
        cache: "no-store",
        headers: await authHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Unable to load member.");
      setDetail({ member, ...json });
    } catch (e) {
      alert(e.message || "Unable to load member.");
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => { loadMembers(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      [
        m.id, m.full_name, m.name, m.username, m.email, m.phone,
        m.game_name, m.ign, m.uid, m.game_uid, m.free_fire_uid,
        m.referral_code, m.referred_by, m.last_ip, m.ip_address
      ].filter(Boolean).some(v => String(v).toLowerCase().includes(q))
    );
  }, [members, search]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [search]);

  const restricted = members.filter(m => String(m.status || "").toLowerCase() === "restricted").length;
  const active = members.length - restricted;

  function name(m) {
    return m?.full_name || m?.name || m?.username || m?.email || "Unknown User";
  }

  function avatar(m) {
    return m?.profile_pic || m?.profile_picture || m?.avatar_url || "";
  }

  function money(v) {
    return `₹${Number(v || 0).toFixed(2)}`;
  }

  function date(v) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  }

  function copy(v) {
    if (!v) return;
    navigator.clipboard?.writeText(String(v));
  }

  async function walletSubmit() {
    if (!walletModal || !amount || Number(amount) <= 0) return alert("Enter a valid amount.");
    try {
      setBusy(true);
      const res = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
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
      if (selected) await openMember(walletModal);
    } catch (e) {
      alert(e.message || "Wallet update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function restrictionSubmit(action) {
    if (!selected) return;
    if (action === "restrict" && !restrictionReason.trim()) return alert("Restriction reason is required.");
    try {
      setBusy(true);
      const res = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          userId: selected.id,
          action,
          durationDays: Number(restrictionDays),
          reason: restrictionReason.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Restriction update failed.");
      await loadMembers();
      await openMember({ ...selected, ...(json.member || {}) });
      setRestrictionReason("");
    } catch (e) {
      alert(e.message || "Restriction update failed.");
    } finally {
      setBusy(false);
    }
  }

  const w = detail?.wallet || {};
  const referrals = detail?.referral?.users || [];
  const txns = detail?.history || [];
  const m = detail?.member || selected;
  const isRestricted = String(m?.status || "").toLowerCase() === "restricted";

  return (
    <AdminShell title="Members">
      <div className="page">
        <div className="hero">
          <div>
            <span className="eyebrow">GAMERZADDA • USER CONTROL</span>
            <h1>Members</h1>
            <p>Manage profiles, wallets, referrals and account restrictions.</p>
          </div>
          <button className="pill refresh" onClick={loadMembers} disabled={loading}>↻ Refresh</button>
        </div>

        <div className="stats">
          <Stat icon="👥" title="Total Members" value={members.length} sub="Registered accounts" />
          <Stat icon="🟢" title="Active" value={active} sub="Available accounts" />
          <Stat icon="🔒" title="Restricted" value={restricted} sub="Limited accounts" />
          <Stat icon="💰" title="Profiles Loaded" value={filtered.length} sub="Current results" />
        </div>

        <div className="toolbar">
          <div className="search">⌕<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, UID, referral code, User ID..." /></div>
          <span className="result-pill">{filtered.length} members</span>
        </div>

        {error && <div className="error">⚠️ {error}<button onClick={loadMembers}>Retry</button></div>}

        <section className="card">
          <div className="section-head">
            <div><b>Member Directory</b><small>Click any member for complete details</small></div>
            <span>Page {page} / {pages}</span>
          </div>

          {loading ? <div className="loading">Loading members…</div> : !rows.length ? <div className="empty">👥<b>No members found</b><small>Try another search.</small></div> :
          <div className="table-wrap"><table><thead><tr>
            <th>MEMBER</th><th>GAME</th><th>EMAIL</th><th>WALLET</th><th>REFERRAL</th><th>ACCOUNT</th><th>STATUS</th><th></th>
          </tr></thead><tbody>{rows.map(member => {
            const walletTotal = Number(member.wallet_total || 0);
            const status = String(member.status || "active").toLowerCase();
            return <tr key={member.id} onClick={() => openMember(member)}>
              <td><div className="member"><Avatar m={member}/><div><b>{name(member)}</b><small>{String(member.id || "—").slice(0, 18)}</small></div></div></td>
              <td><b>{member.game_name || member.ign || "—"}</b><small>UID: {member.uid || member.game_uid || member.free_fire_uid || "—"}</small></td>
              <td>{member.email || "—"}</td>
              <td><strong className="pink">{money(walletTotal)}</strong></td>
              <td><span className="ref">🎁 {member.referral_code || "—"}</span></td>
              <td>{date(member.created_at)}</td>
              <td><span className={`status ${status}`}>{status === "restricted" ? "🔒 Restricted" : "● Active"}</span></td>
              <td><button className="view" onClick={e => { e.stopPropagation(); openMember(member); }}>View →</button></td>
            </tr>;
          })}</tbody></table></div>}

          {!loading && rows.length > 0 && <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>←</button>
            <b>{page}</b><span>of {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>→</button>
          </div>}
        </section>
      </div>

      {selected && <div className="overlay" onMouseDown={e => e.target === e.currentTarget && setSelected(null)}>
        <aside className="drawer">
          <button className="close" onClick={() => setSelected(null)}>×</button>
          {detailLoading ? <div className="drawer-loading">Loading profile…</div> : m && <>
            <div className="profile-head">
              <Avatar m={m} big />
              <div><span className="eyebrow">MEMBER PROFILE</span><h2>{name(m)}</h2><p>{m.email || "No email"}</p></div>
            </div>

            <div className="identity">
              <Info label="Real Name" value={m.full_name || m.name} />
              <Info label="User ID" value={m.id} copy={copy} />
              <Info label="Email" value={m.email} />
              <Info label="Phone" value={m.phone} />
              <Info label="IGN" value={m.game_name || m.ign} />
              <Info label="UID" value={m.uid || m.game_uid || m.free_fire_uid} copy={copy} />
              <Info label="Last IP" value={m.last_ip || m.ip_address || m.ip} copy={copy} />
              <Info label="FCM Token" value={m.fcm_token || m.fcmToken} copy={copy} />
              <Info label="Account Created" value={date(m.created_at)} />
              <Info label="Status" value={isRestricted ? "Restricted" : "Active"} />
            </div>

            <div className="wallet-grid">
              <Wallet title="Bonus" value={w.bonus_balance} onClick={() => {setWalletModal(m);setWalletType("bonus");}} />
              <Wallet title="Deposit" value={w.deposit_balance} onClick={() => {setWalletModal(m);setWalletType("deposit");}} />
              <Wallet title="Winning" value={w.winning_balance} onClick={() => {setWalletModal(m);setWalletType("winning");}} />
            </div>

            <div className="block">
              <div className="block-title"><span>💳 Wallet Control</span><small>Add / Deduct balance with audit reason</small></div>
              <div className="wallet-actions">
                <button onClick={() => {setWalletModal(m);setWalletAction("add");}}>＋ Add Money</button>
                <button className="deduct" onClick={() => {setWalletModal(m);setWalletAction("deduct");}}>− Deduct Money</button>
              </div>
            </div>

            <div className="block">
              <div className="block-title"><span>🎁 Referral Network</span><small>{detail?.referral?.total_referrals || 0} referred users</small></div>
              <div className="ref-grid">
                <Info label="Referral Code" value={m.referral_code} copy={copy} />
                <Info label="Referred By" value={m.referred_by || "Direct / None"} />
              </div>
              {referrals.length ? <div className="ref-list">{referrals.map(u => <div className="ref-user" key={u.id}><Avatar m={u}/><div><b>{u.full_name || u.email || "User"}</b><small>{u.email || "—"} • {u.game_name || "IGN not set"}</small></div></div>)}</div> : <div className="muted">No referred users.</div>}
            </div>

            <div className="block">
              <div className="block-title"><span>📜 Wallet Transactions</span><small>Latest 8</small></div>
              {txns.length ? <div className="tx-list">{txns.map(t => <div className="tx" key={t.id}><span className={Number(t.amount) >= 0 ? "plus" : "minus"}>{Number(t.amount) >= 0 ? "+" : ""}{money(t.amount)}</span><div><b>{t.type || "Transaction"}</b><small>{t.description || "—"} • {date(t.created_at)}</small></div></div>)}</div> : <div className="muted">No wallet transactions.</div>}
            </div>

            <div className="block restriction">
              <div className="block-title"><span>🔒 Account Restriction</span><small>{isRestricted ? "Currently restricted" : "No restriction active"}</small></div>
              {isRestricted ? <div className="restriction-active"><b>Restricted</b><span>{m.restricted_until ? `Until ${date(m.restricted_until)}` : "Active"}</span><p>{m.status_reason || "No reason provided."}</p><button disabled={busy} onClick={() => restrictionSubmit("unrestrict")}>✓ Remove Restriction</button></div> :
              <><div className="restrict-form"><input value={restrictionDays} onChange={e => setRestrictionDays(e.target.value)} type="number" min="1" max="365" placeholder="Days"/><input value={restrictionReason} onChange={e => setRestrictionReason(e.target.value)} placeholder="Reason for restriction"/></div><button className="restrict-btn" disabled={busy} onClick={() => restrictionSubmit("restrict")}>🔒 Restrict Account</button></>}
            </div>
          </>}
        </aside>
      </div>}

      {walletModal && <div className="overlay" onMouseDown={e => e.target === e.currentTarget && setWalletModal(null)}>
        <div className="wallet-modal">
          <button className="close" onClick={() => setWalletModal(null)}>×</button>
          <span className="eyebrow">WALLET CONTROL</span><h2>{walletAction === "add" ? "Add Balance" : "Deduct Balance"}</h2><p>{name(walletModal)}</p>
          <div className="seg"><button className={walletAction==="add"?"on":""} onClick={()=>setWalletAction("add")}>＋ Add</button><button className={walletAction==="deduct"?"on danger-on":""} onClick={()=>setWalletAction("deduct")}>− Deduct</button></div>
          <label>Wallet Type<select value={walletType} onChange={e=>setWalletType(e.target.value)}><option value="bonus">Bonus Balance</option><option value="deposit">Deposit Balance</option><option value="winning">Winning Balance</option></select></label>
          <label>Amount<input value={amount} onChange={e=>setAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="₹ 0.00"/></label>
          <label>Reason<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why is this adjustment being made?"/></label>
          <button className={`submit ${walletAction}`} disabled={busy} onClick={walletSubmit}>{busy ? "Processing…" : walletAction === "add" ? "＋ Confirm Add" : "− Confirm Deduct"}</button>
        </div>
      </div>}

      <style jsx>{`
        .page{padding:4px 2px 40px;color:#171923}.hero{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}.eyebrow{font-size:10px;font-weight:900;letter-spacing:1.5px;color:#ff174f}.hero h1{font-size:30px;margin:5px 0 3px;font-weight:900}.hero p{margin:0;color:#8a8f9c;font-size:13px}.pill,.result-pill,.view,.status,.ref{border:0;border-radius:999px;padding:9px 14px;font-weight:800;font-size:12px}.refresh{background:#fff;box-shadow:7px 7px 16px #d9dce5,-7px -7px 16px #fff;color:#ff174f;cursor:pointer}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}.stats :global(.stat){background:#edf0f5;border-radius:20px;padding:18px;box-shadow:inset 3px 3px 7px #d5d8df,inset -3px -3px 7px #fff}.stats b{display:block;font-size:24px}.stats small{color:#8d92a0}.toolbar,.card,.block{background:#edf0f5;border-radius:22px;box-shadow:8px 8px 20px #d7dae2,-8px -8px 20px #fff}.toolbar{padding:12px;display:flex;gap:10px;margin-bottom:16px}.search{flex:1;display:flex;align-items:center;gap:8px;background:#edf0f5;border-radius:14px;padding:0 14px;box-shadow:inset 3px 3px 7px #d5d8df,inset -3px -3px 7px #fff;color:#9297a4}.search input{border:0;outline:0;background:transparent;width:100%;height:44px;font-size:13px}.result-pill{background:#fff;color:#777}.error{padding:14px;background:#fff0f3;color:#c51645;border-radius:15px;margin-bottom:14px}.error button{float:right;border:0;border-radius:999px;padding:6px 12px}.card{overflow:hidden}.section-head{padding:18px 20px;display:flex;justify-content:space-between}.section-head b{display:block;font-size:16px}.section-head small{color:#9297a4}.section-head>span{font-size:12px;color:#9297a4}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:1050px}th{font-size:10px;color:#969ba8;text-align:left;padding:11px 15px;border-bottom:1px solid #dde0e7}td{padding:13px 15px;border-bottom:1px solid #e1e3e9;font-size:12px;vertical-align:middle}tbody tr{cursor:pointer;transition:.15s}tbody tr:hover{background:#f7f8fa}.member{display:flex;align-items:center;gap:10px}.member small,td small{display:block;color:#9297a4;margin-top:3px}.avatar{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(145deg,#ff416c,#ff174f);color:#fff;font-weight:900;overflow:hidden;flex:none;box-shadow:4px 4px 9px #d4d6dd,-3px -3px 7px #fff}.avatar img{width:100%;height:100%;object-fit:cover}.avatar.big{width:70px;height:70px;border-radius:22px;font-size:25px}.pink{color:#ff174f}.ref{background:#fff0f4;color:#e91549}.status{background:#e5f8ed;color:#0d8a49}.status.restricted{background:#fff0e8;color:#d95b13}.view{background:#fff;color:#ff174f;cursor:pointer}.pagination{display:flex;justify-content:center;align-items:center;gap:14px;padding:16px}.pagination button{width:36px;height:36px;border:0;border-radius:12px;background:#edf0f5;box-shadow:4px 4px 8px #d7dae2,-4px -4px 8px #fff;cursor:pointer}.pagination button:disabled{opacity:.4}.loading,.empty{text-align:center;padding:60px;color:#8d92a0}.empty>*{display:block;margin:8px auto}.overlay{position:fixed;inset:0;background:rgba(17,20,29,.42);backdrop-filter:blur(7px);z-index:1000;display:flex;justify-content:flex-end}.drawer{width:min(720px,96vw);height:100%;overflow:auto;background:#edf0f5;padding:26px;position:relative;box-shadow:-15px 0 35px rgba(0,0,0,.18)}.close{position:absolute;right:20px;top:18px;width:36px;height:36px;border:0;border-radius:50%;background:#edf0f5;box-shadow:4px 4px 9px #d1d4dc,-4px -4px 9px #fff;font-size:23px;cursor:pointer}.profile-head{display:flex;gap:16px;align-items:center;margin:15px 40px 22px 0}.profile-head h2{margin:4px 0;font-size:25px}.profile-head p{margin:0;color:#888e9c}.identity{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}.identity>div,.ref-grid>div{background:#edf0f5;border-radius:14px;padding:12px;box-shadow:inset 2px 2px 6px #d8dbe2,inset -2px -2px 6px #fff}.label{display:block;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#969ba8;margin-bottom:5px}.value{font-size:12px;font-weight:800;word-break:break-all}.copy{float:right;border:0;background:transparent;color:#ff174f;cursor:pointer}.wallet-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}.wallet{padding:15px;border-radius:17px;background:#fff;box-shadow:5px 5px 12px #d7dae2,-5px -5px 12px #fff;cursor:pointer}.wallet small{color:#9297a4}.wallet b{display:block;margin-top:5px;font-size:18px;color:#ff174f}.block{padding:17px;margin-bottom:14px}.block-title{display:flex;justify-content:space-between;margin-bottom:13px}.block-title span{font-weight:900}.block-title small{color:#9499a5}.wallet-actions{display:flex;gap:10px}.wallet-actions button,.restrict-btn,.restriction-active button{flex:1;border:0;border-radius:13px;padding:12px;background:#ff174f;color:white;font-weight:900;cursor:pointer}.wallet-actions .deduct{background:#fff;color:#e54848}.ref-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ref-list{margin-top:10px}.ref-user{display:flex;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #ddd}.ref-user .avatar{width:34px;height:34px;border-radius:10px}.tx{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #ddd}.tx>span{font-weight:900;min-width:85px}.plus{color:#07944b}.minus{color:#e54848}.tx small{display:block;color:#9297a4}.muted{color:#9297a4;font-size:12px}.restriction-active{background:#fff2ed;border-radius:14px;padding:14px}.restriction-active b{color:#d95b13}.restriction-active span{margin-left:10px;font-size:11px;color:#777}.restriction-active p{font-size:12px;color:#666}.restriction-active button{background:#fff;color:#d95b13}.restrict-form{display:grid;grid-template-columns:110px 1fr;gap:9px;margin-bottom:10px}.restrict-form input,.wallet-modal input,.wallet-modal select{border:0;outline:0;background:#edf0f5;border-radius:12px;padding:12px;box-shadow:inset 3px 3px 7px #d5d8df,inset -3px -3px 7px #fff;width:100%;box-sizing:border-box}.wallet-modal{width:min(430px,92vw);background:#edf0f5;border-radius:25px;padding:28px;position:relative;box-shadow:12px 12px 30px #c8cbd2,-12px -12px 30px #fff}.wallet-modal h2{margin:5px 0}.wallet-modal>p{color:#8c919e}.wallet-modal label{display:block;font-size:11px;font-weight:800;margin:12px 0}.wallet-modal input,.wallet-modal select{margin-top:6px}.seg{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:18px 0}.seg button{border:0;border-radius:12px;padding:11px;background:#fff;font-weight:900;cursor:pointer}.seg .on{background:#ff174f;color:#fff}.seg .danger-on{background:#e54848}.submit{width:100%;border:0;border-radius:14px;padding:13px;margin-top:15px;background:#ff174f;color:#fff;font-weight:900;cursor:pointer}.submit.deduct{background:#e54848}.drawer-loading{text-align:center;padding-top:80px;color:#8c919e}@media(max-width:900px){.stats{grid-template-columns:1fr 1fr}.identity{grid-template-columns:1fr}.wallet-grid{grid-template-columns:1fr}.hero{align-items:flex-start;gap:10px}.toolbar{flex-direction:column}}@media(max-width:500px){.stats{grid-template-columns:1fr}.drawer{padding:18px}.ref-grid{grid-template-columns:1fr}}
      `}</style>
    </AdminShell>
  );
}

function Avatar({ m, big }) {
  const src = m?.profile_pic || m?.profile_picture || m?.avatar_url || "";
  const label = (m?.full_name || m?.name || m?.username || m?.email || "U").charAt(0).toUpperCase();
  return <div className={`avatar ${big ? "big" : ""}`}>{src ? <img src={src} alt="" /> : label}</div>;
}

function Info({ label, value, copy }) {
  return <div><span className="label">{label}</span><span className="value">{value || "—"}</span>{copy && value ? <button className="copy" onClick={() => copy(value)}>Copy</button> : null}</div>;
}

function Wallet({ title, value, onClick }) {
  return <div className="wallet" onClick={onClick}><small>{title} Balance</small><b>₹{Number(value || 0).toFixed(2)}</b><small>Tap to manage</small></div>;
}

function Stat({ icon, title, value, sub }) {
  return <div className="stat"><span style={{fontSize:22}}>{icon}</span><small>{title}</small><b>{value}</b><small>{sub}</small></div>;
}
