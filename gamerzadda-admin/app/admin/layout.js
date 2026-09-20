"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase.js";

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/admin/login";
  const [checking, setChecking] = useState(!isLogin);

  useEffect(() => {
    if (isLogin) return;

    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        if (alive) router.replace("/admin/login");
        return;
      }

      const { data: admin, error } = await supabase
        .from("users")
        .select("role,status")
        .eq("id", session.user.id)
        .maybeSingle();

      if (error || !admin || admin.role !== "admin" || (admin.status && admin.status !== "active")) {
        await supabase.auth.signOut();
        if (alive) router.replace("/admin/login");
        return;
      }

      if (alive) setChecking(false);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && pathname !== "/admin/login") router.replace("/admin/login");
    });

    return () => {
      alive = false;
      listener?.subscription?.unsubscribe();
    };
  }, [isLogin, pathname, router]);

  if (isLogin) return children;
  if (checking) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f8fafc", color: "#111827" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 34, height: 34, border: "3px solid #e5e7eb", borderTopColor: "#ff174f", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
          <b>Checking admin access...</b>
        </div>
      </main>
    );
  }

  return children;
}
