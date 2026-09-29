"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const items = [
  ["/admin/dashboard", "📊", "Dashboard"],
  ["/admin/members", "👥", "Members"],
  ["/admin/deposits", "💳", "Deposits"],
  ["/admin/withdrawals", "💸", "Withdrawals"],
  ["/admin/tournaments", "🏆", "Tournaments"],
  ["/admin/tournaments/create", "➕", "Create Tournament"],
  ["/admin/tournaments/past-matches", "📚", "Past Matches"],
  ["/admin/support", "🎧", "Support"],
  ["/admin/banners", "🖼️", "Banners"],
  ["/admin/notifications", "🔔", "Notifications"],
  ["/admin/analytics", "📈", "Analytics"],
  ["/admin/otp", "🔐", "OTP"],
];

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://api.gamerzadda.in";

export default function AdminShell({ title, children }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    try {
      await fetch(`${API_BASE}/api/admin/logout`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
    } catch (error) {
      console.error("ADMIN LOGOUT ERROR:", error);
    }

    window.location.href = "/admin/login";
  }

  return (
    <div className="admin-root">
      <aside className="sidebar">
        <div className="brand">
          <span>G</span>

          <div>
            GAMERZADDA
            <small>ADMIN PANEL</small>
          </div>
        </div>

        <nav>
          {items.map(([href, icon, label]) => (
            <Link
              key={href}
              href={href}
              className={
                pathname === href ||
                pathname?.startsWith(href + "/")
                  ? "active"
                  : ""
              }
            >
              <b>{icon}</b>
              {label}
            </Link>
          ))}
        </nav>

        <div className="side-foot">
          Admin Console
          <br />
          <small>GamerzAdda</small>
        </div>
      </aside>

      <main className="main">
        <header className="top">
          <div>
            <h1>{title}</h1>
            <p>Manage GamerzAdda from one place</p>
          </div>

          <button
            onClick={logout}
            className="logout"
            type="button"
          >
            Logout
          </button>
        </header>

        <section className="content">
          {children}
        </section>
      </main>
    </div>
  );
}