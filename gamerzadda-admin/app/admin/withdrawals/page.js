import AdminShell from "../AdminShell";
export default function Page(){return <AdminShell title="Withdrawals"><div className="empty-card"><div className="big-icon">💸</div><h2>Withdrawals</h2><p>Review and process withdrawal requests.</p><div className="notice">Module ready — connect this page to the existing GamerzAdda API/Supabase data.</div></div></AdminShell>}
"use client";

import { useEffect, useState } from "react";
import AdminShell from "../AdminShell";
import { supabase } from "@/lib/supabase";

export default function Page() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [error, setError] = useState("");

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || "";
  }

  async function loadWithdrawals() {
    try {
      setLoading(true);
      setError("");

      const token = await getToken();

      if (!token) {
        window.location.href = "/admin/login";
        return;
      }

      const response = await fetch(
        `/api/admin/withdrawals?status=${encodeURIComponent(status)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || "Unable to load withdrawals."
        );
      }

      setWithdrawals(data?.withdrawals || []);
    } catch (err) {
      console.error("WITHDRAWALS LOAD ERROR:", err);
      setError(err?.message || "Unable to load withdrawals.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWithdrawals();
  }, [status]);

  async function processWithdrawal(withdrawal, action) {
    if (processing) return;

    let note = "";

    if (action === "approve") {
      const confirmed = window.confirm(
        `Approve withdrawal of ₹${Number(
          withdrawal.net_amount ?? withdrawal.amount ?? 0
        ).toFixed(2)} to ${withdrawal.upi_id}?`
      );

      if (!confirmed) return;
    }

    if (action === "reject") {
      const enteredNote = window.prompt(
        "Enter rejection reason:"
      );

      if (enteredNote === null) return;

      note = enteredNote.trim();

      if (!note) {
        alert("Please enter a rejection reason.");
        return;
      }
    }

    try {
      setProcessing(withdrawal.id);

      const token = await getToken();

      if (!token) {
        window.location.href = "/admin/login";
        return;
      }

      const response = await fetch("/api/admin/withdrawals", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          withdrawalId: withdrawal.id,
          action,
          note,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || "Unable to process withdrawal."
        );
      }

      alert(
        action === "approve"
          ? "Withdrawal approved successfully ✅"
          : "Withdrawal rejected successfully ✅"
      );

      await loadWithdrawals();
    } catch (err) {
      console.error("WITHDRAWAL PROCESS ERROR:", err);
      alert(err?.message || "Something went wrong.");
    } finally {
      setProcessing(null);
    }
  }

  function money(value) {
    return `₹${Number(value || 0).toFixed(2)}`;
  }

  function formatDate(value) {
    if (!value) return "-";

    return new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function statusStyle(value) {
    const s = String(value || "").toLowerCase();

    if (s === "pending") {
      return {
        background: "#fff7ed",
        color: "#c2410c",
      };
    }

    if (s === "approved") {
      return {
        background: "#ecfdf5",
        color: "#047857",
      };
    }

    if (s === "rejected") {
      return {
        background: "#fef2f2",
        color: "#dc2626",
      };
    }

    return {
      background: "#f3f4f6",
      color: "#374151",
    };
  }

  return (
    <AdminShell title="Withdrawals">
      <div
        style={{
          padding: "20px",
          maxWidth: "1400px",
          margin: "0 auto",
        }}
      >
        {/* HEADER */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "20px",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "28px",
                fontWeight: 800,
              }}
            >
              💸 Withdrawals
            </h1>

            <p
              style={{
                margin: "6px 0 0",
                color: "#6b7280",
              }}
            >
              Review and process user withdrawal requests.
            </p>
          </div>

          <button
            onClick={loadWithdrawals}
            style={{
              border: "1px solid #e5e7eb",
              background: "#fff",
              borderRadius: "10px",
              padding: "10px 16px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            🔄 Refresh
          </button>
        </div>

        {/* TABS */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            marginBottom: "20px",
          }}
        >
          {[
            ["pending", "⏳ Pending"],
            ["approved", "✅ Approved"],
            ["rejected", "❌ Rejected"],
            ["all", "📋 All"],
          ].map(([value, label]) => {
            const active = status === value;

            return (
              <button
                key={value}
                onClick={() => setStatus(value)}
                style={{
                  border: active
                    ? "1px solid #111827"
                    : "1px solid #e5e7eb",
                  background: active ? "#111827" : "#fff",
                  color: active ? "#fff" : "#374151",
                  borderRadius: "10px",
                  padding: "10px 16px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ERROR */}
        {error && (
          <div
            style={{
              background: "#fef2f2",
              color: "#b91c1c",
              border: "1px solid #fecaca",
              borderRadius: "12px",
              padding: "14px",
              marginBottom: "18px",
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        {/* LOADING */}
        {loading ? (
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "50px 20px",
              textAlign: "center",
              border: "1px solid #e5e7eb",
            }}
          >
            <div style={{ fontSize: "30px" }}>⏳</div>
            <p style={{ color: "#6b7280" }}>
              Loading withdrawals...
            </p>
          </div>
        ) : withdrawals.length === 0 ? (
          /* EMPTY */
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "60px 20px",
              textAlign: "center",
              border: "1px solid #e5e7eb",
            }}
          >
            <div style={{ fontSize: "50px" }}>💸</div>

            <h2 style={{ margin: "12px 0 6px" }}>
              No {status === "all" ? "" : status} withdrawals
            </h2>

            <p style={{ color: "#6b7280" }}>
              Withdrawal requests will appear here.
            </p>
          </div>
        ) : (
          /* TABLE */
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "16px",
              overflowX: "auto",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            }}
          >
            <table
              style={{
                width: "100%",
                minWidth: "1050px",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f9fafb",
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  <th style={th}>User</th>
                  <th style={th}>Account Holder</th>
                  <th style={th}>UPI ID</th>
                  <th style={th}>Amount</th>
                  <th style={th}>Charge</th>
                  <th style={th}>Net Amount</th>
                  <th style={th}>Status</th>
                  <th style={th}>Date</th>
                  <th style={th}>Action</th>
                </tr>
              </thead>

              <tbody>
                {withdrawals.map((withdrawal) => {
                  const isProcessing =
                    processing === withdrawal.id;

                  const badge = statusStyle(
                    withdrawal.status
                  );

                  return (
                    <tr
                      key={withdrawal.id}
                      style={{
                        borderBottom:
                          "1px solid #f0f0f0",
                      }}
                    >
                      {/* USER */}
                      <td style={td}>
                        <div
                          style={{
                            fontWeight: 700,
                          }}
                        >
                          {withdrawal.users?.game_name ||
                            "User"}
                        </div>

                        <div
                          style={{
                            fontSize: "12px",
                            color: "#6b7280",
                            marginTop: "3px",
                          }}
                        >
                          {withdrawal.users?.email ||
                            withdrawal.user_id}
                        </div>

                        {withdrawal.users
                          ?.free_fire_uid && (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#9ca3af",
                              marginTop: "2px",
                            }}
                          >
                            UID:{" "}
                            {
                              withdrawal.users
                                .free_fire_uid
                            }
                          </div>
                        )}
                      </td>

                      {/* ACCOUNT HOLDER */}
                      <td style={td}>
                        <strong>
                          {withdrawal.account_holder_name ||
                            "—"}
                        </strong>
                      </td>

                      {/* UPI */}
                      <td style={td}>
                        <span
                          style={{
                            fontFamily:
                              "monospace",
                            fontWeight: 600,
                          }}
                        >
                          {withdrawal.upi_id || "—"}
                        </span>
                      </td>

                      {/* AMOUNT */}
                      <td style={td}>
                        <strong>
                          {money(withdrawal.amount)}
                        </strong>
                      </td>

                      {/* SERVICE CHARGE */}
                      <td style={td}>
                        {money(
                          withdrawal.service_charge
                        )}
                      </td>

                      {/* NET */}
                      <td style={td}>
                        <strong
                          style={{
                            color: "#047857",
                          }}
                        >
                          {money(
                            withdrawal.net_amount ??
                              withdrawal.amount
                          )}
                        </strong>
                      </td>

                      {/* STATUS */}
                      <td style={td}>
                        <span
                          style={{
                            ...badge,
                            display:
                              "inline-flex",
                            padding:
                              "6px 10px",
                            borderRadius:
                              "999px",
                            fontSize:
                              "12px",
                            fontWeight: 800,
                            textTransform:
                              "uppercase",
                          }}
                        >
                          {withdrawal.status}
                        </span>
                      </td>

                      {/* DATE */}
                      <td
                        style={{
                          ...td,
                          fontSize: "13px",
                          whiteSpace:
                            "nowrap",
                        }}
                      >
                        {formatDate(
                          withdrawal.created_at
                        )}
                      </td>

                      {/* ACTION */}
                      <td style={td}>
                        {withdrawal.status ===
                        "pending" ? (
                          <div
                            style={{
                              display: "flex",
                              gap: "7px",
                            }}
                          >
                            <button
                              disabled={
                                isProcessing
                              }
                              onClick={() =>
                                processWithdrawal(
                                  withdrawal,
                                  "approve"
                                )
                              }
                              style={{
                                border: "none",
                                background:
                                  "#16a34a",
                                color: "#fff",
                                borderRadius:
                                  "8px",
                                padding:
                                  "9px 13px",
                                fontWeight: 800,
                                cursor:
                                  isProcessing
                                    ? "not-allowed"
                                    : "pointer",
                                opacity:
                                  isProcessing
                                    ? 0.6
                                    : 1,
                              }}
                            >
                              {isProcessing
                                ? "..."
                                : "✓ Approve"}
                            </button>

                            <button
                              disabled={
                                isProcessing
                              }
                              onClick={() =>
                                processWithdrawal(
                                  withdrawal,
                                  "reject"
                                )
                              }
                              style={{
                                border: "none",
                                background:
                                  "#dc2626",
                                color: "#fff",
                                borderRadius:
                                  "8px",
                                padding:
                                  "9px 13px",
                                fontWeight: 800,
                                cursor:
                                  isProcessing
                                    ? "not-allowed"
                                    : "pointer",
                                opacity:
                                  isProcessing
                                    ? 0.6
                                    : 1,
                              }}
                            >
                              {isProcessing
                                ? "..."
                                : "✕ Reject"}
                            </button>
                          </div>
                        ) : (
                          <span
                            style={{
                              color: "#9ca3af",
                              fontSize: "13px",
                            }}
                          >
                            Processed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

const th = {
  padding: "14px 12px",
  textAlign: "left",
  fontSize: "12px",
  fontWeight: 800,
  color: "#6b7280",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const td = {
  padding: "15px 12px",
  verticalAlign: "middle",
};