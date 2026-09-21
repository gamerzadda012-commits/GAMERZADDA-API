import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

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
  // 1) Prefer the active Supabase Auth session sent by the admin page.
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

      // Some GamerzAdda installs have a users.id that differs from auth.users.id.
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

  // 2) Backward-compatible GamerzAdda custom session cookie.
  const rawToken = request.cookies.get("gamerzadda_session")?.value;
  if (!rawToken) return { ok: false, error: "Admin login required." };

  let decodedToken = rawToken;
  try { decodedToken = decodeURIComponent(rawToken); } catch {}

  // Older session implementations may have stored either the raw token or
  // its SHA-256 hash in user_sessions.token_hash. Try both safely.
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

export async function GET(request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: 401 });

    const userId = request.nextUrl.searchParams.get("userId");

    if (userId) {
      const [walletResult, historyResult, memberResult] = await Promise.all([
        supabaseAdmin
          .from("wallet_balances")
          .select("user_id, deposit_balance, bonus_balance, winning_balance, updated_at")
          .eq("user_id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("wallet_transactions")
          .select("id, user_id, amount, type, description, reference_id, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(8),
        supabaseAdmin
          .from("users")
          .select("id, referral_code, referred_by")
          .eq("id", userId)
          .maybeSingle(),
      ]);

      if (walletResult.error) throw walletResult.error;
      if (historyResult.error) throw historyResult.error;
      if (memberResult.error) throw memberResult.error;

      const member = memberResult.data;
      let referredUsers = [];
      if (member?.referral_code) {
        const { data, error: referralError } = await supabaseAdmin
          .from("users")
          .select("id, full_name, email, game_name, free_fire_uid, referral_code, referred_by, created_at")
          .eq("referred_by", member.referral_code)
          .order("created_at", { ascending: false })
          .limit(20);
        if (referralError) throw referralError;
        referredUsers = data || [];
      }

      return NextResponse.json({
        success: true,
        wallet: walletResult.data || { deposit_balance: 0, bonus_balance: 0, winning_balance: 0 },
        history: historyResult.data || [],
        referral: { users: referredUsers, total_referrals: referredUsers.length },
      }, { headers: { "Cache-Control": "no-store" } });
    }
    const { data: members, error: membersError } = await supabaseAdmin
      .from("users")
      .select("*")
      .order("created_at", { ascending: false });
    if (membersError) throw membersError;

    const rows = members || [];
    const ids = rows.map((m) => m.id).filter(Boolean);
    const walletMap = {};

    // Build a robust profile-photo map. Depending on the GamerzAdda version,
    // photos can live in users, auth metadata, or a separate profile table.
    const authProfileMap = {};
    const profileKeys = [
      "profile_pic", "profile_picture", "profile_image", "profile_image_url",
      "profile_photo", "profile_photo_url", "avatar_url", "photo_url",
      "image_url", "avatar", "photo", "picture", "profile_url", "image",
      "avatarUrl", "photoUrl", "profileUrl"
    ];

    function extractProfileUrl(value) {
      if (!value) return "";
      if (typeof value === "string") return value.trim();
      if (typeof value === "object") {
        for (const key of ["url", "publicUrl", "public_url", "href", "src", "path"]) {
          if (typeof value?.[key] === "string" && value[key].trim()) return value[key].trim();
        }
      }
      return "";
    }

    function extractProfileFromObject(obj) {
      if (!obj) return "";
      for (const key of profileKeys) {
        const found = extractProfileUrl(obj[key]);
        if (found) return found;
      }
      // Some versions keep profile data nested inside metadata/profile.
      for (const nestedKey of ["user_metadata", "metadata", "profile", "data"]) {
        const nested = obj?.[nestedKey];
        if (nested && typeof nested === "object") {
          for (const key of profileKeys) {
            const found = extractProfileUrl(nested[key]);
            if (found) return found;
          }
        }
      }
      return "";
    }

    try {
      // listUsers is paginated; walk pages so this also works with >1000 users.
      for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
        const { data: authPage } = await supabaseAdmin.auth.admin.listUsers({
          page: pageNo,
          perPage: 1000,
        });
        const authUsers = authPage?.users || [];
        if (!authUsers.length) break;

        for (const authUser of authUsers) {
          const url = extractProfileFromObject(authUser?.user_metadata || {});
          if (url) {
            authProfileMap[authUser.id] = String(url);
            if (authUser.email) authProfileMap[`email:${String(authUser.email).toLowerCase()}`] = String(url);
          }
        }
        if (authUsers.length < 1000) break;
      }
    } catch (profileError) {
      console.warn("Auth profile photo lookup skipped:", profileError?.message || profileError);
    }

    // Also check common profile-table variants. Missing tables are intentionally ignored.
    const profileTables = ["profiles", "user_profiles", "user_profile", "profile"];
    for (const tableName of profileTables) {
      try {
        const { data: profileRows, error: profileError } = await supabaseAdmin
          .from(tableName)
          .select("*")
          .limit(5000);
        if (profileError || !Array.isArray(profileRows)) continue;

        for (const row of profileRows) {
          const url = extractProfileFromObject(row);
          if (!url) continue;
          const rowUserId = row?.user_id || row?.userId || row?.uid || row?.id;
          const rowEmail = row?.email;
          if (rowUserId) authProfileMap[String(rowUserId)] = String(url);
          if (rowEmail) authProfileMap[`email:${String(rowEmail).toLowerCase()}`] = String(url);
        }
      } catch (_) {
        // Table does not exist in this installation; continue with other sources.
      }
    }

    if (ids.length) {
      const { data: wallets, error: walletError } = await supabaseAdmin
        .from("wallet_balances")
        .select("user_id, deposit_balance, bonus_balance, winning_balance")
        .in("user_id", ids);
      if (walletError) throw walletError;

      for (const wallet of wallets || []) {
        walletMap[wallet.user_id] = {
          deposit_balance: Number(wallet.deposit_balance || 0),
          bonus_balance: Number(wallet.bonus_balance || 0),
          winning_balance: Number(wallet.winning_balance || 0),
        };
      }
    }

    return NextResponse.json({
      success: true,
      members: rows.map((member) => ({
        ...member,
        // Prefer a real photo from the users row; otherwise use Supabase Auth metadata.
        profile_pic: extractProfileFromObject(member) ||
          authProfileMap[member.id] ||
          (member.email ? authProfileMap[`email:${String(member.email).toLowerCase()}`] : "") ||
          "",
        wallet_total: Number(walletMap[member.id]?.deposit_balance || 0) + Number(walletMap[member.id]?.bonus_balance || 0) + Number(walletMap[member.id]?.winning_balance || 0),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin members API GET error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Unable to load members." }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: 401 });

    const body = await request.json();
    const userId = String(body?.userId || "").trim();
    const walletType = String(body?.walletType || "").trim();
    const action = String(body?.action || "").trim();
    const amount = Number(body?.amount);
    const reason = String(body?.reason || "").trim();

    const columns = {
      bonus: "bonus_balance",
      deposit: "deposit_balance",
      winning: "winning_balance",
    };
    const column = columns[walletType];

    if (!userId || !column) return NextResponse.json({ success: false, error: "Invalid member or wallet type." }, { status: 400 });
    if (!["add", "deduct"].includes(action)) return NextResponse.json({ success: false, error: "Invalid wallet action." }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ success: false, error: "Enter a valid amount." }, { status: 400 });

    const { data: current, error: fetchError } = await supabaseAdmin
      .from("wallet_balances")
      .select("deposit_balance, bonus_balance, winning_balance")
      .eq("user_id", userId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!current) return NextResponse.json({ success: false, error: "Wallet row not found for this member." }, { status: 404 });

    const oldValue = Number(current[column] || 0);
    const newValue = Number((action === "add" ? oldValue + amount : oldValue - amount).toFixed(2));
    if (newValue < 0) return NextResponse.json({ success: false, error: `${walletType.toUpperCase()} balance cannot go below ₹0.` }, { status: 400 });

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("wallet_balances")
      .update({ [column]: newValue, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .select("deposit_balance, bonus_balance, winning_balance, updated_at")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return NextResponse.json({ success: false, error: "Wallet update failed." }, { status: 409 });

    try {
      await supabaseAdmin.from("wallet_transactions").insert({
        user_id: userId,
        amount: action === "add" ? amount : -amount,
        type: action === "add" ? `admin_${walletType}_credit` : `admin_${walletType}_debit`,
        description: reason || `Admin ${action} - ${walletType} balance`,
      });
    } catch (auditError) {
      console.warn("Wallet audit insert skipped:", auditError);
    }

    return NextResponse.json({ success: true, wallet: updated });
  } catch (error) {
    console.error("Admin members API PATCH error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Wallet update failed." }, { status: 500 });
  }
}
