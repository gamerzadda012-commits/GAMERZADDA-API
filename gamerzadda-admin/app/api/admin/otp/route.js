import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function sha256(v) {
  return crypto.createHash("sha256").update(v).digest("hex");
}

async function requireAdmin(request) {
  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token) {
      const { data } = await supabase.auth.getUser(token);
      if (data?.user?.id) {
        const { data: u } = await supabase.from("users").select("id,role").eq("id", data.user.id).maybeSingle();
        if (u?.role === "admin") return u;
      }
    }
  }

  const cookie = request.cookies.get("gamerzadda_session")?.value;
  if (!cookie) throw new Error("UNAUTHORIZED");

  const candidates = [...new Set([cookie, decodeURIComponent(cookie), sha256(cookie), sha256(decodeURIComponent(cookie))])];
  for (const token of candidates) {
    const { data: s } = await supabase
      .from("user_sessions")
      .select("user_id,expires_at")
      .eq("session_token", token)
      .maybeSingle();

    if (s?.user_id && (!s.expires_at || new Date(s.expires_at) > new Date())) {
      const { data: u } = await supabase.from("users").select("id,role").eq("id", s.user_id).maybeSingle();
      if (u?.role === "admin") return u;
    }
  }
  throw new Error("UNAUTHORIZED");
}

function clientIp(request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip") || null;
}

function statusOf(row) {
  if (row.verified) return "verified";
  if (row.expires_at && new Date(row.expires_at) <= new Date()) return "expired";
  return "active";
}

export async function GET(request) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);

    const phone = (searchParams.get("phone") || "").replace(/\D/g, "");
    const flow = searchParams.get("flow") || "all";
    const status = searchParams.get("status") || "all";
    const period = searchParams.get("period") || "7";
    const ip = (searchParams.get("ip") || "").trim();
    const sort = searchParams.get("sort") === "oldest" ? "oldest" : "newest";
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 200), 1), 500);

    let q = supabase
      .from("otp_codes")
      .select("id,phone,flow,expires_at,attempts,verified,created_at,ip_address")
      .limit(limit);

    if (phone) q = q.ilike("phone", `%${phone}%`);
    if (flow !== "all") q = q.eq("flow", flow);
    if (ip) q = q.ilike("ip_address", `%${ip}%`);

    if (period !== "all") {
      const days = Number(period);
      if (Number.isFinite(days)) {
        const since = new Date(Date.now() - days * 86400000).toISOString();
        q = q.gte("created_at", since);
      }
    }

    q = q.order("created_at", { ascending: sort === "oldest" });
    const { data: rows, error } = await q;
    if (error) throw error;

    let requests = (rows || []).map(x => ({ ...x, status: statusOf(x) }));

    if (status !== "all") requests = requests.filter(x => x.status === status);

    const phoneMap = {};
    const ipMap = {};
    for (const x of requests) {
      phoneMap[x.phone] = (phoneMap[x.phone] || 0) + 1;
      if (x.ip_address) ipMap[x.ip_address] = (ipMap[x.ip_address] || 0) + 1;
    }

    const phoneRanking = Object.entries(phoneMap)
      .map(([phone, count]) => ({ phone, count }))
      .sort((a,b) => b.count - a.count);

    const ipRanking = Object.entries(ipMap)
      .map(([ip, count]) => ({ ip, count }))
      .sort((a,b) => b.count - a.count);

    const { data: abuse } = await supabase
      .from("otp_abuse_limits")
      .select("phone,is_blocked,resend_is_blocked")
      .or("is_blocked.eq.true,resend_is_blocked.eq.true");

    const stats = {
      total: requests.length,
      uniquePhones: new Set(requests.map(x => x.phone)).size,
      uniqueIps: new Set(requests.map(x => x.ip_address).filter(Boolean)).size,
      failed: requests.filter(x => x.status === "failed" || x.status === "expired").length,
      blocked: new Set((abuse || []).map(x => x.phone)).size,
    };

    return NextResponse.json({ success: true, requests, stats, phoneRanking, ipRanking });
  } catch (e) {
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ success:false, message:"Unauthorized" }, { status:401 });
    console.error("ADMIN OTP GET:", e);
    return NextResponse.json({ success:false, message:"Unable to load OTP activity" }, { status:500 });
  }
}

export async function PATCH(request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const phone = String(body.phone || "").replace(/\D/g, "");
    const flow = body.flow || "login";
    const action = body.action;

    if (!phone) return NextResponse.json({ success:false, message:"Phone is required" }, { status:400 });

    const update = action === "unblock_wrong"
      ? { wrong_attempts: 0, locked_until: null, is_blocked: false, blocked_at: null, unblocked_at: new Date().toISOString() }
      : action === "unblock_resend"
      ? { resend_attempts: 0, resend_locked_until: null, resend_is_blocked: false }
      : action === "reset"
      ? { wrong_attempts: 0, locked_until: null, is_blocked: false, blocked_at: null, resend_attempts: 0, resend_locked_until: null, resend_is_blocked: false, unblocked_at: new Date().toISOString() }
      : null;

    if (!update) return NextResponse.json({ success:false, message:"Invalid action" }, { status:400 });

    const { error } = await supabase.from("otp_abuse_limits").upsert({ phone, flow, ...update }, { onConflict:"phone,flow" });
    if (error) throw error;

    return NextResponse.json({ success:true, message:"OTP controls updated" });
  } catch (e) {
    if (e?.message === "UNAUTHORIZED") return NextResponse.json({ success:false, message:"Unauthorized" }, { status:401 });
    console.error("ADMIN OTP PATCH:", e);
    return NextResponse.json({ success:false, message:e.message || "Unable to update OTP controls" }, { status:500 });
  }
}
