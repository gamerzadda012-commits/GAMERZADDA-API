import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function hashValue(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function requireAdmin(request) {
  const authorization = request.headers.get("authorization") || "";
  const bearerToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (bearerToken) {
    const { data, error } = await supabaseAdmin.auth.getUser(bearerToken);
    if (!error && data?.user?.id) {
      let { data: admin, error: adminError } = await supabaseAdmin
        .from("users")
        .select("id, role, email")
        .eq("id", data.user.id)
        .maybeSingle();

      if (admin?.role !== "admin" && data.user.email) {
        const result = await supabaseAdmin
          .from("users")
          .select("id, role, email")
          .ilike("email", data.user.email.trim().toLowerCase())
          .maybeSingle();
        admin = result.data;
        adminError = result.error;
      }

      if (!adminError && admin?.role === "admin") {
        return { ok: true, userId: admin.id };
      }
      return { ok: false, error: "Access denied. Admin only." };
    }
  }

  const rawToken = request.cookies.get("gamerzadda_session")?.value;
  if (!rawToken) return { ok: false, error: "Admin login required." };

  let decodedToken = rawToken;
  try { decodedToken = decodeURIComponent(rawToken); } catch {}

  const candidates = [...new Set([
    decodedToken,
    rawToken,
    hashValue(decodedToken),
    hashValue(rawToken),
  ])];

  let session = null;
  let sessionError = null;

  for (const candidate of candidates) {
    const result = await supabaseAdmin
      .from("user_sessions")
      .select("user_id, expires_at")
      .eq("token_hash", candidate)
      .maybeSingle();

    if (result.data?.user_id) {
      session = result.data;
      sessionError = null;
      break;
    }
    sessionError = result.error;
  }

  if (sessionError || !session?.user_id) {
    return { ok: false, error: "Invalid session." };
  }

  if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: "Session expired." };
  }

  const { data: admin, error: adminError } = await supabaseAdmin
    .from("users")
    .select("id, role")
    .eq("id", session.user_id)
    .maybeSingle();

  if (adminError || admin?.role !== "admin") {
    return { ok: false, error: "Access denied. Admin only." };
  }

  return { ok: true, userId: admin.id };
}

function classifyTransaction(row) {
  const amount = Number(row?.amount || 0);
  const type = String(row?.type || "").toLowerCase();
  const description = String(row?.description || "").toLowerCase();

  let direction = amount >= 0 ? "credit" : "debit";
  if (
    type.includes("debit") ||
    type.includes("entry_fee") ||
    type.includes("withdraw") ||
    type.includes("fee") ||
    description.includes("deduct") ||
    description.includes("debit")
  ) {
    direction = "debit";
  }
  if (
    type.includes("credit") ||
    type.includes("deposit") ||
    type.includes("reward") ||
    type.includes("winning") ||
    type.includes("refund") ||
    type.includes("bonus") ||
    description.includes("added") ||
    description.includes("credited")
  ) {
    direction = amount < 0 && !type.includes("credit") ? "debit" : "credit";
  }

  let walletType = "Other";
  if (type.includes("bonus") || description.includes("bonus")) walletType = "Bonus";
  else if (type.includes("winning") || description.includes("winning")) walletType = "Winning";
  else if (
    type.includes("deposit") ||
    type.includes("entry_fee") ||
    type.includes("spin") ||
    type.includes("scratch")
  ) walletType = "Deposit";

  return {
    ...row,
    direction,
    wallet_type: walletType,
    display_amount: Math.abs(amount),
  };
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      );
    }

    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get("page") || 1));
    const pageSize = Math.min(
      100,
      Math.max(10, Number(params.get("pageSize") || 50))
    );
    const search = String(params.get("search") || "").trim();
    const direction = String(params.get("direction") || "all").toLowerCase();
    const typeFilter = String(params.get("type") || "all").toLowerCase();

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const {
      data: transactions,
      error: transactionError,
      count,
    } = await supabaseAdmin
      .from("wallet_transactions")
      .select(
        "id,user_id,amount,type,description,reference_id,created_at,status",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (transactionError) throw transactionError;

    const rows = transactions || [];
    const userIds = [
      ...new Set(rows.map((row) => String(row.user_id || "").trim()).filter(Boolean)),
    ];

    let users = [];
    if (userIds.length) {
      const { data, error } = await supabaseAdmin
        .from("users")
        .select("id,full_name,email,phone,role")
        .in("id", userIds);

      if (error) throw error;
      users = data || [];
    }

    const userMap = new Map(users.map((user) => [String(user.id), user]));

    let result = rows.map((row) => ({
      ...classifyTransaction(row),
      user: userMap.get(String(row.user_id)) || null,
    }));

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((row) => {
        const user = row.user || {};
        return [
          row.id,
          row.user_id,
          row.reference_id,
          row.type,
          row.description,
          user.full_name,
          user.email,
          user.phone,
        ].some((value) => String(value || "").toLowerCase().includes(q));
      });
    }

    if (direction === "credit" || direction === "debit") {
      result = result.filter((row) => row.direction === direction);
    }

    if (typeFilter !== "all") {
      result = result.filter(
        (row) => String(row.type || "").toLowerCase() === typeFilter
      );
    }

    const typeCounts = {};
    for (const row of rows) {
      const type = String(row.type || "unknown");
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }

    return NextResponse.json(
      {
        success: true,
        transactions: result,
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
        typeCounts,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("PAYMENT VAULT GET ERROR:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load payment vault.",
      },
      { status: 500 }
    );
  }
}
