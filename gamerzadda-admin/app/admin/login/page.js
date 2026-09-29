"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "https://api.gamerzadda.in";

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login(e) {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE}/api/admin/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            email: email.trim(),
            password,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.error || "Invalid admin email or password."
        );
      }

      router.replace("/admin/dashboard");
    } catch (err) {
      setError(
        err?.message || "Login failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f8fafc",
        color: "#111827",
        padding: 20,
      }}
    >
      <form
        onSubmit={login}
        style={{
          width: "100%",
          maxWidth: 390,
          padding: 28,
          border: "1px solid #e5e7eb",
          borderRadius: 18,
          background: "#fff",
          boxShadow:
            "0 20px 70px rgba(15,23,42,.08)",
        }}
      >
        <div
          style={{
            fontSize: 24,
            fontWeight: 900,
          }}
        >
          GAMERZADDA
        </div>

        <div
          style={{
            color: "#64748b",
            fontSize: 12,
            margin: "6px 0 24px",
          }}
        >
          Admin Panel
        </div>

        {error && (
          <div
            style={{
              padding: 10,
              borderRadius: 8,
              background: "#fff1f2",
              color: "#e11d48",
              fontSize: 11,
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        <label
          style={{
            display: "block",
            fontSize: 10,
            color: "#64748b",
            marginBottom: 6,
          }}
        >
          EMAIL
        </label>

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          autoComplete="username"
          style={input}
        />

        <label
          style={{
            display: "block",
            fontSize: 10,
            color: "#64748b",
            margin: "14px 0 6px",
          }}
        >
          PASSWORD
        </label>

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
          autoComplete="current-password"
          style={input}
        />

        <button
          disabled={loading}
          type="submit"
          style={{
            width: "100%",
            height: 44,
            marginTop: 20,
            border: 0,
            borderRadius: 9,
            background: "#ff174f",
            color: "#fff",
            fontWeight: 900,
            cursor: loading
              ? "not-allowed"
              : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </main>
  );
}

const input = {
  width: "100%",
  height: 42,
  boxSizing: "border-box",
  border: "1px solid #d1d5db",
  borderRadius: 9,
  background: "#fff",
  color: "#111827",
  padding: "0 11px",
  outline: "none",
};