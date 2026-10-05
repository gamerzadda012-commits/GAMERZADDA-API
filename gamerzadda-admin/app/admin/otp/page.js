"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell from "../AdminShell";

const RED = "#ff174f";

function formatDate(value) {
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

function remaining(value) {
  if (!value) return "—";
  const ms = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "Expired";
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.ceil(minutes / 60)} hr`;
}

function Badge({ children, tone = "gray" }) {
  const styles = {
    green: { background: "#ecfdf3", color: "#15803d", border: "#bbf7d0" },
    red: { background: "#fff1f2", color: "#be123c", border: "#fecdd3" },
    orange: { background: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
    blue: { background: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
    gray: { background: "#f8fafc", color: "#475569", border: "#e2e8f0" },
  };
  const s = styles[tone] || styles.gray;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "5px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: s.background,
        color: s.color,
        border: `1px solid ${s.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Stat({ label, value, sub, danger = false }) {
  return (
    <div
      style={{
        flex: "1 1 190px",
        minWidth: 170,
        background: "#fff",
        border: "1px solid #e9edf3",
        borderRadius: 18,
        padding: 18,
        boxShadow: "0 8px 28px rgba(15,23,42,.05)",
      }}
    >
      <div style={{ color: "#64748b", fontSize: 12, fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 7, fontSize: 27, fontWeight: 800, color: danger ? "#e11d48" : "#0f172a" }}>
        {value}
      </div>
      <div style={{ marginTop: 4, color: "#94a3b8", fontSize: 12 }}>{sub}</div>
    </div>
  );
}

export default function Page() {
  const [phone, setPhone] = useState("");
  const [flow, setFlow] = useState("login");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tick, setTick] = useState(0);

  const cleanPhone = useMemo(
    () => String(phone || "").replace(/\D/g, "").slice(-10),
    [phone]
  );

  const load = useCallback(async () => {
    if (cleanPhone.length !== 10) {
      setError("Enter a valid 10-digit phone number.");
      setData(null);
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/admin/otp?phone=${encodeURIComponent(cleanPhone)}&flow=${encodeURIComponent(flow)}`,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Unable to load OTP control data.");
      }

      setData(result);
    } catch (err) {
      setData(null);
      setError(err?.message || "Unable to load OTP control data.");
    } finally {
      setLoading(false);
    }
  }, [cleanPhone, flow]);

  useEffect(() => {
    const timer = setInterval(() => setTick((v) => v + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (data?.record) setData((old) => ({ ...old }));
  }, [tick]);

  async function runAction(action) {
    if (!cleanPhone || cleanPhone.length !== 10) {
      setError("Enter a valid 10-digit phone number first.");
      return;
    }

    const labels = {
      unblock_wrong: "Unblock wrong-OTP attempts",
      unblock_resend: "Unblock OTP resend",
      reset: "FULL RESET for this phone",
    };

    if (!window.confirm(`${labels[action]}?\n\nPhone: ${cleanPhone}\nFlow: ${flow}`)) {
      return;
    }

    setActionLoading(action);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/otp", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: cleanPhone,
          flow,
          action,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Action failed.");
      }

      setMessage(result?.message || "OTP control updated successfully.");
      await load();
    } catch (err) {
      setError(err?.message || "Action failed.");
    } finally {
      setActionLoading("");
    }
  }

  const record = data?.record || null;
  const recentOtps = data?.recentOtps || [];
  const wrongBlocked = Boolean(record?.is_blocked);
  const resendBlocked = Boolean(record?.resend_is_blocked);

  return (
    <AdminShell title="OTP">
      <div style={{ padding: "8px 4px 32px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 20,
            marginBottom: 22,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 30, fontWeight: 850, color: "#0f172a", letterSpacing: -0.7 }}>
              OTP Security
            </div>
            <div style={{ color: "#94a3b8", marginTop: 5 }}>
              Control wrong-OTP locks, resend limits and permanent OTP blocks.
            </div>
          </div>
          <Badge tone="blue">ADMIN CONTROL</Badge>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #e9edf3",
            borderRadius: 20,
            padding: 18,
            boxShadow: "0 10px 35px rgba(15,23,42,.05)",
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: "1 1 280px" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#475569", marginBottom: 7 }}>
                PHONE NUMBER
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(-10))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") load();
                }}
                placeholder="Enter 10-digit phone number"
                inputMode="numeric"
                maxLength={10}
                style={{
                  width: "100%",
                  height: 48,
                  border: "1px solid #dbe2ea",
                  borderRadius: 12,
                  padding: "0 14px",
                  outline: "none",
                  fontSize: 15,
                  color: "#0f172a",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ width: 150 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#475569", marginBottom: 7 }}>
                FLOW
              </label>
              <select
                value={flow}
                onChange={(e) => {
                  setFlow(e.target.value);
                  setData(null);
                  setError("");
                  setMessage("");
                }}
                style={{
                  width: "100%",
                  height: 48,
                  border: "1px solid #dbe2ea",
                  borderRadius: 12,
                  padding: "0 12px",
                  background: "#fff",
                  fontSize: 15,
                  color: "#0f172a",
                }}
              >
                <option value="login">Login</option>
                <option value="signup">Signup</option>
              </select>
            </div>

            <button
              onClick={load}
              disabled={loading}
              style={{
                height: 48,
                padding: "0 24px",
                border: 0,
                borderRadius: 12,
                background: RED,
                color: "#fff",
                fontWeight: 800,
                cursor: loading ? "wait" : "pointer",
                marginTop: 19,
                boxShadow: "0 8px 20px rgba(255,23,79,.22)",
              }}
            >
              {loading ? "Checking..." : "Check OTP"}
            </button>
          </div>

          {error && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "#fff1f2", color: "#be123c", fontSize: 13, fontWeight: 700 }}>
              {error}
            </div>
          )}
          {message && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: "#ecfdf3", color: "#15803d", fontSize: 13, fontWeight: 700 }}>
              {message}
            </div>
          )}
        </div>

        {!data && !loading && (
          <div
            style={{
              background: "#fff",
              border: "1px dashed #d7dee8",
              borderRadius: 20,
              padding: "54px 24px",
              textAlign: "center",
              color: "#94a3b8",
            }}
          >
            <div style={{ fontSize: 46 }}>🔐</div>
            <div style={{ marginTop: 12, fontSize: 18, fontWeight: 800, color: "#334155" }}>
              Search a phone number
            </div>
            <div style={{ marginTop: 5, fontSize: 13 }}>
              Enter a user phone number above to manage OTP limits.
            </div>
          </div>
        )}

        {data && (
          <>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
              <Stat
                label="WRONG OTP ATTEMPTS"
                value={record?.wrong_attempts ?? 0}
                sub={wrongBlocked ? "Permanently blocked" : record?.locked_until ? `Locked for ${remaining(record.locked_until)}` : "No active wrong-OTP lock"}
                danger={wrongBlocked}
              />
              <Stat
                label="RESEND ATTEMPTS"
                value={record?.resend_attempts ?? 0}
                sub={resendBlocked ? "Permanently blocked" : record?.resend_locked_until ? `Locked for ${remaining(record.resend_locked_until)}` : "No active resend lock"}
                danger={resendBlocked}
              />
              <Stat
                label="WRONG-OTP STATUS"
                value={wrongBlocked ? "BLOCKED" : record?.locked_until ? "LOCKED" : "CLEAR"}
                sub={record?.blocked_at ? `Blocked ${formatDate(record.blocked_at)}` : "Current status"}
                danger={wrongBlocked}
              />
              <Stat
                label="RESEND STATUS"
                value={resendBlocked ? "BLOCKED" : record?.resend_locked_until ? "LOCKED" : "CLEAR"}
                sub={record?.resend_locked_until ? `Until ${formatDate(record.resend_locked_until)}` : "Current status"}
                danger={resendBlocked}
              />
            </div>

            <div
              style={{
                background: "#fff",
                border: "1px solid #e9edf3",
                borderRadius: 20,
                padding: 20,
                boxShadow: "0 10px 35px rgba(15,23,42,.05)",
                marginBottom: 20,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 15, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 850, color: "#0f172a" }}>
                    OTP Control — {cleanPhone}
                  </div>
                  <div style={{ marginTop: 5, color: "#94a3b8", fontSize: 13 }}>
                    Flow: <b style={{ color: "#475569" }}>{flow}</b>
                    {record?.updated_at ? ` • Updated ${formatDate(record.updated_at)}` : ""}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                  <button
                    onClick={() => runAction("unblock_wrong")}
                    disabled={Boolean(actionLoading)}
                    style={{
                      border: "1px solid #bbf7d0",
                      background: "#f0fdf4",
                      color: "#15803d",
                      padding: "10px 14px",
                      borderRadius: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {actionLoading === "unblock_wrong" ? "Working..." : "Unblock Wrong OTP"}
                  </button>

                  <button
                    onClick={() => runAction("unblock_resend")}
                    disabled={Boolean(actionLoading)}
                    style={{
                      border: "1px solid #bfdbfe",
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      padding: "10px 14px",
                      borderRadius: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {actionLoading === "unblock_resend" ? "Working..." : "Unblock Resend"}
                  </button>

                  <button
                    onClick={() => runAction("reset")}
                    disabled={Boolean(actionLoading)}
                    style={{
                      border: "1px solid #fecdd3",
                      background: "#fff1f2",
                      color: "#be123c",
                      padding: "10px 14px",
                      borderRadius: 11,
                      fontWeight: 850,
                      cursor: "pointer",
                    }}
                  >
                    {actionLoading === "reset" ? "Resetting..." : "FULL RESET"}
                  </button>
                </div>
              </div>

              <div
                style={{
                  marginTop: 18,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
                  gap: 12,
                }}
              >
                <div style={{ border: "1px solid #eef1f5", borderRadius: 14, padding: 15 }}>
                  <div style={{ fontWeight: 800, color: "#334155" }}>Wrong OTP Lock</div>
                  <div style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>
                    Attempts: <b>{record?.wrong_attempts ?? 0}</b>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>
                    Lock:{" "}
                    {record?.locked_until ? (
                      <Badge tone={wrongBlocked ? "red" : "orange"}>
                        {wrongBlocked ? "Permanent block" : remaining(record.locked_until)}
                      </Badge>
                    ) : (
                      <Badge tone="green">Clear</Badge>
                    )}
                  </div>
                </div>

                <div style={{ border: "1px solid #eef1f5", borderRadius: 14, padding: 15 }}>
                  <div style={{ fontWeight: 800, color: "#334155" }}>Resend Lock</div>
                  <div style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>
                    Resends: <b>{record?.resend_attempts ?? 0}</b>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>
                    Lock:{" "}
                    {record?.resend_locked_until ? (
                      <Badge tone={resendBlocked ? "red" : "orange"}>
                        {resendBlocked ? "Permanent block" : remaining(record.resend_locked_until)}
                      </Badge>
                    ) : (
                      <Badge tone="green">Clear</Badge>
                    )}
                  </div>
                </div>

                <div style={{ border: "1px solid #eef1f5", borderRadius: 14, padding: 15 }}>
                  <div style={{ fontWeight: 800, color: "#334155" }}>Record</div>
                  <div style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>
                    Created: {formatDate(record?.created_at)}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>
                    Unblocked: {formatDate(record?.unblocked_at)}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                background: "#fff",
                border: "1px solid #e9edf3",
                borderRadius: 20,
                overflow: "hidden",
                boxShadow: "0 10px 35px rgba(15,23,42,.05)",
              }}
            >
              <div style={{ padding: "18px 20px", borderBottom: "1px solid #eef1f5" }}>
                <div style={{ fontSize: 18, fontWeight: 850, color: "#0f172a" }}>Recent OTP Requests</div>
                <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 4 }}>
                  OTP values are never displayed. Only security metadata is shown.
                </div>
              </div>

              {recentOtps.length === 0 ? (
                <div style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>
                  No OTP records found for this phone and flow.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["Created", "Expires", "Attempts", "Verified", "Device ID"].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "12px 16px", color: "#64748b", fontSize: 12, fontWeight: 800 }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentOtps.map((otp) => (
                        <tr key={otp.id} style={{ borderTop: "1px solid #eef1f5" }}>
                          <td style={{ padding: "13px 16px", fontSize: 13, color: "#334155" }}>{formatDate(otp.created_at)}</td>
                          <td style={{ padding: "13px 16px", fontSize: 13, color: "#334155" }}>{formatDate(otp.expires_at)}</td>
                          <td style={{ padding: "13px 16px", fontSize: 13, color: "#334155" }}>{otp.attempts ?? 0}</td>
                          <td style={{ padding: "13px 16px" }}>
                            <Badge tone={otp.verified ? "green" : "orange"}>
                              {otp.verified ? "Verified" : "Pending"}
                            </Badge>
                          </td>
                          <td style={{ padding: "13px 16px", fontSize: 12, color: "#64748b", maxWidth: 260 }}>
                            {otp.device_id || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
