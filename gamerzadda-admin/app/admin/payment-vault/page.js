 "use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell from "../AdminShell";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://api.gamerzadda.in";

function money(value) {
  const amount = Number(value || 0);
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function dateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortId(value) {
  if (!value) return "—";
  const text = String(value);
  return text.length > 18 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text;
}

export default function PaymentVaultPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const query = new URLSearchParams({
        page: String(page),
        pageSize: "50",
        search,
        type,
        status,
      });

      const response = await fetch(
        `/api/admin/payment-vault?${query.toString()}`,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Unable to load payment vault.");
      }

      setRows(Array.isArray(data.transactions) ? data.transactions : []);
      setTotal(Number(data.total || 0));
      setTotalPages(Number(data.totalPages || 1));
    } catch (err) {
      console.error("PAYMENT VAULT LOAD ERROR:", err);
      setError(err?.message || "Unable to load payment vault.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, type, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const stats = useMemo(() => {
    let credit = 0;
    let debit = 0;

    for (const row of rows) {
      if (row.direction === "credit") credit += Number(row.display_amount || 0);
      else debit += Number(row.display_amount || 0);
    }

    return { credit, debit };
  }, [rows]);

  return (
    <AdminShell title="Payment Vault">
      <div className="vault">
        <div className="hero">
          <div>
            <div className="eyebrow">WALLET AUDIT</div>
            <h2>Payment Vault</h2>
            <p>
              Complete wallet activity across GamerzAdda, newest transactions first.
            </p>
          </div>
          <button className="refresh" type="button" onClick={load}>
            ↻ Refresh
          </button>
        </div>

        <div className="stats">
          <div className="stat">
            <span>Total Transactions</span>
            <strong>{total.toLocaleString("en-IN")}</strong>
          </div>
          <div className="stat credit-stat">
            <span>Visible Credit</span>
            <strong>{money(stats.credit)}</strong>
          </div>
          <div className="stat debit-stat">
            <span>Visible Debit</span>
            <strong>{money(stats.debit)}</strong>
          </div>
        </div>

        <div className="filters">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search user, name, email, phone, transaction ID, reference..."
          />

          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Types</option>
            {Array.from(
              new Set(rows.map((row) => String(row.type || "unknown")))
            )
              .sort()
              .map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
          </select>

          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Status</option>
            <option value="success">🟢 Success</option>
            <option value="pending">🟡 Pending</option>
            <option value="failed">🔴 Failed</option>
          </select>
        </div>

        {error ? <div className="error">{error}</div> : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User / Admin</th>
                <th>Real Name</th>
                <th>Phone / Email</th>
                <th>Amount</th>
                <th>Wallet / Type</th>
                <th>Description</th>
                <th>Transaction ID</th>
                <th>Reference ID</th>
                <th>Status</th>
                <th>Date &amp; Time</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="10" className="empty">
                    Loading Payment Vault...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan="10" className="empty">
                    No transactions found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const user = row.user || {};
                  const isCredit = row.direction === "credit";

                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="user-cell">
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              alt=""
                              className="avatar"
                              style={{
                                objectFit: "cover",
                                width: 42,
                                height: 42,
                                borderRadius: "50%",
                              }}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="avatar">
                              {String(user.full_name || "U")
                                .trim()
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                          )}
                          <div>
                            <b>{user.role === "admin" ? "👨‍💼 Admin" : "👤 User"}</b>
                            <small>{shortId(row.user_id)}</small>
                          </div>
                        </div>
                      </td>

                      <td>
                        <b>{user.full_name || "—"}</b>
                      </td>

                      <td>
                        <div>{user.phone || "—"}</div>
                        <small>{user.email || "—"}</small>
                      </td>

                      <td>
                        <strong className={isCredit ? "credit" : "debit"}>
                          {isCredit ? "+" : "-"}
                          {money(row.display_amount)}
                        </strong>
                      </td>

                      <td>
                        <span className="type-pill">{row.wallet_type}</span>
                        <small>{row.type || "—"}</small>
                      </td>

                      <td className="description">{row.description || "—"}</td>

                      <td className="mono">{shortId(row.id)}</td>
                      <td className="mono">{shortId(row.reference_id)}</td>

                      <td>
                        {(() => {
                          const status = String(
                            row.status || "SUCCESS"
                          ).trim().toLowerCase();

                          let background = "#dcfce7";
                          let color = "#15803d";
                          let border = "#86efac";
                          let label = "SUCCESS";

                          if (status === "pending") {
                            background = "#fef3c7";
                            color = "#a16207";
                            border = "#facc15";
                            label = "PENDING";
                          } else if (
                            status === "failed" ||
                            status === "failure"
                          ) {
                            background = "#fee2e2";
                            color = "#dc2626";
                            border = "#fca5a5";
                            label = "FAILED";
                          }

                          return (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                minWidth: 82,
                                padding: "6px 10px",
                                borderRadius: 999,
                                background,
                                color,
                                border: `1px solid ${border}`,
                                fontSize: 11,
                                fontWeight: 900,
                                letterSpacing: "0.04em",
                              }}
                            >
                              {label}
                            </span>
                          );
                        })()}
                      </td>

                      <td>{dateTime(row.created_at)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="bottom">
          <span>
            Page {page} of {totalPages} · {total.toLocaleString("en-IN")} transactions
          </span>

          <div className="pager">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              ← Previous
            </button>

            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .vault {
          color: #111827;
        }

        .hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 18px;
        }

        .eyebrow {
          color: #ff174f;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
        }

        h2 {
          margin: 4px 0;
          font-size: 27px;
        }

        .hero p {
          margin: 0;
          color: #6b7280;
        }

        .refresh,
        .pager button {
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #111827;
          border-radius: 10px;
          padding: 10px 14px;
          font-weight: 700;
          cursor: pointer;
        }

        .refresh:hover,
        .pager button:hover:not(:disabled) {
          border-color: #ff174f;
        }

        .stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-bottom: 16px;
        }

        .stat {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 15px 17px;
          box-shadow: 0 5px 20px rgba(15, 23, 42, 0.04);
        }

        .stat span {
          display: block;
          color: #6b7280;
          font-size: 12px;
          font-weight: 700;
          margin-bottom: 6px;
        }

        .stat strong {
          font-size: 22px;
        }

        .credit-stat strong,
        .credit {
          color: #079455;
        }

        .debit-stat strong,
        .debit {
          color: #dc2626;
        }

        .filters {
          display: grid;
          grid-template-columns: 1fr 190px 190px;
          gap: 10px;
          margin-bottom: 14px;
        }

        .filters input,
        .filters select {
          width: 100%;
          min-height: 44px;
          border: 1px solid #e5e7eb;
          background: #fff;
          border-radius: 11px;
          padding: 0 13px;
          color: #111827;
          outline: none;
        }

        .filters input:focus,
        .filters select:focus {
          border-color: #ff174f;
          box-shadow: 0 0 0 3px rgba(255, 23, 79, 0.08);
        }

        .error {
          margin-bottom: 12px;
          border: 1px solid #fecaca;
          background: #fef2f2;
          color: #b91c1c;
          border-radius: 10px;
          padding: 12px;
        }

        .table-wrap {
          overflow: auto;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          box-shadow: 0 5px 20px rgba(15, 23, 42, 0.04);
        }

        table {
          width: 100%;
          min-width: 1500px;
          border-collapse: collapse;
          font-size: 13px;
        }

        th {
          position: sticky;
          top: 0;
          z-index: 1;
          background: #f8fafc;
          color: #475569;
          text-align: left;
          white-space: nowrap;
          padding: 13px 12px;
          border-bottom: 1px solid #e5e7eb;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        td {
          padding: 13px 12px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
        }

        tr:last-child td {
          border-bottom: 0;
        }

        .user-cell {
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 150px;
        }

        .avatar {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #ffe4eb;
          color: #ff174f;
          font-weight: 800;
        }

        small {
          display: block;
          color: #94a3b8;
          font-size: 11px;
          margin-top: 3px;
        }

        .direction,
        .type-pill,
        .status {
          display: inline-flex;
          align-items: center;
          white-space: nowrap;
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 10px;
          font-weight: 800;
        }

        .credit-bg {
          color: #047857;
          background: #ecfdf5;
        }

        .debit-bg {
          color: #b91c1c;
          background: #fef2f2;
        }

        .type-pill {
          background: #f1f5f9;
          color: #334155;
          margin-bottom: 2px;
        }

        .status {
          color: #166534;
          background: #f0fdf4;
        }

        .description {
          max-width: 280px;
          min-width: 220px;
          color: #475569;
        }

        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          color: #64748b;
          white-space: nowrap;
        }

        .empty {
          text-align: center;
          padding: 45px !important;
          color: #64748b;
        }

        .bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 2px;
          color: #64748b;
          font-size: 13px;
        }

        .pager {
          display: flex;
          gap: 8px;
        }

        .pager button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        @media (max-width: 900px) {
          .stats {
            grid-template-columns: 1fr;
          }

          .filters {
            grid-template-columns: 1fr;
          }

          .hero,
          .bottom {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </AdminShell>
  );
}
