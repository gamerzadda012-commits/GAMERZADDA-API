"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "../AdminShell";
import { supabase } from "../../../lib/supabase.js";

const PAGE_SIZE = 20;

function pick(obj, keys, fallback = "") {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj?.[key] !== null && String(obj[key]).trim() !== "") {
      return obj[key];
    }
  }
  return fallback;
}

function displayName(member) {
  return pick(member, ["name", "full_name", "username", "email"], "—");
}

function getInitial(member) {
  return displayName(member).charAt(0).toUpperCase() || "U";
}

function profileImage(member) {
  return pick(member, [
    "profile_pic",
    "profile_picture",
    "profile_image",
    "avatar_url",
    "photo_url",
    "image_url",
    "avatar",
    "photo",
    "picture",
    "profile_url",
    "avatarUrl",
    "photoUrl",
    "profileUrl"
  ], "");
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function walletNumber(member) {
  // The members API calculates this from wallet_balances:
  // deposit_balance + bonus_balance + winning_balance.
  const n = Number(
    pick(member, ["wallet_total", "wallet_balance", "balance"], 0)
  );
  return Number.isFinite(n) ? n : 0;
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `₹${n.toFixed(2)}` : "₹0.00";
}

function safeText(value) {
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
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
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [walletAction, setWalletAction] = useState("add");
  const [walletType, setWalletType] = useState("bonus");
  const [walletBalances, setWalletBalances] = useState({ bonus_balance: 0, deposit_balance: 0, winning_balance: 0 });
  const [walletAmount, setWalletAmount] = useState("");
  const [walletReason, setWalletReason] = useState("");
  const [walletSaving, setWalletSaving] = useState(false);

  async function getAdminHeaders() {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function loadMembers() {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/admin/members", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        headers: await getAdminHeaders(),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || `Members API failed (${response.status})`);
      setMembers(result.members || []);
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
      const memberStatus = String(member.status || "").toLowerCase();

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
        member.game_name,
        member.phone,
        member.phone_number,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
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
    (m) => String(m.status || "").toLowerCase() === "active"
  ).length;

  const blockedCount = members.filter((m) =>
    ["blocked", "banned", "suspended"].includes(
      String(m.status || "").toLowerCase()
    )
  ).length;

  async function toggleMember(member) {
    const current = String(member.status || "").toLowerCase();
    if (!current) {
      window.alert("This member has no status value in the database.");
      return;
    }
    const nextStatus = current === "active" ? "blocked" : "active";

    if (
      !window.confirm(
        nextStatus === "blocked"
          ? `Block ${displayName(member)}?`
          : `Unblock ${displayName(member)}?`
      )
    ) {
      return;
    }

    try {
      setActionLoading(member.id);

      const { error: updateError } = await supabase
        .from("users")
        .update({ status: nextStatus })
        .eq("id", member.id);

      if (updateError) throw updateError;

      setMembers((prev) =>
        prev.map((m) =>
          m.id === member.id ? { ...m, status: nextStatus } : m
        )
      );

      setSelectedMember((prev) =>
        prev?.id === member.id ? { ...prev, status: nextStatus } : prev
      );
    } catch (err) {
      window.alert(err?.message || "Failed to update member.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleOpenMember(member) {
    setSelectedMember(member);
    setDetailLoading(true);
    setDetailError("");
    setTransactions([]);
    setReferrals([]);
    setWalletAmount("");
    setWalletReason("");
    setWalletAction("add");
    setWalletType("bonus");
    setWalletBalances({ bonus_balance: 0, deposit_balance: 0, winning_balance: 0 });

    try {
      const response = await fetch(`/api/admin/members?userId=${encodeURIComponent(member.id)}`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        headers: await getAdminHeaders(),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || `Member details failed (${response.status})`);
      }

      const wallet = result.wallet || {};
      setWalletBalances({
        bonus_balance: Number(wallet.bonus_balance || 0),
        deposit_balance: Number(wallet.deposit_balance || 0),
        winning_balance: Number(wallet.winning_balance || 0),
      });
      setTransactions(Array.isArray(result.history) ? result.history : []);
      setReferrals(Array.isArray(result.referral?.users) ? result.referral.users : []);
    } catch (err) {
      console.error("Member details load error:", err);
      setDetailError(err?.message || "Unable to load member details.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function changeWallet() {
    if (!selectedMember) return;

    const amount = Number(walletAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      window.alert("Enter a valid amount.");
      return;
    }

    const column =
      walletType === "deposit"
        ? "deposit_balance"
        : walletType === "winning"
        ? "winning_balance"
        : "bonus_balance";

    const current = Number(walletBalances[column] || 0);
    const next = walletAction === "add" ? current + amount : current - amount;

    if (next < 0) {
      window.alert(`${walletType.toUpperCase()} balance cannot go below ₹0.`);
      return;
    }

    try {
      setWalletSaving(true);

      const response = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(await getAdminHeaders()),
        },
        credentials: "include",
        body: JSON.stringify({ userId: selectedMember.id, walletType, action: walletAction, amount, reason: walletReason.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || `Wallet update failed (${response.status})`);
      const updatedBalances = result.wallet;
      setWalletBalances({
        bonus_balance: Number(updatedBalances.bonus_balance || 0),
        deposit_balance: Number(updatedBalances.deposit_balance || 0),
        winning_balance: Number(updatedBalances.winning_balance || 0),
      });

      const total =
        Number(updatedBalances.bonus_balance || 0) +
        Number(updatedBalances.deposit_balance || 0) +
        Number(updatedBalances.winning_balance || 0);
      const updatedMember = { ...selectedMember, wallet_balance: total };
      setSelectedMember(updatedMember);
      setMembers((prev) =>
        prev.map((m) => (m.id === updatedMember.id ? { ...m, wallet_balance: total } : m))
      );


      setWalletAmount("");
      setWalletReason("");
      window.alert(
        `${walletType.charAt(0).toUpperCase() + walletType.slice(1)} balance ${walletAction === "add" ? "added" : "deducted"} successfully.`
      );

      await handleOpenMember(updatedMember);
    } catch (err) {
      window.alert(err?.message || "Wallet update failed.");
    } finally {
      setWalletSaving(false);
    }
  }

  async function copyValue(value, label) {
    if (!value || value === "—") return;
    try {
      await navigator.clipboard.writeText(String(value));
      window.alert(`${label} copied.`);
    } catch {
      window.prompt(`Copy ${label}:`, String(value));
    }
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
          <div className="search-box">
            <span>🔎</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, UID, IGN..."
            />
          </div>

          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All Members</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
          </select>

          <button
            className="refresh-btn"
            onClick={loadMembers}
            disabled={loading}
            type="button"
          >
            {loading ? "Loading..." : "↻ Refresh"}
          </button>
        </div>

        {error && (
          <div className="error-box">
            <span>⚠️</span>
            <div>
              <b>Unable to load members</b>
              <p>{error}</p>
            </div>
            <button onClick={loadMembers} type="button">Retry</button>
          </div>
        )}

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
              <p>Try changing your search or filter.</p>
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
                    const memberStatus = String(member.status || "").toLowerCase();
                    const isActive = memberStatus === "active";

                    return (
                      <tr
                        key={member.id}
                        className="member-row"
                        onClick={() => handleOpenMember(member)}
                      >
                        <td>
                          <div className="member-cell">
                            <div className="avatar">
                              {profileImage(member) ? (
                                <img src={profileImage(member)} alt="" loading="lazy" />
                              ) : (
                                getInitial(member)
                              )}
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
                            <b>{pick(member, ["uid", "game_uid", "gameUid"], "—")}</b>
                            <span>
                              {pick(member, ["ign", "game_name", "gameName"], "—")}
                            </span>
                          </div>
                        </td>

                        <td>
                          <span className="email">{safeText(member.email)}</span>
                        </td>

                        <td>
                          <b className="wallet">
                            {money(walletNumber(member))}
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
                              isActive ? "status active" : "status blocked"
                            }
                          >
                            <i />
                            {member.status ? (isActive ? "Active" : String(member.status)) : "—"}
                          </span>
                        </td>

                        <td>
                          <div className="actions">
                            <button
                              type="button"
                              className="action view"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenMember(member);
                              }}
                            >
                              View
                            </button>

                            <button
                              type="button"
                              className={
                                isActive ? "action danger" : "action success"
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleMember(member);
                              }}
                              disabled={actionLoading === member.id}
                            >
                              {actionLoading === member.id
                                ? "..."
                                : isActive
                                ? "Block"
                                : "Unblock"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && filteredMembers.length > 0 && (
            <div className="pagination">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Previous
              </button>

              <div>
                <b>{page}</b>
                <span>/</span>
                {totalPages}
              </div>

              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </div>

      {selectedMember && (
        <MemberDetailModal
          member={selectedMember}
          loading={detailLoading}
          error={detailError}
          transactions={transactions}
          referrals={referrals}
          walletAction={walletAction}
          walletType={walletType}
          setWalletType={setWalletType}
          walletBalances={walletBalances}
          setWalletAction={setWalletAction}
          walletAmount={walletAmount}
          setWalletAmount={setWalletAmount}
          walletReason={walletReason}
          setWalletReason={setWalletReason}
          walletSaving={walletSaving}
          onWalletChange={changeWallet}
          onClose={() => setSelectedMember(null)}
          onBlock={() => toggleMember(selectedMember)}
          onCopy={copyValue}
        />
      )}

      <style jsx>{`
        .members-page { width: 100%; }
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
          box-shadow: 0 3px 12px rgba(15,23,42,.035);
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
        .stat-title { color: #7b8190; font-size: 12px; margin-bottom: 3px; }
        .stat-value { font-size: 22px; line-height: 1; font-weight: 800; color: #171923; }
        .stat-sub { color: #9aa0ad; font-size: 11px; margin-top: 4px; }

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
        .search-box input {
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          font-size: 13px;
          color: #111827;
        }
        .toolbar select {
          height: 40px;
          border: 1px solid #e1e4ea;
          border-radius: 9px;
          background: #fff;
          padding: 0 12px;
          outline: 0;
          color: #374151;
        }
        .refresh-btn {
          height: 40px;
          border: 0;
          border-radius: 9px;
          background: #ff174f;
          color: #fff;
          padding: 0 15px;
          font-weight: 700;
          cursor: pointer;
        }
        .refresh-btn:disabled { opacity: .55; cursor: not-allowed; }

        .error-box {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #fff7f7;
          border: 1px solid #fecaca;
          color: #991b1b;
          border-radius: 12px;
          padding: 12px 14px;
          margin-bottom: 14px;
        }
        .error-box div { flex: 1; }
        .error-box p { margin: 3px 0 0; font-size: 12px; }
        .error-box button {
          border: 0;
          background: #991b1b;
          color: #fff;
          padding: 8px 12px;
          border-radius: 8px;
          cursor: pointer;
        }

        .members-card {
          background: #fff;
          border: 1px solid #e8eaf0;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 5px 20px rgba(15,23,42,.035);
        }
        .card-head {
          padding: 17px 18px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #eef0f4;
        }
        .card-head h2 { margin: 0; font-size: 16px; color: #161922; }
        .card-head p { margin: 4px 0 0; color: #8b91a0; font-size: 11px; }
        .page-info { color: #737987; font-size: 12px; font-weight: 700; }

        .table-wrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; min-width: 950px; }
        th {
          text-align: left;
          padding: 12px 14px;
          font-size: 10px;
          letter-spacing: .04em;
          color: #8b91a0;
          background: #fafbfc;
          border-bottom: 1px solid #eef0f4;
        }
        td {
          padding: 13px 14px;
          border-bottom: 1px solid #f0f1f4;
          color: #333844;
          font-size: 12px;
        }
        .member-row { cursor: pointer; transition: background .15s; }
        .member-row:hover { background: #fff8fa; }
        .member-cell { display: flex; align-items: center; gap: 10px; }
        .avatar {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          background: #fff0f3;
          color: #ff174f;
          display: grid;
          place-items: center;
          font-weight: 800;
          overflow: hidden;
          flex: 0 0 34px;
        }
        .avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .member-cell strong { display: block; color: #1b1d25; font-size: 12px; }
        .member-cell small { display: block; color: #9aa0ad; font-size: 9px; margin-top: 2px; }
        .uid-cell b { display: block; color: #20232c; }
        .uid-cell span { display: block; color: #9298a5; margin-top: 3px; font-size: 10px; }
        .email { color: #596170; }
        .wallet { color: #159447; }
        .date { color: #737987; }
        .status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 10px;
          font-weight: 800;
        }
        .status i { width: 6px; height: 6px; border-radius: 50%; display: block; }
        .status.active { color: #137a3b; background: #ecfdf3; }
        .status.active i { background: #16a34a; }
        .status.blocked { color: #b42318; background: #fff1f1; }
        .status.blocked i { background: #ef4444; }
        .actions { display: flex; gap: 5px; }
        .action {
          border: 0;
          border-radius: 7px;
          padding: 7px 9px;
          font-size: 10px;
          font-weight: 800;
          cursor: pointer;
        }
        .action:disabled { opacity: .5; cursor: not-allowed; }
        .action.view { color: #374151; background: #f3f4f6; }
        .action.view:hover { background: #e5e7eb; }
        .action.danger { color: #b42318; background: #fff1f1; }
        .action.success { color: #137a3b; background: #ecfdf3; }

        .pagination {
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 18px;
          border-top: 1px solid #eef0f4;
        }
        .pagination button {
          border: 1px solid #e1e4ea;
          background: #fff;
          border-radius: 8px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 700;
        }
        .pagination button:disabled { opacity: .4; cursor: not-allowed; }
        .pagination div { display: flex; gap: 7px; align-items: center; color: #737987; font-size: 12px; }
        .pagination b { color: #ff174f; }
        .empty { text-align: center; padding: 60px 20px; color: #7b8190; }
        .empty > div { font-size: 35px; }
        .empty h3 { margin: 10px 0 5px; color: #252832; }
        .empty p { margin: 0; font-size: 12px; }

        @media (max-width: 850px) {
          .stats-grid { grid-template-columns: 1fr; }
          .toolbar { flex-wrap: wrap; }
          .search-box { min-width: 100%; }
          .toolbar select, .refresh-btn { flex: 1; }
        }
      `}</style>
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
    <div style={{ padding: 18 }}>
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <div
          key={n}
          style={{
            height: 48,
            borderRadius: 8,
            background: "#f4f5f7",
            marginBottom: 8,
            animation: "pulse 1.2s infinite ease-in-out",
          }}
        />
      ))}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: .55; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function MemberDetailModal({
  member,
  loading,
  error,
  transactions,
  referrals,
  walletAction,
  setWalletAction,
  walletType,
  setWalletType,
  walletBalances,
  walletAmount,
  setWalletAmount,
  walletReason,
  setWalletReason,
  walletSaving,
  onWalletChange,
  onClose,
  onBlock,
  onCopy,
}) {
  const memberStatus = String(member.status || "").toLowerCase();
  const active = memberStatus === "active";
  const phone = pick(member, ["phone", "phone_number", "mobile"], "—");
  const uid = pick(member, ["uid", "game_uid", "freefire_uid"], "—");
  const ign = pick(member, ["ign", "game_name", "gameName"], "—");
  const ip = pick(member, ["ip_address", "last_ip", "ip"], "—");
  const fcm = pick(member, ["fcm_token", "fcmToken", "push_token"], "—");
  const referralCode = pick(member, ["referral_code", "referralCode"], "—");

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="profile-head">
            <div className="big-avatar">
              {profileImage(member) ? (
                <img src={profileImage(member)} alt="" />
              ) : (
                getInitial(member)
              )}
            </div>
            <div>
              <div className="profile-name">{displayName(member)}</div>
              <div className="profile-id">
                ID: {safeText(member.id)}
                <button type="button" onClick={() => onCopy(member.id, "Member ID")}>Copy</button>
              </div>
            </div>
          </div>

          <div className="head-right">
            <span className={active ? "pill active-pill" : "pill blocked-pill"}>
              {member.status ? (active ? "● Active" : `● ${String(member.status)}`) : "—"}
            </span>
            <button className="close-btn" type="button" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="modal-scroll">
          <div className="quick-grid">
            <Quick title="Wallet" value={money(walletNumber(member))} />
            <Quick title="Game UID" value={uid} />
            <Quick title="IGN" value={ign} />
            <Quick title="Referrals" value={referrals.length} />
          </div>

          <section className="section">
            <div className="section-title">ACCOUNT DETAILS</div>
            <div className="detail-grid">
              <DetailItem label="Full Name" value={displayName(member)} />
              <DetailItem label="Email" value={member.email} copy={() => onCopy(member.email, "Email")} />
              <DetailItem label="Phone" value={phone} copy={() => onCopy(phone, "Phone")} />
              <DetailItem label="Game UID" value={uid} copy={() => onCopy(uid, "Game UID")} />
              <DetailItem label="IGN" value={ign} copy={() => onCopy(ign, "IGN")} />
              <DetailItem label="Level" value={member.level} />
              <DetailItem label="IP Address" value={ip} copy={() => onCopy(ip, "IP address")} />
              <DetailItem label="FCM Token" value={fcm} copy={() => onCopy(fcm, "FCM token")} />
              <DetailItem label="Referral Code" value={referralCode} copy={() => onCopy(referralCode, "Referral code")} />
              <DetailItem label="Created" value={formatDateTime(member.created_at)} />
              <DetailItem label="Last Login" value={formatDateTime(member.last_login || member.last_sign_in_at)} />
              <DetailItem label="Status" value={active ? "Active" : "Blocked"} />
            </div>
          </section>

          <section className="wallet-panel">
            <div className="wallet-summary">
              <div className="section-title light">WALLET CONTROL</div>
              <div className="wallet-total">{money(Number(walletBalances.bonus_balance || 0) + Number(walletBalances.deposit_balance || 0) + Number(walletBalances.winning_balance || 0))}</div>
              <div className="wallet-caption">Total wallet balance</div>

              <div className="wallet-balance-grid">
                <div className="balance-chip bonus"><span>🎁 Bonus</span><b>{money(walletBalances.bonus_balance)}</b></div>
                <div className="balance-chip deposit"><span>💳 Deposit</span><b>{money(walletBalances.deposit_balance)}</b></div>
                <div className="balance-chip winning"><span>🏆 Winning</span><b>{money(walletBalances.winning_balance)}</b></div>
              </div>
            </div>

            <div className="wallet-controls">
              <div className="wallet-select-label">SELECT BALANCE TO CHANGE</div>
              <div className="wallet-type-grid">
                <button type="button" className={walletType === "bonus" ? "wallet-type-btn active bonus" : "wallet-type-btn bonus"} onClick={() => setWalletType("bonus")}>🎁<span>Bonus</span><b>{money(walletBalances.bonus_balance)}</b></button>
                <button type="button" className={walletType === "deposit" ? "wallet-type-btn active deposit" : "wallet-type-btn deposit"} onClick={() => setWalletType("deposit")}>💳<span>Deposit</span><b>{money(walletBalances.deposit_balance)}</b></button>
                <button type="button" className={walletType === "winning" ? "wallet-type-btn active winning" : "wallet-type-btn winning"} onClick={() => setWalletType("winning")}>🏆<span>Winning</span><b>{money(walletBalances.winning_balance)}</b></button>
              </div>
              <div className="wallet-toggle">
                <button
                  type="button"
                  className={walletAction === "add" ? "selected add" : ""}
                  onClick={() => setWalletAction("add")}
                >
                  + Add
                </button>
                <button
                  type="button"
                  className={walletAction === "deduct" ? "selected deduct" : ""}
                  onClick={() => setWalletAction("deduct")}
                >
                  − Deduct
                </button>
              </div>

              <input
                type="number"
                min="0"
                step="0.01"
                value={walletAmount}
                onChange={(e) => setWalletAmount(e.target.value)}
                placeholder="Amount ₹"
              />

              <input
                value={walletReason}
                onChange={(e) => setWalletReason(e.target.value)}
                placeholder="Reason (optional)"
              />

              <button
                type="button"
                className="wallet-save"
                onClick={onWalletChange}
                disabled={walletSaving}
              >
                {walletSaving ? "Saving..." : walletAction === "add" ? "Add Money" : "Deduct Money"}
              </button>
            </div>
          </section>

          <section className="section">
            <div className="section-title-row">
              <div className="section-title">RECENT TRANSACTIONS</div>
              <span>{transactions.length}</span>
            </div>

            {loading ? (
              <div className="muted-box">Loading transactions...</div>
            ) : transactions.length === 0 ? (
              <div className="muted-box">No recent transactions found.</div>
            ) : (
              <div className="list">
                {transactions.map((tx, index) => (
                  <div className="list-row" key={tx.id || `${tx.created_at}-${index}`}>
                    <div>
                      <b>{safeText(tx.type || tx.description || "Transaction")}</b>
                      <small>{formatDateTime(tx.created_at)}</small>
                    </div>
                    <strong className={Number(tx.amount) >= 0 ? "amount-plus" : "amount-minus"}>
                      {Number(tx.amount) >= 0 ? "+" : ""}
                      {money(tx.amount)}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <div className="section-title-row">
              <div className="section-title">REFERRALS</div>
              <span>{referrals.length}</span>
            </div>

            {loading ? (
              <div className="muted-box">Loading referrals...</div>
            ) : referrals.length === 0 ? (
              <div className="muted-box">No referrals found.</div>
            ) : (
              <div className="list">
                {referrals.map((ref, index) => (
                  <div className="list-row" key={ref.id || index}>
                    <div className="ref-user">
                      <div className="mini-avatar">{getInitial(ref)}</div>
                      <div>
                        <b>{displayName(ref)}</b>
                        <small>{ref.email || "No email"}</small>
                      </div>
                    </div>
                    <span className="ref-date">{formatDate(ref.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {error && <div className="detail-warning">⚠️ {error}</div>}
        </div>

        <div className="modal-foot">
          <button
            type="button"
            className={active ? "footer-block" : "footer-unblock"}
            onClick={onBlock}
          >
            {active ? "Block Member" : "Unblock Member"}
          </button>
          <button type="button" className="footer-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <style jsx>{`
        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(15, 23, 42, .58);
          backdrop-filter: blur(7px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 22px;
          animation: fade .16s ease;
        }
        .modal {
          width: min(980px, 100%);
          max-height: min(900px, calc(100vh - 44px));
          background: #f8fafc;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 30px 90px rgba(0,0,0,.28);
          animation: pop .18s ease;
        }
        .modal-head {
          padding: 18px 20px;
          background: #fff;
          border-bottom: 1px solid #eceef2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
        }
        .profile-head { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .big-avatar {
          width: 48px; height: 48px; border-radius: 14px;
          display: grid; place-items: center;
          background: linear-gradient(135deg, #ff174f, #ff4f79);
          color: #fff; font-weight: 900; font-size: 20px;
          box-shadow: 0 8px 20px rgba(255,23,79,.22);
          overflow: hidden; flex: 0 0 48px;
        }
        .big-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .profile-name { font-size: 17px; font-weight: 900; color: #161922; }
        .profile-id { margin-top: 4px; color: #8b91a0; font-size: 10px; display: flex; align-items: center; gap: 7px; }
        .profile-id button {
          border: 0; background: #f1f2f4; color: #555b68;
          border-radius: 6px; padding: 3px 7px; cursor: pointer; font-size: 9px; font-weight: 800;
        }
        .head-right { display: flex; align-items: center; gap: 10px; }
        .pill { border-radius: 999px; padding: 7px 10px; font-size: 10px; font-weight: 900; }
        .active-pill { color: #137a3b; background: #ecfdf3; }
        .blocked-pill { color: #b42318; background: #fff1f1; }
        .close-btn {
          width: 34px; height: 34px; border: 0; border-radius: 9px;
          background: #f1f2f4; color: #555b68; font-size: 24px; line-height: 1; cursor: pointer;
        }
        .modal-scroll { overflow-y: auto; padding: 16px; max-height: calc(100vh - 180px); }
        .quick-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
        .quick { background: #fff; border: 1px solid #e8eaf0; border-radius: 12px; padding: 12px; min-width: 0; }
        .quick-title { color: #9096a3; font-size: 9px; font-weight: 800; text-transform: uppercase; }
        .quick-value { color: #171923; font-size: 15px; font-weight: 900; margin-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .section { background: #fff; border: 1px solid #e8eaf0; border-radius: 14px; padding: 15px; margin-bottom: 14px; }
        .section-title { color: #858b98; font-size: 9px; font-weight: 900; letter-spacing: .08em; margin-bottom: 10px; }
        .section-title.light { color: rgba(255,255,255,.68); }
        .section-title-row { display: flex; align-items: center; justify-content: space-between; }
        .section-title-row > span { color: #9aa0ad; font-size: 10px; font-weight: 800; }
        .detail-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
        .detail-item { background: #f8fafc; border: 1px solid #edf0f3; border-radius: 10px; padding: 10px; min-width: 0; }
        .detail-label { color: #9aa0ad; font-size: 8px; font-weight: 800; text-transform: uppercase; }
        .detail-value { color: #222631; font-size: 11px; font-weight: 800; margin-top: 4px; word-break: break-word; }
        .detail-copy { margin-top: 6px; border: 0; background: #fff0f3; color: #ff174f; border-radius: 5px; padding: 3px 6px; font-size: 8px; font-weight: 900; cursor: pointer; }
        .wallet-panel {
          display: grid; grid-template-columns: .8fr 1.2fr; gap: 18px;
          background: #171923; border-radius: 15px; padding: 17px; margin-bottom: 14px;
        }
        .wallet-total { color: #fff; font-size: 27px; font-weight: 900; }
        .wallet-caption { color: rgba(255,255,255,.48); font-size: 9px; margin-top: 3px; }
        .wallet-balance-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin-top: 12px;
        }

        .balance-chip {
          padding: 10px;
          border-radius: 12px;
          background: rgba(255,255,255,.07);
          border: 1px solid rgba(255,255,255,.1);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .balance-chip span { font-size: 10px; color: rgba(255,255,255,.7); }
        .balance-chip b { font-size: 14px; color: #fff; }
        .wallet-type {
          height: 42px;
          width: 100%;
          border-radius: 10px;
          border: 1px solid #e5e7eb;
          background: #fff;
          padding: 0 12px;
          font-weight: 700;
          color: #171923;
          outline: none;
        }

        .wallet-select-label {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 1px;
          color: #8b93a3;
          margin-bottom: 7px;
        }

        .wallet-type-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 7px;
          margin-bottom: 9px;
        }

        .wallet-type-btn {
          border: 1px solid #e5e7eb;
          background: #fff;
          border-radius: 11px;
          padding: 9px 7px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          color: #475569;
          font-size: 15px;
          transition: .15s ease;
        }

        .wallet-type-btn span { font-size: 10px; font-weight: 800; }
        .wallet-type-btn b { font-size: 10px; color: #111827; }
        .wallet-type-btn.active { border-color: #ff174f; background: #fff1f4; box-shadow: 0 0 0 2px rgba(255,23,79,.08); }
        .wallet-type-btn.active span { color: #ff174f; }

        .wallet-controls { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center; }
        .wallet-toggle { display: flex; background: rgba(255,255,255,.08); border-radius: 8px; padding: 3px; }
        .wallet-toggle button {
          border: 0; background: transparent; color: rgba(255,255,255,.65);
          padding: 7px 10px; border-radius: 6px; font-size: 9px; font-weight: 900; cursor: pointer;
        }
        .wallet-toggle button.selected.add { background: #159447; color: #fff; }
        .wallet-toggle button.selected.deduct { background: #d92d20; color: #fff; }
        .wallet-controls input {
          height: 35px; min-width: 0; border: 1px solid rgba(255,255,255,.12);
          border-radius: 8px; background: rgba(255,255,255,.07); color: #fff;
          outline: 0; padding: 0 10px; font-size: 10px;
        }
        .wallet-controls input::placeholder { color: rgba(255,255,255,.35); }
        .wallet-save {
          height: 35px; border: 0; border-radius: 8px; background: #ff174f;
          color: #fff; font-size: 10px; font-weight: 900; cursor: pointer;
        }
        .wallet-save:disabled { opacity: .55; cursor: not-allowed; }
        .list { display: grid; gap: 7px; }
        .list-row {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 10px 11px; background: #f8fafc; border: 1px solid #edf0f3; border-radius: 9px;
        }
        .list-row b { display: block; color: #252832; font-size: 10px; }
        .list-row small { display: block; color: #9aa0ad; font-size: 9px; margin-top: 3px; }
        .amount-plus { color: #159447; font-size: 11px; }
        .amount-minus { color: #d92d20; font-size: 11px; }
        .ref-user { display: flex; align-items: center; gap: 8px; }
        .mini-avatar {
          width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center;
          background: #fff0f3; color: #ff174f; font-size: 10px; font-weight: 900;
        }
        .ref-date { color: #9298a5; font-size: 9px; }
        .muted-box { color: #8b91a0; background: #f8fafc; border-radius: 9px; padding: 12px; font-size: 10px; }
        .detail-warning { background: #fff8e7; color: #8a5a00; border: 1px solid #ffe2a8; border-radius: 10px; padding: 10px; font-size: 10px; }
        .modal-foot {
          padding: 12px 16px; background: #fff; border-top: 1px solid #eceef2;
          display: flex; justify-content: flex-end; gap: 8px;
        }
        .modal-foot button { border: 0; border-radius: 8px; padding: 9px 13px; font-size: 10px; font-weight: 900; cursor: pointer; }
        .footer-block { background: #fff1f1; color: #b42318; }
        .footer-unblock { background: #ecfdf3; color: #137a3b; }
        .footer-close { background: #f1f2f4; color: #374151; }
        @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @media (max-width: 800px) {
          .modal-backdrop { padding: 8px; }
          .modal { max-height: calc(100vh - 16px); border-radius: 15px; }
          .modal-scroll { max-height: calc(100vh - 140px); padding: 10px; }
          .quick-grid { grid-template-columns: repeat(2, 1fr); }
          .detail-grid { grid-template-columns: repeat(2, 1fr); }
          .wallet-panel { grid-template-columns: 1fr; }
          .wallet-balance-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin-top: 12px;
        }

        .balance-chip {
          padding: 10px;
          border-radius: 12px;
          background: rgba(255,255,255,.07);
          border: 1px solid rgba(255,255,255,.1);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .balance-chip span { font-size: 10px; color: rgba(255,255,255,.7); }
        .balance-chip b { font-size: 14px; color: #fff; }
        .wallet-type {
          height: 42px;
          width: 100%;
          border-radius: 10px;
          border: 1px solid #e5e7eb;
          background: #fff;
          padding: 0 12px;
          font-weight: 700;
          color: #171923;
          outline: none;
        }

        .wallet-select-label {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 1px;
          color: #8b93a3;
          margin-bottom: 7px;
        }

        .wallet-type-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 7px;
          margin-bottom: 9px;
        }

        .wallet-type-btn {
          border: 1px solid #e5e7eb;
          background: #fff;
          border-radius: 11px;
          padding: 9px 7px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          color: #475569;
          font-size: 15px;
          transition: .15s ease;
        }

        .wallet-type-btn span { font-size: 10px; font-weight: 800; }
        .wallet-type-btn b { font-size: 10px; color: #111827; }
        .wallet-type-btn.active { border-color: #ff174f; background: #fff1f4; box-shadow: 0 0 0 2px rgba(255,23,79,.08); }
        .wallet-type-btn.active span { color: #ff174f; }

        .wallet-controls { grid-template-columns: 1fr; }
          .head-right .pill { display: none; }
        }
        @media (max-width: 480px) {
          .detail-grid { grid-template-columns: 1fr; }
          .modal-head { padding: 13px; }
          .profile-name { font-size: 14px; }
          .big-avatar { width: 42px; height: 42px; }
        }
      `}</style>
    </div>
  );
}

function Quick({ title, value }) {
  return (
    <div className="quick">
      <div className="quick-title">{title}</div>
      <div className="quick-value">{safeText(value)}</div>
      <style jsx>{`
        .quick {
          background: #fff;
          border: 1px solid #e8eaf0;
          border-radius: 12px;
          padding: 12px;
          min-width: 0;
        }
        .quick-title { color: #9096a3; font-size: 9px; font-weight: 800; text-transform: uppercase; }
        .quick-value { color: #171923; font-size: 15px; font-weight: 900; margin-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      `}</style>
    </div>
  );
}

function DetailItem({ label, value, copy }) {
  return (
    <div className="detail-item">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{safeText(value)}</div>
      {copy && value && value !== "—" ? (
        <button type="button" className="detail-copy" onClick={copy}>
          COPY
        </button>
      ) : null}
      <style jsx>{`
        .detail-item { background: #f8fafc; border: 1px solid #edf0f3; border-radius: 10px; padding: 10px; min-width: 0; }
        .detail-label { color: #9aa0ad; font-size: 8px; font-weight: 800; text-transform: uppercase; }
        .detail-value { color: #222631; font-size: 11px; font-weight: 800; margin-top: 4px; word-break: break-word; }
        .detail-copy { margin-top: 6px; border: 0; background: #fff0f3; color: #ff174f; border-radius: 5px; padding: 3px 6px; font-size: 8px; font-weight: 900; cursor: pointer; }
      `}</style>
    </div>
  );
}
