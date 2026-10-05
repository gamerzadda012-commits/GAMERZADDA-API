import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

function hashValue(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "").slice(-10);
}

function cleanFlow(value) {
  const flow = String(value || "login").toLowerCase().trim();
  return ["login", "signup"].includes(flow) ? flow : "login";
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

  if (!rawToken) {
    return { ok: false, error: "Admin login required." };
  }

  let decodedToken = rawToken;

  try {
    decodedToken = decodeURIComponent(rawToken);
  } catch (_) {}

  const candidates = [
    ...new Set([
      decodedToken,
      rawToken,
      hashValue(decodedToken),
      hashValue(rawToken),
    ]),
  ];

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

  if (
    session.expires_at &&
    new Date(session.expires_at).getTime() <= Date.now()
  ) {
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

async function getOtpControl(phone, flow) {
  const [abuseResult, otpResult] = await Promise.all([
    supabaseAdmin
      .from("otp_abuse_limits")
      .select(
        "id, phone, flow, wrong_attempts, locked_until, is_blocked, blocked_at, unblocked_at, resend_attempts, resend_locked_until, resend_is_blocked, created_at, updated_at"
      )
      .eq("phone", phone)
      .eq("flow", flow)
      .maybeSingle(),

    supabaseAdmin
      .from("otp_codes")
      .select("id, phone, flow, attempts, verified, expires_at, created_at, device_id")
      .eq("phone", phone)
      .eq("flow", flow)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (abuseResult.error) throw abuseResult.error;
  if (otpResult.error) throw otpResult.error;

  return {
    record: abuseResult.data || null,
    recentOtps: otpResult.data || [],
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

    const phone = cleanPhone(
      request.nextUrl.searchParams.get("phone")
    );
    const flow = cleanFlow(
      request.nextUrl.searchParams.get("flow")
    );

    if (phone.length !== 10) {
      return NextResponse.json(
        {
          success: false,
          error: "Enter a valid 10-digit phone number.",
        },
        { status: 400 }
      );
    }

    const result = await getOtpControl(phone, flow);

    return NextResponse.json(
      {
        success: true,
        phone,
        flow,
        ...result,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("ADMIN OTP GET ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load OTP control data.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const auth = await requireAdmin(request);

    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      );
    }

    const body = await request.json();

    const phone = cleanPhone(body?.phone);
    const flow = cleanFlow(body?.flow);
    const action = String(body?.action || "").trim();

    if (phone.length !== 10) {
      return NextResponse.json(
        {
          success: false,
          error: "Enter a valid 10-digit phone number.",
        },
        { status: 400 }
      );
    }

    if (
      !["unblock_wrong", "unblock_resend", "reset"].includes(action)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid OTP admin action.",
        },
        { status: 400 }
      );
    }

    if (action === "reset") {
      const { error: abuseDeleteError } = await supabaseAdmin
        .from("otp_abuse_limits")
        .delete()
        .eq("phone", phone)
        .eq("flow", flow);

      if (abuseDeleteError) throw abuseDeleteError;

      const { error: otpInvalidateError } = await supabaseAdmin
        .from("otp_codes")
        .update({ verified: true })
        .eq("phone", phone)
        .eq("flow", flow)
        .eq("verified", false);

      if (otpInvalidateError) throw otpInvalidateError;

      return NextResponse.json({
        success: true,
        message: `OTP limits fully reset for ${phone} (${flow}).`,
      });
    }

    const update =
      action === "unblock_wrong"
        ? {
            wrong_attempts: 0,
            locked_until: null,
            is_blocked: false,
            unblocked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        : {
            resend_attempts: 0,
            resend_locked_until: null,
            resend_is_blocked: false,
            updated_at: new Date().toISOString(),
          };

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("otp_abuse_limits")
      .select("id")
      .eq("phone", phone)
      .eq("flow", flow)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing?.id) {
      const { error: updateError } = await supabaseAdmin
        .from("otp_abuse_limits")
        .update(update)
        .eq("id", existing.id);

      if (updateError) throw updateError;
    } else {
      const insertData = {
        phone,
        flow,
        wrong_attempts: 0,
        locked_until: null,
        is_blocked: false,
        blocked_at: null,
        resend_attempts: 0,
        resend_locked_until: null,
        resend_is_blocked: false,
        unblocked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabaseAdmin
        .from("otp_abuse_limits")
        .insert(insertData);

      if (insertError) throw insertError;
    }

    return NextResponse.json({
      success: true,
      message:
        action === "unblock_wrong"
          ? `Wrong-OTP lock unblocked for ${phone} (${flow}).`
          : `OTP resend lock unblocked for ${phone} (${flow}).`,
    });
  } catch (error) {
    console.error("ADMIN OTP PATCH ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to update OTP control.",
      },
      { status: 500 }
    );
  }
}
