"use client";

import Link from "next/link";
import AdminShell from "../AdminShell";

const cards = [
  ["👥", "Members", "/admin/members"],
  ["💳", "Deposits", "/admin/deposits"],
  ["💸", "Withdrawals", "/admin/withdrawals"],
  ["🏆", "Tournaments", "/admin/tournaments"],
  ["🎧", "Support", "/admin/support"],
  ["🔔", "Notifications", "/admin/notifications"],
];

export default function Dashboard() {
  return (
    <AdminShell title="Dashboard">
      <div className="stats">
        <div>
          <span>Total Members</span>
          <strong>—</strong>
        </div>

        <div>
          <span>Active Tournaments</span>
          <strong>—</strong>
        </div>

        <div>
          <span>Pending Deposits</span>
          <strong>—</strong>
        </div>

        <div>
          <span>Pending Withdrawals</span>
          <strong>—</strong>
        </div>
      </div>

      <div className="grid">
        {cards.map(([icon, title, href]) => (
          <Link
            href={href}
            className="module"
            key={title}
          >
            <span>{icon}</span>

            <div>
              <h2>{title}</h2>
              <p>
                Open {title.toLowerCase()} management
              </p>
            </div>

            <b>→</b>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}