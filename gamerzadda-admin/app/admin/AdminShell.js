"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const items = [
  ["/admin/dashboard", "📊", "Dashboard"],
  ["/admin/members", "👥", "Members"],
  ["/admin/deposits", "💳", "Deposits"],
  ["/admin/withdrawals", "💸", "Withdrawals"],
  ["/admin/payment-vault", "💰", "Payment Vault"],
  ["/admin/tournaments", "🏆", "Tournaments"],
  ["/admin/tournaments/create", "➕", "Create Tournament"],
  ["/admin/tournaments/past-matches", "📚", "Past Matches"],
  ["/admin/support", "🎧", "Support"],
  ["/admin/banners", "🖼️", "Banners"],
  ["/admin/notifications", "🔔", "Notifications"],
  ["/admin/analytics", "📈", "Analytics"],
  ["/admin/otp", "🔐", "OTP"],
  ["/admin/app-version", "📱", "App Version"],
  ["/admin/app-popup", "🪟", "App Popup"],
];

export default function AdminShell({ children }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("gamerzadda_admin_sidebar_collapsed");
      if (saved === "true") {
        setCollapsed(true);
      }
    } catch (error) {
      console.error("SIDEBAR STORAGE ERROR:", error);
    }
  }, []);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;

      try {
        localStorage.setItem(
          "gamerzadda_admin_sidebar_collapsed",
          String(next)
        );
      } catch (error) {
        console.error("SIDEBAR STORAGE ERROR:", error);
      }

      return next;
    });
  }

  return (
    <>
      <div className={`admin-root ${collapsed ? "sidebar-collapsed" : ""}`}>
        <aside className="sidebar">
          <div className="brand">
            <span>G</span>

            <div className="brand-text">
              GAMERZADDA
              <small>ADMIN PANEL</small>
            </div>
          </div>

          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? "☰" : "✕"}
          </button>

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
                title={collapsed ? label : undefined}
              >
                <b>{icon}</b>
                <span className="nav-label">{label}</span>
              </Link>
            ))}
          </nav>

          <div className="side-foot">
            <span className="side-foot-full">
              Admin Console
              <br />
              <small>GamerzAdda</small>
            </span>

            <span className="side-foot-short">G</span>
          </div>
        </aside>

        <main className="main">
          <section className="content">
            {children}
          </section>
        </main>
      </div>

      <style jsx global>{`
        .admin-root {
          min-height: 100vh;
          display: flex;
          width: 100%;
        }

        .admin-root .sidebar {
          width: 250px;
          min-width: 250px;
          transition:
            width 0.25s ease,
            min-width 0.25s ease;
          position: relative;
          overflow: hidden;
        }

        .admin-root .main {
          flex: 1;
          min-width: 0;
          width: 0;
          margin: 0;
          padding: 0;
          transition: margin-left 0.25s ease;
        }

        .admin-root .content {
          width: 100% !important;
          max-width: none !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
        }

        .admin-root .brand {
          position: relative;
          padding-right: 52px;
        }

        .admin-root .brand-text {
          transition:
            opacity 0.2s ease,
            visibility 0.2s ease;
          white-space: nowrap;
        }

        .sidebar-toggle {
          position: absolute;
          top: 18px;
          right: 12px;
          width: 34px;
          height: 34px;
          border: 0;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.1);
          color: inherit;
          cursor: pointer;
          font-size: 17px;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
          transition:
            background 0.2s ease,
            transform 0.2s ease;
        }

        .sidebar-toggle:hover {
          background: rgba(255, 255, 255, 0.18);
          transform: scale(1.04);
        }

        .admin-root .sidebar nav a {
          display: flex;
          align-items: center;
          gap: 12px;
          white-space: nowrap;
        }

        .admin-root .sidebar nav a b {
          flex: 0 0 24px;
          width: 24px;
          text-align: center;
        }

        .nav-label {
          transition:
            opacity 0.18s ease,
            width 0.25s ease;
          overflow: hidden;
        }

        .side-foot {
          transition:
            opacity 0.2s ease,
            visibility 0.2s ease;
        }

        .side-foot-short {
          display: none;
        }

        .admin-root.sidebar-collapsed .sidebar {
          width: 76px;
          min-width: 76px;
        }

        .admin-root.sidebar-collapsed .brand {
          padding-right: 0;
          justify-content: center;
        }

        .admin-root.sidebar-collapsed .brand-text {
          display: none;
        }

        .admin-root.sidebar-collapsed .sidebar-toggle {
          top: 14px;
          right: 8px;
          width: 30px;
          height: 30px;
        }

        .admin-root.sidebar-collapsed .sidebar nav a {
          justify-content: center;
          padding-left: 0;
          padding-right: 0;
          gap: 0;
        }

        .admin-root.sidebar-collapsed .nav-label {
          display: none;
        }

        .admin-root.sidebar-collapsed .side-foot-full {
          display: none;
        }

        .admin-root.sidebar-collapsed .side-foot-short {
          display: block;
          text-align: center;
          font-weight: 800;
        }

        .admin-root.sidebar-collapsed .main {
          flex: 1;
        }

        @media (max-width: 900px) {
          .admin-root .sidebar {
            width: 76px;
            min-width: 76px;
          }

          .admin-root .brand-text,
          .admin-root .nav-label,
          .admin-root .side-foot-full {
            display: none;
          }

          .admin-root .sidebar nav a {
            justify-content: center;
            padding-left: 0;
            padding-right: 0;
            gap: 0;
          }

          .admin-root .side-foot-short {
            display: block;
            text-align: center;
            font-weight: 800;
          }

          .admin-root .brand {
            padding-right: 0;
            justify-content: center;
          }
        }
      `}</style>
    </>
  );
}
