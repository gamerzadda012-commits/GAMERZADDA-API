"use client";

import { useEffect, useState, useCallback } from "react";
import AdminShell from "../AdminShell";
import { supabase } from "../../../lib/supabase";

const API_URL = "/api/admin/withdrawals";

export default function Page() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [error, setError] = useState("");

  // --------------------------------------------------
  // AUTH
  // --------------------------------------------------

  async function getAuthHeaders() {
    const headers = {
      Accept: "application/json",
    };

    try {
      const { data } = await supabase.auth.getSession();

      const token = data?.session?.access_token;

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.error("SUPABASE SESSION ERROR:", err);
    }

    return headers;
  }

  // --------------------------------------------------
  // LOAD WITHDRAWALS
  // --------------------------------------------------

  const loadWithdrawals = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const headers = await getAuthHeaders();

      const response = await fetch(
        `${API_URL}?status=${encodeURIComponent(status)}`,
        {
          method: "GET",
          headers,
          credentials: "include",
          cache: "no-store",
        }
      );

      let data = null;

      try {
        data = await response.json();
      } catch {
        data = null;
      }

      console.log("WITHDRAWALS RESPONSE:", response.status, data);

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            data?.error ||
              "Admin session expired. Please login again."
          );
        }

        if (response.status === 403) {
          throw new Error(
            data?.error ||
              "You do not have admin permission."
          );
        }

        throw new Error(
          data?.error ||
            data?.message ||
            `Unable to load withdrawals (${response.status}).`
        );
      }

      const list = Array.isArray(data?.withdrawals)
        ? data.withdrawals
        : Array.isArray(data)
        ? data
        : [];

      setWithdrawals(list);
    } catch (err) {
      console.error("WITHDRAWALS LOAD ERROR:", err);

      setWithdrawals([]);

      setError(
        err?.message ||
          "Unable to load withdrawals."
      );
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    loadWithdrawals();
  }, [loadWithdrawals]);

  // --------------------------------------------------
  // PROCESS WITHDRAWAL
  // --------------------------------------------------

  async function processWithdrawal(withdrawal, action) {
    if (!withdrawal?.id || processing) {
      return;
    }

    let note = "";

    if (action === "approve") {
      const amount = Number(
        withdrawal.net_amount ??
          withdrawal.amount ??
          0
      );

      const confirmed = window.confirm(
        `Approve withdrawal of ₹${amount.toFixed(
          2
        )} to ${withdrawal.upi_id || "this UPI ID"}?`
      );

      if (!confirmed) {
        return;
      }
    }

    if (action === "reject") {
      const enteredNote = window.prompt(
        "Enter rejection reason:"
      );

      if (enteredNote === null) {
        return;
      }

      note = enteredNote.trim();

      if (!note) {
        window.alert(
          "Please enter a rejection reason."
        );
        return;
      }
    }

    try {
      setProcessing(withdrawal.id);
      setError("");

      const headers = await getAuthHeaders();

      headers["Content-Type"] = "application/json";

      const response = await fetch(API_URL, {
        method: "PATCH",
        headers,
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          withdrawalId: withdrawal.id,
          action,
          note,
        }),
      });

      let data = null;

      try {
        data = await response.json();
      } catch {
        data = null;
      }

      console.log(
        "WITHDRAWAL PROCESS RESPONSE:",
        response.status,
        data
      );

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            data?.error ||
              "Admin session expired. Please login again."
          );
        }

        if (response.status === 403) {
          throw new Error(
            data?.error ||
              "You do not have admin permission."
          );
        }

        throw new Error(
          data?.error ||
            data?.message ||
            "Unable to process withdrawal."
        );
      }

      window.alert(
        action === "approve"
          ? "Withdrawal approved successfully ✅"
          : "Withdrawal rejected successfully ✅"
      );

      await loadWithdrawals();
    } catch (err) {
      console.error(
        "WITHDRAWAL PROCESS ERROR:",
        err
      );

      window.alert(
        err?.message ||
          "Something went wrong."
      );
    } finally {
      setProcessing(null);
    }
  }

  // --------------------------------------------------
  // HELPERS
  // --------------------------------------------------

  function money(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "₹0.00";
    }

    return `₹${number.toFixed(2)}`;
  }

  function formatDate(value) {
    if (!value) {
      return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getUser(withdrawal) {
    const user = withdrawal?.users;

    if (Array.isArray(user)) {
      return user[0] || {};
    }

    return user || {};
  }

  function statusStyle(value) {
    const current = String(
      value || ""
    ).toLowerCase();

    if (current === "pending") {
      return {
        background: "#fff7ed",
        color: "#c2410c",
      };
    }

    if (current === "approved") {
      return {
        background: "#ecfdf5",
        color: "#047857",
      };
    }

    if (current === "rejected") {
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

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <AdminShell title="Withdrawals">
      <div
        style={{
          padding: "20px",
          maxWidth: "1400px",
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
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
                color: "#111827",
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
            type="button"
            onClick={loadWithdrawals}
            disabled={loading}
            style={{
              border: "1px solid #e5e7eb",
              background: "#fff",
              color: "#111827",
              borderRadius: "10px",
              padding: "10px 16px",
              fontWeight: 700,
              cursor: loading
                ? "not-allowed"
                : "pointer",
              opacity: loading ? 0.6 : 1,
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
                type="button"
                onClick={() => setStatus(value)}
                style={{
                  border: active
                    ? "1px solid #111827"
                    : "1px solid #e5e7eb",
                  background: active
                    ? "#111827"
                    : "#fff",
                  color: active
                    ? "#fff"
                    : "#374151",
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
            <div>{error}</div>

            <button
              type="button"
              onClick={loadWithdrawals}
              style={{
                marginTop: "10px",
                border: "1px solid #fecaca",
                background: "#fff",
                color: "#b91c1c",
                borderRadius: "8px",
                padding: "7px 12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* LOADING */}
        {loading ? (
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "70px 20px",
              textAlign: "center",
              border: "1px solid #e5e7eb",
              boxShadow:
                "0 2px 8px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                fontSize: "32px",
                marginBottom: "10px",
              }}
            >
              ⏳
            </div>

            <p
              style={{
                color: "#6b7280",
                margin: 0,
              }}
            >
              Loading withdrawals...
            </p>
          </div>
        ) : withdrawals.length === 0 ? (
          /* EMPTY */
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "70px 20px",
              textAlign: "center",
              border: "1px solid #e5e7eb",
              boxShadow:
                "0 2px 8px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                fontSize: "52px",
                marginBottom: "8px",
              }}
            >
              💸
            </div>

            <h2
              style={{
                margin: "10px 0 6px",
                color: "#111827",
              }}
            >
              No{" "}
              {status === "all"
                ? ""
                : status}{" "}
              withdrawals
            </h2>

            <p
              style={{
                color: "#6b7280",
                margin: 0,
              }}
            >
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
              boxShadow:
                "0 2px 8px rgba(0,0,0,0.04)",
            }}
          >
            <table
              style={{
                width: "100%",
                minWidth: "1100px",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f9fafb",
                    borderBottom:
                      "1px solid #e5e7eb",
                  }}
                >
                  <th style={th}>User</th>
                  <th style={th}>
                    Account Holder
                  </th>
                  <th style={th}>UPI ID</th>
                  <th style={th}>Amount</th>
                  <th style={th}>Charge</th>
                  <th style={th}>
                    Net Amount
                  </th>
                  <th style={th}>Status</th>
                  <th style={th}>Date</th>
                  <th style={th}>Action</th>
                </tr>
              </thead>

              <tbody>
                {withdrawals.map((withdrawal) => {
                  const user =
                    getUser(withdrawal);

                  const isProcessing =
                    processing === withdrawal.id;

                  const badge = statusStyle(
                    withdrawal.status
                  );

                  const amount = Number(
                    withdrawal.amount || 0
                  );

                  const netAmount = Number(
                    withdrawal.net_amount ??
                      amount
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
                            color: "#111827",
                          }}
                        >
                          {user?.game_name ||
                            user?.email ||
                            "User"}
                        </div>

                        <div
                          style={{
                            fontSize: "12px",
                            color: "#6b7280",
                            marginTop: "3px",
                            wordBreak:
                              "break-all",
                          }}
                        >
                          {user?.email ||
                            withdrawal.user_id ||
                            "-"}
                        </div>

                        {user?.free_fire_uid && (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#9ca3af",
                              marginTop: "2px",
                            }}
                          >
                            UID:{" "}
                            {user.free_fire_uid}
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
                            color: "#111827",
                          }}
                        >
                          {withdrawal.upi_id ||
                            "—"}
                        </span>
                      </td>

                      {/* AMOUNT */}
                      <td style={td}>
                        <strong>
                          {money(
                            withdrawal.amount
                          )}
                        </strong>
                      </td>

                      {/* CHARGE */}
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
                          {money(netAmount)}
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
                            whiteSpace:
                              "nowrap",
                          }}
                        >
                          {withdrawal.status ||
                            "unknown"}
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
                        {String(
                          withdrawal.status
                        ).toLowerCase() ===
                        "pending" ? (
                          <div
                            style={{
                              display: "flex",
                              gap: "7px",
                              alignItems:
                                "center",
                            }}
                          >
                            <button
                              type="button"
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
                                whiteSpace:
                                  "nowrap",
                              }}
                            >
                              {isProcessing
                                ? "..."
                                : "✓ Approve"}
                            </button>

                            <button
                              type="button"
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
                                whiteSpace:
                                  "nowrap",
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

// --------------------------------------------------
// TABLE STYLES
// --------------------------------------------------

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