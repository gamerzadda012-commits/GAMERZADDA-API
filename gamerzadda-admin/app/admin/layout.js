"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://api.gamerzadda.in";

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  const isLoginPage = pathname === "/admin/login";

  const [checking, setChecking] = useState(!isLoginPage);
  const [authenticated, setAuthenticated] = useState(isLoginPage);

  useEffect(() => {
    if (isLoginPage) {
      setChecking(false);
      setAuthenticated(true);
      return;
    }

    let cancelled = false;

    const checkSession = async () => {
      try {
        setChecking(true);

        const response = await fetch(
          `${API_BASE}/api/admin/session`,
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            headers: {
              Accept: "application/json",
            },
          }
        );

        if (cancelled) return;

        if (!response.ok) {
          console.error(
            "ADMIN SESSION HTTP ERROR:",
            response.status
          );

          setAuthenticated(false);
          setChecking(false);

          router.replace("/admin/login");
          return;
        }

        const data = await response.json();

        console.log("ADMIN SESSION:", data);

        if (
          data?.success === true &&
          data?.authenticated === true
        ) {
          setAuthenticated(true);
          setChecking(false);
          return;
        }

        setAuthenticated(false);
        setChecking(false);

        router.replace("/admin/login");
      } catch (error) {
        if (cancelled) return;

        console.error(
          "ADMIN SESSION CHECK ERROR:",
          error
        );

        setAuthenticated(false);
        setChecking(false);

        router.replace("/admin/login");
      }
    };

    checkSession();

    return () => {
      cancelled = true;
    };
  }, [isLoginPage, router]);

  if (isLoginPage) {
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
              width: 36,
              height: 36,
              border: "3px solid #e5e7eb",
              borderTopColor: "#ff174f",
              borderRadius: "50%",
              margin: "0 auto 14px",
              animation: "adminSpin 0.8s linear infinite",
            }}
          />
          <b>Checking admin access...</b>
          <style jsx>{`
            @keyframes adminSpin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </main>
    );
  }

  if (!authenticated) {
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
          <b>Redirecting to admin login...</b>
        </div>
      </main>
    );
  }

  return children;
}
