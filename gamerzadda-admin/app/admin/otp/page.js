"use client";

import { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

/* AbuseRecord shape: see API response */
/*
  id: string;
  phone: string;
  flow: string;
  wrong_attempts: number;
  locked_until: string | null;
  is_blocked: boolean;
  blocked_at: string | null;
  unblocked_at: string | null;
  resend_attempts: number;
  resend_locked_until: string | null;
  resend_is_blocked: boolean;
  created_at: string;
  updated_at: string;
};

type OtpRecord = {
  id: string;
  phone: string;
  flow: string;
  expires_at: string | null;
  attempts: number;
  verified: boolean;
  created_at: string;
};

export default function AdminOtpPage() {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [records, setRecords] = useState([]);
  const [latestOtp, setLatestOtp] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Admin session not found. Please login again.");
    }

    return session.access_token;
  }

  function cleanPhone(value: string) {
    return value.replace(/\D/g, "");
  }

  function validPhone(value: string) {
    const clean = cleanPhone(value);

    return (
      /^[6-9]\d{9}$/.test(clean) ||
      /^91[6-9]\d{9}$/.test(clean)
    );
  }

  function formatDate(value: string | null) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function activeUntil(value: string | null) {
    if (!value) return null;

    const time = new Date(value).getTime();

    if (Number.isNaN(time) || time <= Date.now()) {
      return null;
    }

    return value;
  }

  async function searchOtp() {
    const clean = cleanPhone(phone);

    if (!validPhone(clean)) {
      setError("Enter a valid 10-digit Indian mobile number.");
      setMessage("");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMessage("");

      const token = await getToken();

      const response = await fetch(
        `/api/admin/otp?phone=${encodeURIComponent(clean)}`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const raw = await response.text();
      const result = raw ? JSON.parse(raw) : null;

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.error || "Unable to load OTP security information."
        );
      }

      setRecords(result.abuse || []);
      setLatestOtp(result.latestOtp || []);

      if (!(result.abuse || []).length) {
        setMessage("No OTP abuse record found. This number is clean.");
      }
    } catch (err: any) {
      console.error(err);
      setError(
        err?.message || "Unable to load OTP security information."
      );
      setRecords([]);
      setLatestOtp([]);
    } finally {
      setLoading(false);
    }
  }

  async function performAction(action) {
    const clean = cleanPhone(phone);

    if (!validPhone(clean)) {
      setError("Enter a valid 10-digit Indian mobile number first.");
      return;
    }

    const confirmText =
      action === "unblock_wrong"
        ? "Unblock wrong OTP attempts? Resend protection will remain active."
        : action === "unblock_resend"
          ? "Unblock OTP resend? Wrong-OTP protection will remain active."
          : "FULL RESET: Clear all OTP limits and invalidate all current OTPs for this number?";

    if (!window.confirm(confirmText)) return;

    try {
      setActionLoading(action);
      setError("");
      setMessage("");

      const token = await getToken();

      const response = await fetch("/api/admin/otp", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          phone: clean,
          action,
        }),
      });

      const raw = await response.text();
      const result = raw ? JSON.parse(raw) : null;

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.error || "Unable to update OTP protection."
        );
      }

      setRecords(result.abuse || []);
      setMessage(
        result.message || "OTP security setting updated successfully."
      );

      await searchOtp();
    } catch (err: any) {
      console.error(err);
      setError(
        err?.message || "Unable to update OTP protection."
      );
    } finally {
      setActionLoading("");
    }
  }

  const summary = useMemo(() => {
    const login = records.find((r) => r.flow === "login");
    const signup = records.find((r) => r.flow === "signup");

    return {
      login,
      signup,
      anyWrongBlocked: records.some((r) => r.is_blocked),
      anyResendBlocked: records.some((r) => r.resend_is_blocked),
    };
  }, [records]);

  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-900">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-[#ff174f]/10 blur-3xl" />
        <div className="absolute right-[-120px] top-24 h-96 w-96 rounded-full bg-purple-400/10 blur-3xl" />
        <div className="absolute bottom-[-160px] left-1/3 h-96 w-96 rounded-full bg-pink-300/10 blur-3xl" />
      </div>

      <div className="relative mx-auto min-h-screen max-w-6xl p-3 sm:p-6">
        <header className="mb-5 flex items-center justify-between rounded-[24px] border border-white/90 bg-white/80 px-4 py-3 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-2xl sm:px-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/admin")}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-xl text-slate-600 transition active:scale-95"
            >
              ‹
            </button>

            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[#ff174f]">
                GAMERZADDA ADMIN
              </p>
              <h1 className="text-base font-black sm:text-lg">
                OTP Security Control
              </h1>
            </div>
          </div>

          <div className="rounded-full bg-[#ff174f]/10 px-3 py-1.5 text-[9px] font-black tracking-wider text-[#ff174f]">
            SECURITY
          </div>
        </header>

        <section className="rounded-[28px] border border-white/90 bg-white/75 p-4 shadow-[0_25px_70px_rgba(15,23,42,0.08)] backdrop-blur-2xl sm:p-6">
          <div className="mb-5">
            <h2 className="text-xl font-black sm:text-2xl">
              Manage OTP Protection
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
              Control wrong-OTP locks, progressive resend limits and permanent
              OTP blocks for any user. Full reset also invalidates the current
              OTP.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") searchOtp();
              }}
              placeholder="Enter mobile number"
              inputMode="numeric"
              className="h-12 flex-1 rounded-2xl border border-white bg-white/90 px-4 text-sm font-semibold outline-none shadow-inner focus:border-[#ff174f]/40 focus:ring-4 focus:ring-[#ff174f]/10"
            />

            <button
              onClick={searchOtp}
              disabled={loading}
              className="h-12 rounded-2xl bg-[#ff174f] px-6 text-sm font-black text-white shadow-[0_10px_25px_rgba(255,23,79,0.22)] transition active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "Checking..." : "Check OTP"}
            </button>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">
              {error}
            </div>
          )}

          {message && (
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
              {message}
            </div>
          )}

          {(records.length > 0 || latestOtp.length > 0) && (
            <div className="mt-6 space-y-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat
                  label="Wrong OTP"
                  value={String(
                    records.reduce(
                      (sum, r) => sum + Number(r.wrong_attempts || 0),
                      0
                    )
                  )}
                />
                <Stat
                  label="Resends"
                  value={String(
                    records.reduce(
                      (sum, r) => sum + Number(r.resend_attempts || 0),
                      0
                    )
                  )}
                />
                <Stat
                  label="Wrong Block"
                  value={summary.anyWrongBlocked ? "BLOCKED" : "CLEAR"}
                  danger={summary.anyWrongBlocked}
                />
                <Stat
                  label="Resend Block"
                  value={summary.anyResendBlocked ? "BLOCKED" : "CLEAR"}
                  danger={summary.anyResendBlocked}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {["login", "signup"].map((flow) => {
                  const record =
                    flow === "login"
                      ? summary.login
                      : summary.signup;

                  return (
                    <div
                      key={flow}
                      className="rounded-[24px] border border-white bg-white/80 p-4 shadow-[0_12px_35px_rgba(15,23,42,0.06)] backdrop-blur-xl"
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-[#ff174f]">
                            OTP FLOW
                          </p>
                          <h3 className="text-lg font-black capitalize">
                            {flow}
                          </h3>
                        </div>

                        <StatusPill
                          blocked={
                            !!record &&
                            (record.is_blocked ||
                              record.resend_is_blocked)
                          }
                        />
                      </div>

                      {record ? (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <Info
                            label="Wrong attempts"
                            value={String(record.wrong_attempts)}
                          />
                          <Info
                            label="Resend attempts"
                            value={String(record.resend_attempts)}
                          />
                          <Info
                            label="Wrong lock"
                            value={
                              activeUntil(record.locked_until)
                                ? formatDate(record.locked_until)
                                : "Clear"
                            }
                          />
                          <Info
                            label="Resend lock"
                            value={
                              activeUntil(record.resend_locked_until)
                                ? formatDate(
                                    record.resend_locked_until
                                  )
                                : "Clear"
                            }
                          />
                          <Info
                            label="Permanent wrong block"
                            value={record.is_blocked ? "YES" : "NO"}
                          />
                          <Info
                            label="Permanent resend block"
                            value={
                              record.resend_is_blocked
                                ? "YES"
                                : "NO"
                            }
                          />
                        </div>
                      ) : (
                        <p className="rounded-2xl bg-slate-50 px-4 py-5 text-center text-xs text-slate-400">
                          No {flow} abuse record.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {latestOtp.length > 0 && (
                <div className="rounded-[24px] border border-white bg-white/80 p-4 shadow-[0_12px_35px_rgba(15,23,42,0.06)] backdrop-blur-xl">
                  <h3 className="mb-3 text-sm font-black">
                    Recent OTP Records
                  </h3>

                  <div className="space-y-2">
                    {latestOtp.map((otp) => (
                      <div
                        key={otp.id}
                        className="flex flex-col gap-2 rounded-2xl bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="text-xs font-black capitalize">
                            {otp.flow}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Created: {formatDate(otp.created_at)}
                          </p>
                        </div>

                        <div className="flex gap-2 text-[10px] font-bold">
                          <span className="rounded-full bg-white px-3 py-1">
                            Attempts: {otp.attempts}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 ${
                              otp.verified
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {otp.verified
                              ? "Verified"
                              : "Active"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <ActionButton
                  label="Unblock Wrong OTP"
                  description="Clear wrong-attempt lock only"
                  loading={
                    actionLoading === "unblock_wrong"
                  }
                  onClick={() =>
                    performAction("unblock_wrong")
                  }
                  tone="amber"
                />

                <ActionButton
                  label="Unblock Resend"
                  description="Clear resend cooldown/block"
                  loading={
                    actionLoading === "unblock_resend"
                  }
                  onClick={() =>
                    performAction("unblock_resend")
                  }
                  tone="blue"
                />

                <ActionButton
                  label="FULL RESET"
                  description="Clear everything + invalidate OTP"
                  loading={actionLoading === "reset"}
                  onClick={() => performAction("reset")}
                  tone="red"
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white bg-white/75 p-3 shadow-sm">
      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-black ${
          danger ? "text-red-500" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[9px] font-bold text-slate-400">{label}</p>
      <p className="mt-1 break-words text-[11px] font-black text-slate-700">
        {value}
      </p>
    </div>
  );
}

function StatusPill({ blocked }: { blocked: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-[9px] font-black ${
        blocked
          ? "bg-red-100 text-red-600"
          : "bg-emerald-100 text-emerald-700"
      }`}
    >
      {blocked ? "RESTRICTED" : "CLEAR"}
    </span>
  );
}

function ActionButton({
  label,
  description,
  loading,
  onClick,
  tone,
}: {
  label: string;
  description: string;
  loading: boolean;
  onClick: () => void;
  tone: "amber" | "blue" | "red";
}) {
  const styles = {
    amber:
      "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-100",
    blue:
      "border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100",
    red:
      "border-red-100 bg-red-50 text-red-600 hover:bg-red-100",
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`rounded-[20px] border p-4 text-left transition active:scale-[0.99] disabled:opacity-50 ${styles[tone]}`}
    >
      <p className="text-sm font-black">
        {loading ? "Processing..." : label}
      </p>
      <p className="mt-1 text-[10px] font-semibold opacity-70">
        {description}
      </p>
    </button>
  );
}
