import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function login(request) { return NextResponse.redirect(new URL("/admin/login", request.url)); }

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/admin") || pathname === "/admin/login") return NextResponse.next();

  const token = request.cookies.get("gamerzadda_admin_access")?.value;
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) return login(request);

  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!userRes.ok) return login(request);
    const user = await userRes.json();
    if (!user?.id) return login(request);

    const adminRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?select=id,role,status&id=eq.${encodeURIComponent(user.id)}&limit=1`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }, cache: "no-store" }
    );
    if (!adminRes.ok) return login(request);
    const rows = await adminRes.json();
    const admin = rows?.[0];
    if (!admin || admin.role !== "admin" || admin.status !== "active") return login(request);

    return NextResponse.next();
  } catch { return login(request); }
}

export const config = { matcher: ["/admin/:path*"] };
