"use client";



import { useEffect, useMemo, useState } from "react";

import AdminShell from "../AdminShell";

import { supabase } from "../../../lib/supabase.js";



const PAGE_SIZE = 20;



export default function MembersPage() {

  const [members, setMembers] = useState([]);

  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");

  const [status, setStatus] = useState("all");

  const [page, setPage] = useState(1);

  const [actionLoading, setActionLoading] = useState(null);

  const [error, setError] = useState("");
  const [selectedMember,setSelectedMember]=useState(null),[memberDetail,setMemberDetail]=useState(null),[transactions,setTransactions]=useState([]),[referrals,setReferrals]=useState([]),[referrer,setReferrer]=useState(null),[loginHistory,setLoginHistory]=useState([]),[wallet,setWallet]=useState(null),[modalLoading,setModalLoading]=useState(false),[modalError,setModalError]=useState(""),[walletAmount,setWalletAmount]=useState(""),[walletReason,setWalletReason]=useState(""),[walletAction,setWalletAction]=useState("add"),[walletType,setWalletType]=useState("winning"),[walletSaving,setWalletSaving]=useState(false);
  async function session(){const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw new Error("Admin login required.");return session}
  async function openMember(member){setSelectedMember(member);setModalLoading(true);setModalError("");try{const ss=await session();const r=await fetch(`/api/admin/members?userId=${encodeURIComponent(member.id)}`,{cache:"no-store",credentials:"include",headers:{Authorization:`Bearer ${ss.access_token}`}});const raw=await r.text(),x=raw?JSON.parse(raw):null;if(!r.ok||!x?.success)throw new Error(x?.error||"Unable to load member details.");setMemberDetail(x.member||member);setWallet(x.wallet||null);setTransactions(x.history||[]);setReferrals(x.referral?.users||[]);setReferrer(x.referral?.referrer||null);setLoginHistory(x.loginHistory||[]);setSelectedMember(x.member||member)}catch(e){setModalError(e?.message||"Unable to load member details.")}finally{setModalLoading(false)}}
  async function refreshMember(){if(selectedMember)await openMember(selectedMember)}
  async function onWalletChange(){if(!selectedMember)return;const n=Number(walletAmount);if(!Number.isFinite(n)||n<=0)return setModalError("Enter a valid wallet amount.");if(!walletReason.trim())return setModalError("Reason is required for wallet changes.");setWalletSaving(true);setModalError("");try{const ss=await session();const r=await fetch("/api/admin/members",{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json",Authorization:`Bearer ${ss.access_token}`},body:JSON.stringify({userId:selectedMember.id,walletType,amount:walletAction==="deduct"?-Math.abs(n):Math.abs(n),note:walletReason.trim()})});const raw=await r.text(),x=raw?JSON.parse(raw):null;if(!r.ok||!x?.success)throw new Error(x?.error||"Unable to change wallet.");setWallet(x.wallet||null);setTransactions(o=>[x.transaction,...o].filter(Boolean));setWalletAmount("");setWalletReason("");await loadMembers()}catch(e){setModalError(e?.message||"Unable to change wallet.")}finally{setWalletSaving(false)}}
  async function onModalToggleStatus(){if(selectedMember){await toggleMember(selectedMember);await refreshMember()}}




  async function loadMembers() {

    try {

      setLoading(true);

      setError("");



      const { data, error } = await supabase

        .from("users")

        .select("*")

        .order("created_at", { ascending: false });



      if (error) throw error;



      setMembers(data || []);

    } catch (err) {

      console.error("Members load error:", err);

      setError(err?.message || "Failed to load members.");

    } finally {

      setLoading(false);

    }

  }



  useEffect(() => {

    loadMembers();

  }, []);



  const filteredMembers = useMemo(() => {

    const q = search.trim().toLowerCase();



    return members.filter((member) => {

      const memberStatus = String(member.status || "active").toLowerCase();



      const matchesStatus =

        status === "all" ||

        (status === "active" && memberStatus === "active") ||

        (status === "blocked" &&

          ["blocked", "banned", "suspended"].includes(memberStatus));



      if (!matchesStatus) return false;



      if (!q) return true;



      return [

        member.name,

        member.full_name,

        member.username,

        member.email,

        member.uid,

        member.game_uid,

        member.ign,

        member.phone,

      ]

        .filter(Boolean)

        .some((value) =>

          String(value).toLowerCase().includes(q)

        );

    });

  }, [members, search, status]);



  const totalPages = Math.max(

    1,

    Math.ceil(filteredMembers.length / PAGE_SIZE)

  );



  const visibleMembers = filteredMembers.slice(

    (page - 1) * PAGE_SIZE,

    page * PAGE_SIZE

  );



  useEffect(() => {

    setPage(1);

  }, [search, status]);



  const activeCount = members.filter(

    (m) => String(m.status || "active").toLowerCase() === "active"

  ).length;



  const blockedCount = members.filter((m) =>

    ["blocked", "banned", "suspended"].includes(

      String(m.status || "").toLowerCase()

    )

  ).length;



  async function toggleMember(member) {

    const current = String(member.status || "active").toLowerCase();

    const nextStatus = current === "active" ? "blocked" : "active";



    const ok = window.confirm(

      nextStatus === "blocked"

        ? `Block ${displayName(member)}?`

        : `Unblock ${displayName(member)}?`

    );



    if (!ok) return;



    try {

      setActionLoading(member.id);



      const { error } = await supabase

        .from("users")

        .update({ status: nextStatus })

        .eq("id", member.id);



      if (error) throw error;



      setMembers((prev) =>

        prev.map((m) =>

          m.id === member.id

            ? { ...m, status: nextStatus }

            : m

        )

      );

    } catch (err) {

      alert(err?.message || "Failed to update member.");

    } finally {

      setActionLoading(null);

    }

  }



  function displayName(member) {

    return (

      member.name ||

      member.full_name ||

      member.username ||

      member.email ||

      "Unknown User"

    );

  }



  function getInitial(member) {

    return displayName(member).charAt(0).toUpperCase();

  }



  function formatDate(value) {

    if (!value) return "—";



    const date = new Date(value);



    if (Number.isNaN(date.getTime())) return "—";



    return date.toLocaleDateString("en-IN", {

      day: "2-digit",

      month: "short",

      year: "numeric",

    });

  }



  function walletBalance(member) {

    const value =

      member.wallet_balance ??

      member.balance ??

      member.winning_balance ??

      member.wallet ??

      0;



    const number = Number(value);



    return Number.isFinite(number)

      ? `₹${number.toFixed(2)}`

      : "₹0.00";

  }



  return (

    <AdminShell title="Members">

      <div className="members-page">



        {/* TOP STATS */}

        <div className="stats-grid">

          <StatCard

            icon="👥"

            title="Total Members"

            value={members.length}

            subtitle="Registered users"

          />



          <StatCard

            icon="🟢"

            title="Active Members"

            value={activeCount}

            subtitle="Currently active"

          />



          <StatCard

            icon="🔴"

            title="Blocked"

            value={blockedCount}

            subtitle="Blocked accounts"

          />

        </div>



        {/* TOOLBAR */}

        <div className="toolbar">

          <div className="search-box">

            <span>🔎</span>

            <input

              value={search}

              onChange={(e) => setSearch(e.target.value)}

              placeholder="Search name, email, UID, IGN..."

            />

          </div>



          <select

            value={status}

            onChange={(e) => setStatus(e.target.value)}

          >

            <option value="all">All Members</option>

            <option value="active">Active</option>

            <option value="blocked">Blocked</option>

          </select>



          <button

            className="refresh-btn"

            onClick={loadMembers}

            disabled={loading}

          >

            ↻ Refresh

          </button>

        </div>



        {/* ERROR */}

        {error && (

          <div className="error-box">

            <span>⚠️</span>

            <div>

              <b>Unable to load members</b>

              <p>{error}</p>

            </div>

            <button onClick={loadMembers}>Retry</button>

          </div>

        )}



        {/* TABLE */}

        <div className="members-card">

          <div className="card-head">

            <div>

              <h2>All Members</h2>

              <p>

                {filteredMembers.length} member

                {filteredMembers.length !== 1 ? "s" : ""} found

              </p>

            </div>



            <div className="page-info">

              Page {page} of {totalPages}

            </div>

          </div>



          {loading ? (

            <LoadingTable />

          ) : visibleMembers.length === 0 ? (

            <div className="empty">

              <div>👥</div>

              <h3>No members found</h3>

              <p>

                Try changing your search or filter.

              </p>

            </div>

          ) : (

            <div className="table-wrap">

              <table>

                <thead>

                  <tr>

                    <th>MEMBER</th>

                    <th>UID / IGN</th>

                    <th>EMAIL</th>

                    <th>WALLET</th>

                    <th>JOINED</th>

                    <th>STATUS</th>

                    <th>ACTION</th>

                  </tr>

                </thead>



                <tbody>

                  {visibleMembers.map((member) => {

                    const memberStatus = String(

                      member.status || "active"

                    ).toLowerCase();



                    const isActive = memberStatus === "active";



                    return (

                      <tr
                          key={member.id}
                          className="member-row"
                          onClick={() => openMember(member)}
                        >

                        <td>

                          <div className="member-cell">

                            <div className="avatar">

                              {getInitial(member)}

                            </div>



                            <div>

                              <strong>{displayName(member)}</strong>

                              <small>

                                {member.id

                                  ? String(member.id).slice(0, 12)

                                  : "—"}

                              </small>

                            </div>

                          </div>

                        </td>



                        <td>

                          <div className="uid-cell">

                            <b>

                              {member.uid ||

                                member.game_uid ||

                                "—"}

                            </b>



                            <span>

                              {member.ign ||

                                member.game_name ||

                                "IGN not set"}

                            </span>

                          </div>

                        </td>



                        <td>

                          <span className="email">

                            {member.email || "—"}

                          </span>

                        </td>



                        <td>

                          <b className="wallet">

                            {walletBalance(member)}

                          </b>

                        </td>



                        <td>

                          <span className="date">

                            {formatDate(member.created_at)}

                          </span>

                        </td>



                        <td>

                          <span

                            className={

                              isActive

                                ? "status active"

                                : "status blocked"

                            }

                          >

                            <i />

                            {isActive ? "Active" : "Blocked"}

                          </span>

                        </td>



                        <td>

                          <button

                            className={

                              isActive

                                ? "action danger"

                                : "action success"

                            }

                            onClick={() =>

                              toggleMember(member)

                            }

                            disabled={

                              actionLoading === member.id

                            }

                          >

                            {actionLoading === member.id

                              ? "..."

                              : isActive

                              ? "Block"

                              : "Unblock"}

                          </button>

                        </td>

                      </tr>

                    );

                  })}

                </tbody>

              </table>

            </div>

          )}



          {/* PAGINATION */}

          {!loading && filteredMembers.length > 0 && (

            <div className="pagination">

              <button

                disabled={page <= 1}

                onClick={() =>

                  setPage((p) => Math.max(1, p - 1))

                }

              >

                ← Previous

              </button>



              <div>

                <b>{page}</b>

                <span>/</span>

                {totalPages}

              </div>



              <button

                disabled={page >= totalPages}

                onClick={() =>

                  setPage((p) =>

                    Math.min(totalPages, p + 1)

                  )

                }

              >

                Next →

              </button>

            </div>

          )}

        </div>

      </div>



      <style jsx>{`

        .members-page {

          width: 100%;

        }



        .stats-grid {

          display: grid;

          grid-template-columns: repeat(3, minmax(0, 1fr));

          gap: 14px;

          margin-bottom: 16px;

        }



        .stat-card {

          background: #fff;

          border: 1px solid #e8eaf0;

          border-radius: 14px;

          padding: 16px;

          display: flex;

          align-items: center;

          gap: 13px;

          box-shadow: 0 3px 12px rgba(15, 23, 42, 0.035);

        }



        .stat-icon {

          width: 43px;

          height: 43px;

          border-radius: 12px;

          background: #fff1f4;

          display: grid;

          place-items: center;

          font-size: 21px;

          flex: 0 0 auto;

        }



        .stat-title {

          color: #7b8190;

          font-size: 12px;

          margin-bottom: 3px;

        }



        .stat-value {

          font-size: 22px;

          line-height: 1;

          font-weight: 800;

          color: #171923;

        }



        .stat-sub {

          color: #9aa0ad;

          font-size: 11px;

          margin-top: 4px;

        }



        .toolbar {

          background: #fff;

          border: 1px solid #e8eaf0;

          border-radius: 14px;

          padding: 11px;

          display: flex;

          gap: 10px;

          margin-bottom: 14px;

        }



        .search-box {

          height: 40px;

          flex: 1;

          min-width: 220px;

          display: flex;

          align-items: center;

          gap: 8px;

          padding: 0 12px;

          border: 1px solid #e1e4ea;

          border-radius: 9px;

          background: #fafbfc;

        }



        .search-box span {

          font-size: 14px;

        }



        .search-box input {

          border: 0;

          outline: none;

          background: transparent;

          width: 100%;

          font-size: 13px;

          color: #171923;

        }



        .toolbar select {

          height: 40px;

          min-width: 145px;

          border: 1px solid #e1e4ea;

          border-radius: 9px;

          padding: 0 10px;

          background: #fff;

          color: #343844;

          outline: none;

        }



        .refresh-btn {

          height: 40px;

          padding: 0 15px;

          border: 0;

          border-radius: 9px;

          background: #171923;

          color: #fff;

          font-weight: 700;

          cursor: pointer;

        }



        .refresh-btn:disabled {

          opacity: 0.55;

          cursor: default;

        }



        .error-box {

          background: #fff5f5;

          border: 1px solid #ffd4d4;

          color: #991b1b;

          border-radius: 12px;

          padding: 12px 14px;

          margin-bottom: 14px;

          display: flex;

          align-items: center;

          gap: 10px;

        }



        .error-box div {

          flex: 1;

        }



        .error-box b {

          font-size: 13px;

        }



        .error-box p {

          margin: 2px 0 0;

          font-size: 12px;

        }



        .error-box button {

          border: 0;

          background: #991b1b;

          color: white;

          border-radius: 7px;

          padding: 7px 12px;

          cursor: pointer;

        }



        .members-card {

          background: #fff;

          border: 1px solid #e8eaf0;

          border-radius: 14px;

          overflow: hidden;

          box-shadow: 0 3px 12px rgba(15, 23, 42, 0.035);

        }



        .card-head {

          min-height: 64px;

          padding: 12px 16px;

          display: flex;

          align-items: center;

          justify-content: space-between;

          border-bottom: 1px solid #eef0f4;

        }



        .card-head h2 {

          margin: 0;

          font-size: 16px;

          color: #171923;

        }



        .card-head p {

          margin: 3px 0 0;

          font-size: 11px;

          color: #9298a5;

        }



        .page-info {

          font-size: 12px;

          color: #777d89;

        }



        .table-wrap {

          width: 100%;

          overflow-x: auto;

        }



        table {

          width: 100%;

          border-collapse: collapse;

          min-width: 950px;

        }



        th {

          text-align: left;

          background: #fafbfc;

          color: #8a909d;

          font-size: 10px;

          letter-spacing: 0.04em;

          padding: 11px 14px;

          border-bottom: 1px solid #eef0f4;

          white-space: nowrap;

        }



        td {

          padding: 11px 14px;

          border-bottom: 1px solid #f0f1f4;

          color: #363a45;

          font-size: 12px;

          vertical-align: middle;

        }



        tbody tr:hover {

          background: #fcfcfd;

        }



        .member-cell {

          display: flex;

          align-items: center;

          gap: 9px;

          min-width: 170px;

        }



        .avatar {

          width: 34px;

          height: 34px;

          border-radius: 10px;

          background: #fff1f4;

          color: #ff174f;

          display: grid;

          place-items: center;

          font-weight: 800;

          font-size: 13px;

          flex: 0 0 auto;

        }



        .member-cell strong {

          display: block;

          color: #20232d;

          font-size: 12px;

          max-width: 170px;

          overflow: hidden;

          text-overflow: ellipsis;

          white-space: nowrap;

        }



        .member-cell small {

          display: block;

          margin-top: 2px;

          color: #a0a5af;

          font-size: 9px;

        }



        .uid-cell b {

          display: block;

          color: #282c36;

          font-size: 11px;

        }



        .uid-cell span {

          display: block;

          color: #9298a5;

          margin-top: 2px;

          font-size: 10px;

        }



        .email {

          color: #646a76;

          font-size: 11px;

        }



        .wallet {

          color: #111827;

          font-size: 12px;

        }



        .date {

          color: #737985;

          white-space: nowrap;

          font-size: 11px;

        }



        .status {

          display: inline-flex;

          align-items: center;

          gap: 5px;

          border-radius: 999px;

          padding: 5px 8px;

          font-size: 10px;

          font-weight: 700;

          white-space: nowrap;

        }



        .status i {

          width: 6px;

          height: 6px;

          border-radius: 50%;

          display: block;

        }



        .status.active {

          color: #15803d;

          background: #ecfdf3;

        }



        .status.active i {

          background: #22c55e;

        }



        .status.blocked {

          color: #b91c1c;

          background: #fef2f2;

        }



        .status.blocked i {

          background: #ef4444;

        }



        .action {

          border: 0;

          border-radius: 7px;

          padding: 6px 10px;

          font-size: 10px;

          font-weight: 700;

          cursor: pointer;

        }



        .action.danger {

          color: #dc2626;

          background: #fff1f2;

        }



        .action.success {

          color: #15803d;

          background: #ecfdf3;

        }



        .action:disabled {

          opacity: 0.5;

          cursor: default;

        }



        .empty {

          padding: 65px 20px;

          text-align: center;

        }



        .empty > div {

          font-size: 35px;

          margin-bottom: 8px;

        }



        .empty h3 {

          margin: 0;

          font-size: 15px;

          color: #272a33;

        }



        .empty p {

          margin: 5px 0 0;

          color: #969ba7;

          font-size: 12px;

        }



        .pagination {

          padding: 11px 14px;

          border-top: 1px solid #eef0f4;

          display: flex;

          align-items: center;

          justify-content: center;

          gap: 14px;

        }



        .pagination button {

          border: 1px solid #e1e4ea;

          background: #fff;

          color: #4b505c;

          border-radius: 7px;

          padding: 7px 11px;

          font-size: 11px;

          cursor: pointer;

        }



        .pagination button:disabled {

          opacity: 0.4;

          cursor: default;

        }



        .pagination div {

          display: flex;

          gap: 6px;

          align-items: center;

          color: #858b97;

          font-size: 11px;

        }



        .pagination b {

          color: #171923;

        }



        @media (max-width: 800px) {

          .stats-grid {

            grid-template-columns: 1fr;

          }



          .toolbar {

            flex-wrap: wrap;

          }



          .search-box {

            min-width: 100%;

          }



          .toolbar select,

          .refresh-btn {

            flex: 1;

          }

        }

      `}</style>

      {selectedMember && <MemberDetailModal member={memberDetail||selectedMember} transactions={transactions} referrals={referrals} referrer={referrer} loginHistory={loginHistory} wallet={wallet} loading={modalLoading} error={modalError} walletAmount={walletAmount} setWalletAmount={setWalletAmount} walletReason={walletReason} setWalletReason={setWalletReason} walletAction={walletAction} setWalletAction={setWalletAction} walletType={walletType} setWalletType={setWalletType} walletSaving={walletSaving} onWalletChange={onWalletChange} onRefresh={refreshMember} onClose={()=>setSelectedMember(null)} onToggleStatus={onModalToggleStatus} displayName={displayName} formatDate={formatDate} walletBalance={walletBalance} getInitial={getInitial} />}

    </AdminShell>

  );

}



function StatCard({ icon, title, value, subtitle }) {

  return (

    <div className="stat-card">

      <div className="stat-icon">{icon}</div>



      <div>

        <div className="stat-title">{title}</div>

        <div className="stat-value">{value}</div>

        <div className="stat-sub">{subtitle}</div>

      </div>

    </div>

  );

}



function LoadingTable() {

  return (

    <div style={{ padding: "12px 14px" }}>

      {Array.from({ length: 7 }).map((_, index) => (

        <div

          key={index}

          style={{

            height: 52,

            borderBottom: "1px solid #f0f1f4",

            display: "flex",

            alignItems: "center",

            gap: 12,

          }}

        >

          <div

            style={{

              width: 34,

              height: 34,

              borderRadius: 10,

              background: "#f1f2f5",

            }}

          />



          <div

            style={{

              width: `${180 + (index % 3) * 45}px`,

              height: 10,

              borderRadius: 5,

              background: "#f1f2f5",

            }}

          />

        </div>

      ))}

    </div>

  );

}

function MemberDetailModal({
  member,
  transactions,
  referrals,
  referrer,
  loginHistory,
  wallet,
  loading,
  error,
  walletAmount,
  setWalletAmount,
  walletReason,
  setWalletReason,
  walletAction,
  setWalletAction,
  walletType,
  setWalletType,
  walletSaving,
  onWalletChange,
  onRefresh,
  onClose,
  onToggleStatus,
  displayName,
  formatDate,
  walletBalance,
  getInitial,
}) {
  const status = String(member.status || "active").toLowerCase();
  const isActive = status === "active";
  const createdAt = member.created_at
    ? new Date(member.created_at).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const ip =
    member.ip_address ??
    member.last_ip ??
    member.ip ??
    "Not available";

  const fcm =
    member.fcm_token ??
    member.fcmToken ??
    member.push_token ??
    "Not available";

  const phone =
    member.phone ??
    member.phone_number ??
    member.mobile ??
    "Not available";

  const gameUid =
    member.uid ??
    member.game_uid ??
    member.freefire_uid ??
    "Not set";

  const ign =
    member.ign ??
    member.game_name ??
    member.gameName ??
    "Not set";

  const referralCode =
    member.referral_code ??
    member.referralCode ??
    "Not set";

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="member-modal">
        <div className="modal-header">
          <div className="modal-profile">
            <div className="modal-avatar">
              {getInitial(member)}
            </div>
            <div>
              <h2>{displayName(member)}</h2>
              <p>
                ID: {member.id || "—"} · Joined {formatDate(member.created_at)}
              </p>
            </div>
          </div>

          <div className="modal-head-actions">
            <button className="icon-btn" onClick={onRefresh} title="Refresh">
              ↻
            </button>
            <button className="close-btn" onClick={onClose}>
              ×
            </button>
          </div>
        </div>

        <div className="modal-body">
          {error && (
            <div className="modal-error">
              ⚠️ {error}
            </div>
          )}

          <div className="detail-grid">
            <DetailItem icon="📱" label="Mobile Number" value={phone} copy />
            <DetailItem icon="📧" label="Email" value={member.email || "Not available"} copy />
            <DetailItem icon="🎮" label="Game UID" value={gameUid} copy />
            <DetailItem icon="👤" label="IGN" value={ign} />
            <DetailItem icon="🌐" label="Last IP" value={ip} copy />
            <DetailItem icon="🔔" label="FCM Token" value={fcm} copy wide />
            <DetailItem icon="🕐" label="Created At" value={createdAt} wide />
            <DetailItem icon="🎁" label="Referral Code" value={referralCode} copy />
          </div>

          <div className="wallet-panel">
            <div className="wallet-top">
              <div>
                <span>WALLET BALANCE</span>
                <strong>₹{(Number(wallet?.deposit_balance||0)+Number(wallet?.bonus_balance||0)+Number(wallet?.winning_balance||0)).toFixed(2)}</strong><div className="wallet-breakdown"><span>Deposit ₹{Number(wallet?.deposit_balance||0).toFixed(2)}</span><span>Bonus ₹{Number(wallet?.bonus_balance||0).toFixed(2)}</span><span>Winning ₹{Number(wallet?.winning_balance||0).toFixed(2)}</span></div>
              </div>
              <div className={isActive ? "modal-status active" : "modal-status blocked"}>
                <i />
                {isActive ? "Active" : "Blocked"}
              </div>
            </div>

            <div className="wallet-controls">
              <div className="wallet-toggle">
                <button
                  className={walletAction === "add" ? "selected add" : ""}
                  onClick={() => setWalletAction("add")}
                  type="button"
                >
                  + Add
                </button>
                <button
                  className={walletAction === "deduct" ? "selected deduct" : ""}
                  onClick={() => setWalletAction("deduct")}
                  type="button"
                >
                  − Deduct
                </button>
              </div>

              <select className="wallet-input" value={walletType} onChange={e=>setWalletType(e.target.value)}><option value="winning">Winning</option><option value="deposit">Deposit</option><option value="bonus">Bonus</option></select>

              <input
                className="wallet-input"
                type="number"
                min="0"
                step="0.01"
                value={walletAmount}
                onChange={(e) => setWalletAmount(e.target.value)}
                placeholder="Amount ₹"
              />

              <input
                className="reason-input"
                value={walletReason}
                onChange={(e) => setWalletReason(e.target.value)}
                placeholder="Reason (required)"
              />

              <button
                className={
                  walletAction === "add"
                    ? "wallet-submit add"
                    : "wallet-submit deduct"
                }
                onClick={onWalletChange}
                disabled={walletSaving}
              >
                {walletSaving
                  ? "Updating..."
                  : walletAction === "add"
                  ? "Add Balance"
                  : "Deduct Balance"}
              </button>
            </div>

            <small>
              Every manual balance change should have a clear reason for audit.
            </small>
          </div>

          <div className="modal-columns">
            <section className="mini-section">
              <div className="section-title">
                <div>
                  <h3>Recent Transactions</h3>
                  <span>Latest 8 wallet records</span>
                </div>
              </div>

              {loading ? (
                <div className="mini-loading">Loading...</div>
              ) : transactions.length === 0 ? (
                <div className="mini-empty">
                  🧾
                  <span>No transactions found</span>
                </div>
              ) : (
                <div className="transaction-list">
                  {transactions.map((tx, index) => {
                    const amount = Number(
                      tx.amount ??
                      tx.value ??
                      tx.amount_inr ??
                      0
                    );

                    const positive =
                      amount > 0 ||
                      ["credit", "deposit", "admin_credit", "bonus", "winning"]
                        .includes(String(tx.type || "").toLowerCase());

                    return (
                      <div className="transaction-row" key={tx.id || index}>
                        <div className="tx-icon">
                          {positive ? "↗" : "↘"}
                        </div>

                        <div className="tx-main">
                          <b>
                            {tx.description ||
                              tx.title ||
                              tx.type ||
                              "Wallet transaction"}
                          </b>
                          <span>
                            {tx.created_at
                              ? new Date(tx.created_at).toLocaleString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </span>
                        </div>

                        <strong className={positive ? "credit" : "debit"}>
                          {positive ? "+" : "-"}₹
                          {Math.abs(amount).toFixed(2)}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="mini-section">
              <div className="section-title">
                <div>
                  <h3>Referrals</h3>
                  <span>{referrals.length} referred member(s)</span>
                </div>
              </div>

              {loading ? (
                <div className="mini-loading">Loading...</div>
              ) : referrals.length === 0 ? (
                <div className="mini-empty">
                  🎁
                  <span>No referrals found</span>
                </div>
              ) : (
                <div className="referral-list">
                  {referrals.map((ref, index) => (
                    <div className="referral-row" key={ref.id || index}>
                      <div className="ref-avatar">
                        {getInitial(ref)}
                      </div>
                      <div>
                        <b>{displayName(ref)}</b>
                        <span>
                          {ref.email || ref.uid || "Member"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="extra-detail-panels"><section className="mini-section"><div className="section-title"><h3>Referral Details</h3><span>{referrals.length} referred member(s)</span></div><div className="extra-detail-body"><b>Referral Code: {member.referral_code||"Not set"}</b><span>Referred By: {referrer?.full_name||referrer?.email||member.referred_by||"None"}</span></div></section><section className="mini-section"><div className="section-title"><h3>Login / Device History</h3><span>{loginHistory.length} records</span></div><div className="login-history-list">{loginHistory.slice(0,8).map((x,i)=><div className="login-history-row" key={x.id||i}><b>{x.ip_address||"IP unavailable"}</b><span>{x.device_id||x.user_agent||"Device unavailable"}</span><small>{x.created_at?new Date(x.created_at).toLocaleString("en-IN"):"—"}</small></div>)}{!loginHistory.length&&<div className="mini-empty">No login history found</div>}</div></section></div>
          <RestrictionManager member={member}/>

          <div className="modal-footer">
            <div className="account-meta">
              <span>Account created</span>
              <b>{createdAt}</b>
            </div>

            <button
              className={isActive ? "modal-block" : "modal-unblock"}
              onClick={onToggleStatus}
            >
              {isActive ? "🚫 Block Member" : "✓ Unblock Member"}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(5px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 22px;
        }

        .member-modal {
          width: min(1080px, 100%);
          max-height: calc(100vh - 44px);
          overflow: auto;
          background: #fff;
          border-radius: 20px;
          box-shadow: 0 25px 80px rgba(15, 23, 42, 0.25);
        }

        .modal-header {
          position: sticky;
          top: 0;
          z-index: 2;
          background: rgba(255,255,255,.96);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid #edf0f4;
          padding: 16px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .modal-profile {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .modal-avatar {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          background: #fff1f4;
          color: #ff174f;
          display: grid;
          place-items: center;
          font-size: 18px;
          font-weight: 900;
        }

        .modal-profile h2 {
          margin: 0;
          font-size: 18px;
          color: #171923;
        }

        .modal-profile p {
          margin: 4px 0 0;
          color: #8c929e;
          font-size: 10px;
          max-width: 650px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .modal-head-actions {
          display: flex;
          gap: 7px;
        }

        .icon-btn,
        .close-btn {
          width: 34px;
          height: 34px;
          border: 1px solid #e5e7eb;
          background: #fff;
          border-radius: 9px;
          cursor: pointer;
          font-size: 16px;
        }

        .close-btn {
          font-size: 22px;
          line-height: 1;
        }

        .modal-body {
          padding: 16px;
        }

        .modal-error {
          background: #fff5f5;
          border: 1px solid #fecaca;
          color: #991b1b;
          border-radius: 10px;
          padding: 10px 12px;
          margin-bottom: 13px;
          font-size: 11px;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 9px;
        }

        .detail-item {
          border: 1px solid #edf0f4;
          border-radius: 11px;
          padding: 10px;
          background: #fbfcfd;
          min-width: 0;
        }

        .detail-item.wide {
          grid-column: span 2;
        }

        .detail-label {
          display: flex;
          gap: 6px;
          align-items: center;
          color: #9298a5;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: .04em;
          margin-bottom: 5px;
        }

        .detail-value {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          color: #242833;
          font-size: 11px;
          font-weight: 700;
        }

        .detail-value span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .copy-btn {
          border: 0;
          background: #eef2f7;
          color: #525866;
          border-radius: 5px;
          padding: 3px 5px;
          font-size: 9px;
          cursor: pointer;
          flex: 0 0 auto;
        }

        .wallet-panel {
          margin-top: 12px;
          padding: 14px;
          border-radius: 14px;
          background: linear-gradient(135deg, #171923, #252938);
          color: white;
        }

        .wallet-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .wallet-top span {
          display: block;
          color: #9da3b0;
          font-size: 9px;
          letter-spacing: .06em;
        }

        .wallet-top strong {
          display: block;
          margin-top: 2px;
          font-size: 25px;
        }

        .modal-status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 9px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 800;
        }

        .modal-status i {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .modal-status.active {
          color: #86efac;
          background: rgba(34,197,94,.12);
        }

        .modal-status.active i {
          background: #22c55e;
        }

        .modal-status.blocked {
          color: #fca5a5;
          background: rgba(239,68,68,.12);
        }

        .modal-status.blocked i {
          background: #ef4444;
        }

        .wallet-controls {
          display: grid;
          grid-template-columns: auto 130px minmax(180px, 1fr) auto;
          gap: 8px;
        }

        .wallet-toggle {
          display: flex;
          background: #303342;
          padding: 3px;
          border-radius: 8px;
        }

        .wallet-toggle button {
          border: 0;
          background: transparent;
          color: #bfc4ce;
          border-radius: 6px;
          padding: 7px 9px;
          font-size: 10px;
          font-weight: 800;
          cursor: pointer;
        }

        .wallet-toggle button.selected.add {
          background: #16a34a;
          color: white;
        }

        .wallet-toggle button.selected.deduct {
          background: #dc2626;
          color: white;
        }

        .wallet-input,
        .reason-input {
          border: 1px solid #3a3d4c;
          background: #2a2d39;
          color: white;
          outline: none;
          border-radius: 8px;
          padding: 0 10px;
          min-width: 0;
          font-size: 11px;
        }

        .wallet-input::placeholder,
        .reason-input::placeholder {
          color: #7f8491;
        }

        .wallet-submit {
          border: 0;
          border-radius: 8px;
          padding: 0 14px;
          color: white;
          font-size: 10px;
          font-weight: 800;
          cursor: pointer;
        }

        .wallet-submit.add {
          background: #16a34a;
        }

        .wallet-submit.deduct {
          background: #dc2626;
        }

        .wallet-submit:disabled {
          opacity: .5;
        }

        .wallet-panel > small {
          display: block;
          color: #777d8b;
          margin-top: 8px;
          font-size: 9px;
        }

        .modal-columns {
          display: grid;
          grid-template-columns: 1.2fr .8fr;
          gap: 12px;
          margin-top: 12px;
        }

        .mini-section {
          border: 1px solid #edf0f4;
          border-radius: 13px;
          overflow: hidden;
        }

        .section-title {
          padding: 11px 12px;
          border-bottom: 1px solid #edf0f4;
          background: #fbfcfd;
        }

        .section-title h3 {
          margin: 0;
          font-size: 12px;
          color: #252934;
        }

        .section-title span {
          display: block;
          margin-top: 2px;
          font-size: 9px;
          color: #969ca8;
        }

        .mini-loading,
        .mini-empty {
          min-height: 115px;
          display: grid;
          place-items: center;
          color: #969ca8;
          font-size: 10px;
          gap: 4px;
        }

        .transaction-row {
          min-height: 54px;
          padding: 8px 10px;
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid #f1f2f4;
        }

        .transaction-row:last-child {
          border-bottom: 0;
        }

        .tx-icon {
          width: 29px;
          height: 29px;
          border-radius: 8px;
          background: #f3f4f6;
          display: grid;
          place-items: center;
          font-weight: 900;
        }

        .tx-main {
          flex: 1;
          min-width: 0;
        }

        .tx-main b {
          display: block;
          color: #333741;
          font-size: 10px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .tx-main span {
          display: block;
          margin-top: 2px;
          color: #a0a5af;
          font-size: 8px;
        }

        .transaction-row > strong {
          font-size: 11px;
        }

        .credit {
          color: #16a34a;
        }

        .debit {
          color: #dc2626;
        }

        .referral-row {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 9px 10px;
          border-bottom: 1px solid #f1f2f4;
        }

        .referral-row:last-child {
          border-bottom: 0;
        }

        .ref-avatar {
          width: 29px;
          height: 29px;
          border-radius: 8px;
          background: #fff1f4;
          color: #ff174f;
          display: grid;
          place-items: center;
          font-size: 10px;
          font-weight: 800;
        }

        .referral-row b {
          display: block;
          font-size: 10px;
          color: #333741;
        }

        .referral-row span {
          display: block;
          margin-top: 2px;
          font-size: 8px;
          color: #969ca8;
        }

        .modal-footer {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #edf0f4;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .account-meta span {
          display: block;
          color: #9aa0ab;
          font-size: 9px;
        }

        .account-meta b {
          display: block;
          color: #424752;
          font-size: 10px;
          margin-top: 2px;
        }

        .modal-block,
        .modal-unblock {
          border: 0;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 10px;
          font-weight: 800;
          cursor: pointer;
        }

        .modal-block {
          color: #dc2626;
          background: #fff1f2;
        }

        .modal-unblock {
          color: #15803d;
          background: #ecfdf3;
        }

.wallet-breakdown{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.wallet-breakdown span{font-size:8px;background:#303342;color:#c4c8d1;padding:4px 6px;border-radius:6px}.extra-detail-panels{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.extra-detail-body{padding:12px;display:flex;flex-direction:column;gap:6px;font-size:10px;color:#555b67}.login-history-list{max-height:180px;overflow:auto}.login-history-row{padding:8px 10px;border-bottom:1px solid #f1f2f4;display:flex;flex-direction:column;gap:2px}.login-history-row b{font-size:10px}.login-history-row span,.login-history-row small{font-size:8px;color:#969ca8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.restriction-manager{margin-top:12px;border:1px solid #edf0f4;border-radius:13px;overflow:hidden}.restriction-head{padding:12px;background:#fbfcfd;border-bottom:1px solid #edf0f4}.restriction-head h3{margin:0;font-size:13px}.restriction-form{padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px}.restriction-form select,.restriction-form input{height:36px;border:1px solid #e1e4ea;border-radius:8px;padding:0 9px;font-size:10px}.restriction-form .full{grid-column:1/-1}.restriction-save{height:36px;border:0;border-radius:8px;background:#ff174f;color:#fff;font-weight:800}.restriction-list{border-top:1px solid #edf0f4}.restriction-row{padding:9px 12px;display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #f1f2f4}.restriction-row b{font-size:10px}.restriction-row span{display:block;font-size:8px;color:#969ca8;margin-top:2px}.restriction-remove{border:0;border-radius:7px;padding:6px 9px;background:#fff1f2;color:#dc2626;font-size:9px;font-weight:800}.restriction-error{padding:8px 12px;color:#b91c1c;background:#fff5f5;font-size:9px}
        @media (max-width: 900px) {
          .detail-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .wallet-controls {
            grid-template-columns: 1fr 1fr;
          }

          .reason-input {
            height: 38px;
          }

          .wallet-submit {
            height: 38px;
          }
        }

        @media (max-width: 650px) {
          .modal-backdrop {
            padding: 8px;
          }

          .member-modal {
            max-height: calc(100vh - 16px);
            border-radius: 15px;
          }

          .detail-grid,
          .modal-columns {
            grid-template-columns: 1fr;
          }

          .detail-item.wide {
            grid-column: auto;
          }

          .wallet-controls {
            grid-template-columns: 1fr;
          }

          .wallet-toggle {
            width: 100%;
          }

          .wallet-toggle button {
            flex: 1;
          }

          .modal-profile p {
            max-width: 220px;
          }
        }
      `}</style>
    </div>
  );
}

function RestrictionManager({member}){const F=[["full_app","Full App"],["support","Support"],["freefire","Free Fire"],["freefiremax","Free Fire MAX"],["clashsquad","Clash Squad"],["lonewolf","Lone Wolf"],["spin","Spin"],["scratch_card","Scratch Card"],["withdrawal","Withdrawal"],["deposit","Add Money"]],G=[["freefire","Free Fire"],["freefiremax","Free Fire MAX"],["clashsquad","Clash Squad"],["lonewolf","Lone Wolf"]];const[rs,setRs]=useState([]),[ls,setLs]=useState([]),[f,setF]=useState("full_app"),[d,setD]=useState("24h"),[c,setC]=useState(""),[p,setP]=useState(false),[rr,setR]=useState(""),[g,setG]=useState("freefire"),[n,setN]=useState("1"),[ld,setLD]=useState("24h"),[lp,setLP]=useState(false),[lr,setLR]=useState(""),[saving,setSaving]=useState(false),[err,setErr]=useState("");async function load(){const[a,b]=await Promise.all([supabase.from("user_restrictions").select("*").eq("user_id",member.id).eq("is_active",true).order("created_at",{ascending:false}),supabase.from("user_game_limits").select("*").eq("user_id",member.id).eq("is_active",true).order("created_at",{ascending:false})]);if(a.error||b.error)throw(a.error||b.error);setRs(a.data||[]);setLs(b.data||[])}useEffect(()=>{load().catch(e=>setErr(e.message))},[member.id]);const ex=(x,z,q)=>q?null:x==="custom"?(z?new Date(z).toISOString():null):new Date(Date.now()+(x==="24h"?24:x==="7d"?168:720)*36e5).toISOString();async function saveR(){if(!p&&d==="custom"&&!c)return setErr("Select custom expiry.");setSaving(true);setErr("");try{const e=ex(d,c,p),{data:o}=await supabase.from("user_restrictions").select("id").eq("user_id",member.id).eq("feature",f).eq("is_active",true).maybeSingle(),v={user_id:member.id,feature:f,expires_at:e,is_permanent:p,is_active:true,reason:rr.trim()||null},q=o?.id?await supabase.from("user_restrictions").update(v).eq("id",o.id):await supabase.from("user_restrictions").insert(v);if(q.error)throw q.error;setR("");await load()}catch(e){setErr(e.message)}finally{setSaving(false)}}async function saveL(){const x=Number(n);if(!Number.isInteger(x)||x<0)return setErr("Daily limit must be valid.");setSaving(true);setErr("");try{const e=ex(ld,"",lp),{data:o}=await supabase.from("user_game_limits").select("id").eq("user_id",member.id).eq("game",g).eq("is_active",true).maybeSingle(),v={user_id:member.id,game:g,daily_limit:x,expires_at:e,is_permanent:lp,is_active:true,reason:lr.trim()||null},q=o?.id?await supabase.from("user_game_limits").update(v).eq("id",o.id):await supabase.from("user_game_limits").insert(v);if(q.error)throw q.error;setLR("");await load()}catch(e){setErr(e.message)}finally{setSaving(false)}}async function rm(t,id){const{error:e}=await supabase.from(t).update({is_active:false,updated_at:new Date().toISOString()}).eq("id",id);if(e)setErr(e.message);else load()}return <div className="restriction-manager"><div className="restriction-head"><h3>🔒 Restriction Control</h3></div>{err&&<div className="restriction-error">⚠️ {err}</div>}<div className="restriction-form"><select value={f} onChange={e=>setF(e.target.value)}>{F.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select><select value={d} onChange={e=>setD(e.target.value)} disabled={p}><option value="24h">24 Hours</option><option value="7d">7 Days</option><option value="30d">30 Days</option><option value="custom">Custom</option></select>{d==="custom"&&!p&&<input type="datetime-local" value={c} onChange={e=>setC(e.target.value)}/>}<input className="full" value={rr} onChange={e=>setR(e.target.value)} placeholder="Restriction reason"/><label><input type="checkbox" checked={p} onChange={e=>setP(e.target.checked)}/> Permanent</label><button className="restriction-save" onClick={saveR} disabled={saving}>Add / Update Restriction</button></div><div className="restriction-form"><select value={g} onChange={e=>setG(e.target.value)}>{G.map(x=><option key={x[0]} value={x[0]}>{x[1]}</option>)}</select><input type="number" min="0" value={n} onChange={e=>setN(e.target.value)} placeholder="Daily join limit"/><select value={ld} onChange={e=>setLD(e.target.value)} disabled={lp}><option value="24h">24 Hours</option><option value="7d">7 Days</option><option value="30d">30 Days</option></select><input className="full" value={lr} onChange={e=>setLR(e.target.value)} placeholder="Daily limit reason"/><label><input type="checkbox" checked={lp} onChange={e=>setLP(e.target.checked)}/> Permanent limit</label><button className="restriction-save" onClick={saveL} disabled={saving}>Set Daily Game Limit</button></div><div className="restriction-list">{rs.map(x=><div className="restriction-row" key={x.id}><div><b>{F.find(y=>y[0]===x.feature)?.[1]||x.feature}</b><span>{x.is_permanent?"Permanent":x.expires_at?`Until ${new Date(x.expires_at).toLocaleString("en-IN")}`:"Active"} · {x.reason||"No reason"}</span></div><button className="restriction-remove" onClick={()=>rm("user_restrictions",x.id)}>Remove</button></div>)}{ls.map(x=><div className="restriction-row" key={x.id}><div><b>{G.find(y=>y[0]===x.game)?.[1]||x.game} — {x.daily_limit}/day</b><span>{x.is_permanent?"Permanent":x.expires_at?`Until ${new Date(x.expires_at).toLocaleString("en-IN")}`:"Active"} · {x.reason||"No reason"}</span></div><button className="restriction-remove" onClick={()=>rm("user_game_limits",x.id)}>Remove</button></div>)}</div></div>}

function DetailItem({ icon, label, value, copy = false, wide = false }) {
  function copyValue() {
    if (!value || value === "—" || value === "Not available") return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(String(value)).catch(() => {});
    }
  }

  return (
    <div className={`detail-item ${wide ? "wide" : ""}`}>
      <div className="detail-label">
        <span>{icon}</span>
        {label}
      </div>

      <div className="detail-value">
        <span title={String(value)}>{value}</span>

        {copy && value && value !== "—" && value !== "Not available" && (
          <button
            type="button"
            className="copy-btn"
            onClick={copyValue}
          >
            Copy
          </button>
        )}
      </div>
    </div>
  );
}
