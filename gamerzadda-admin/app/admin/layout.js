"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://api.gamerzadda.in";

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  const isLogin = pathname === "/admin/login";
  const [checking, setChecking] = useState(!isLogin);

  useEffect(() => {
    if (isLogin) {
      setChecking(false);
      return;
    }

    let alive = true;

    async function checkAdminSession() {
      try {
        const response = await fetch(
          `${API_BASE}/api/admin/session`,
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          }
        );

        if (!response.ok) {
          if (alive) {
            router.replace("/admin/login");
          }
          return;
        }

        const data = await response.json();

        if (!data?.success || !data?.authenticated) {
          if (alive) {
            router.replace("/admin/login");
          }
          return;
        }

        if (alive) {
          setChecking(false);
        }
      } catch (error) {
        console.error(
          "ADMIN SESSION CHECK ERROR:",
          error
        );

        if (alive) {
          router.replace("/admin/login");
        }
      }
    }

    checkAdminSession();

    return () => {
      alive = false;
    };
  }, [isLogin, pathname, router]);

  if (isLogin) {
    return children;
  }

  if (checking) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f8fafc",
          color: "#111827",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 34,
              height: 34,
              border: "3px solid #e5e7eb",
              borderTopColor: "#ff174f",
              borderRadius: "50%",
              margin: "0 auto 12px",
              animation: "spin 0.8s linear infinite",
            }}
          />

          <b>Checking admin access...</b>
        </div>
      </main>
    );
  }

  return children;
}