import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_SESSION_COOKIE = "gamerzadda_admin_session";
const OLD_SESSION_COOKIE = "gamerzadda_session";

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

/* =========================================================
   CURRENT ADMIN SESSION VERIFICATION
========================================================= */

function verifyAdminSessionToken(token) {
  try {
    const secret = process.env.ADMIN_SESSION_SECRET;

    if (!token || !secret) {
      return null;
    }

    const decoded = decodeURIComponent(token);
    const parts = decoded.split(".");

    if (parts.length !== 2) {
      return null;
    }

    const [encodedPayload, signature] = parts;

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(encodedPayload)
      .digest("base64url");

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(
        signatureBuffer,
        expectedBuffer
      )
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(
        encodedPayload,
        "base64url"
      ).toString("utf8")
    );

    if (!payload?.userId) {
      return null;
    }

    if (payload.role !== "admin") {
      return null;
    }

    if (
      payload.expiresAt &&
      Number(payload.expiresAt) <= Date.now()
    ) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error(
      "OTP ADMIN SESSION VERIFY ERROR:",
      error
    );

    return null;
  }
}

/* =========================================================
   ADMIN AUTH
========================================================= */

async function requireAdmin(request) {

  /*
   * 1. Supabase Bearer token
   */

  const authorization =
    request.headers.get("authorization") || "";

  if (authorization.startsWith("Bearer ")) {

    const token =
      authorization
        .slice(7)
        .trim();

    if (token) {

      const { data, error } =
        await supabase.auth.getUser(token);

      if (
        !error &&
        data?.user?.id
      ) {

        let { data: admin } =
          await supabase
            .from("users")
            .select("id,role,status")
            .eq("id", data.user.id)
            .maybeSingle();

        /*
         * Some installations have a different
         * public users ID, so also try email.
         */

        if (
          admin?.role !== "admin" &&
          data.user.email
        ) {

          const result =
            await supabase
              .from("users")
              .select("id,role,status")
              .ilike(
                "email",
                data.user.email
              )
              .maybeSingle();

          admin = result.data;
        }

        if (
          admin?.role === "admin" &&
          String(
            admin.status || "active"
          ).toLowerCase() === "active"
        ) {
          return admin;
        }
      }
    }
  }

  /*
   * 2. CURRENT GamerzAdda admin session
   */

  const adminCookie =
    request.cookies.get(
      ADMIN_SESSION_COOKIE
    )?.value;

  if (adminCookie) {

    const session =
      verifyAdminSessionToken(
        adminCookie
      );

    if (session?.userId) {

      const { data: admin, error } =
        await supabase
          .from("users")
          .select("id,role,status")
          .eq("id", session.userId)
          .maybeSingle();

      if (
        !error &&
        admin?.role === "admin" &&
        String(
          admin.status || "active"
        ).toLowerCase() === "active"
      ) {
        return admin;
      }
    }
  }

  /*
   * 3. Backward-compatible old session
   */

  const oldCookie =
    request.cookies.get(
      OLD_SESSION_COOKIE
    )?.value;

  if (oldCookie) {

    let decoded = oldCookie;

    try {
      decoded =
        decodeURIComponent(oldCookie);
    } catch {}

    const candidates = [
      decoded,
      oldCookie,
      sha256(decoded),
      sha256(oldCookie)
    ];

    for (const candidate of [
      ...new Set(candidates)
    ]) {

      /*
       * Current user_sessions schema
       * uses token_hash.
       */

      const { data: session } =
        await supabase
          .from("user_sessions")
          .select(
            "user_id,expires_at"
          )
          .eq(
            "token_hash",
            candidate
          )
          .maybeSingle();

      if (
        session?.user_id &&
        (
          !session.expires_at ||
          new Date(
            session.expires_at
          ) > new Date()
        )
      ) {

        const { data: admin } =
          await supabase
            .from("users")
            .select(
              "id,role,status"
            )
            .eq(
              "id",
              session.user_id
            )
            .maybeSingle();

        if (
          admin?.role === "admin" &&
          String(
            admin.status || "active"
          ).toLowerCase() === "active"
        ) {
          return admin;
        }
      }
    }
  }

  throw new Error("UNAUTHORIZED");
}

/* =========================================================
   HELPERS
========================================================= */

function statusOf(row) {

  if (row.verified) {
    return "verified";
  }

  if (
    row.expires_at &&
    new Date(row.expires_at) <= new Date()
  ) {
    return "expired";
  }

  return "active";
}

/* =========================================================
   GET OTP ACTIVITY
========================================================= */

export async function GET(request) {

  try {

    await requireAdmin(request);

    const {
      searchParams
    } = new URL(request.url);

    const phone =
      (
        searchParams.get("phone") || ""
      ).replace(/\D/g, "");

    const flow =
      searchParams.get("flow") || "all";

    const status =
      searchParams.get("status") || "all";

    const period =
      searchParams.get("period") || "7";

    const ip =
      (
        searchParams.get("ip") || ""
      ).trim();

    const sort =
      searchParams.get("sort") ===
      "oldest"
        ? "oldest"
        : "newest";

    const limit =
      Math.min(
        Math.max(
          Number(
            searchParams.get(
              "limit"
            ) || 200
          ),
          1
        ),
        500
      );

    let query =
      supabase
        .from("otp_codes")
        .select(
          "id,phone,flow,expires_at,attempts,verified,created_at,ip_address"
        );

    if (phone) {
      query =
        query.ilike(
          "phone",
          `%${phone}%`
        );
    }

    if (flow !== "all") {
      query =
        query.eq(
          "flow",
          flow
        );
    }

    if (ip) {
      query =
        query.ilike(
          "ip_address",
          `%${ip}%`
        );
    }

    if (period !== "all") {

      const days =
        Number(period);

      if (
        Number.isFinite(days)
      ) {

        const since =
          new Date(
            Date.now() -
            days * 86400000
          ).toISOString();

        query =
          query.gte(
            "created_at",
            since
          );
      }
    }

    query =
      query
        .order(
          "created_at",
          {
            ascending:
              sort === "oldest"
          }
        )
        .limit(limit);

    const {
      data: rows,
      error
    } = await query;

    if (error) {
      throw error;
    }

    let requests =
      (rows || [])
        .map((row) => ({
          ...row,
          status:
            statusOf(row)
        }));

    if (status !== "all") {

      requests =
        requests.filter(
          (row) =>
            row.status ===
            status
        );
    }

    /*
     * Phone ranking
     */

    const phoneMap = {};

    /*
     * IP ranking
     */

    const ipMap = {};

    for (const row of requests) {

      phoneMap[row.phone] =
        (
          phoneMap[row.phone] ||
          0
        ) + 1;

      if (row.ip_address) {

        ipMap[row.ip_address] =
          (
            ipMap[row.ip_address] ||
            0
          ) + 1;
      }
    }

    const phoneRanking =
      Object.entries(phoneMap)
        .map(
          ([phone, count]) => ({
            phone,
            count
          })
        )
        .sort(
          (a, b) =>
            b.count -
            a.count
        );

    const ipRanking =
      Object.entries(ipMap)
        .map(
          ([ip, count]) => ({
            ip,
            count
          })
        )
        .sort(
          (a, b) =>
            b.count -
            a.count
        );

    /*
     * Blocked OTP accounts
     */

    const {
      data: abuse
    } =
      await supabase
        .from(
          "otp_abuse_limits"
        )
        .select(
          "phone,is_blocked,resend_is_blocked"
        )
        .or(
          "is_blocked.eq.true,resend_is_blocked.eq.true"
        );

    const stats = {

      total:
        requests.length,

      uniquePhones:
        new Set(
          requests.map(
            (row) =>
              row.phone
          )
        ).size,

      uniqueIps:
        new Set(
          requests
            .map(
              (row) =>
                row.ip_address
            )
            .filter(Boolean)
        ).size,

      failed:
        requests.filter(
          (row) =>
            row.status ===
              "failed" ||
            row.status ===
              "expired"
        ).length,

      blocked:
        new Set(
          (abuse || [])
            .map(
              (row) =>
                row.phone
            )
        ).size
    };

    return NextResponse.json(
      {
        success: true,
        requests,
        stats,
        phoneRanking,
        ipRanking
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate"
        }
      }
    );

  } catch (error) {

    if (
      error?.message ===
      "UNAUTHORIZED"
    ) {

      return NextResponse.json(
        {
          success: false,
          message:
            "Unauthorized"
        },
        {
          status: 401
        }
      );
    }

    console.error(
      "ADMIN OTP GET:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Unable to load OTP activity"
      },
      {
        status: 500
      }
    );
  }
}

/* =========================================================
   PATCH OTP CONTROLS
========================================================= */

export async function PATCH(request) {

  try {

    await requireAdmin(request);

    const body =
      await request.json();

    const phone =
      String(
        body.phone || ""
      ).replace(/\D/g, "");

    const flow =
      body.flow || "login";

    const action =
      body.action;

    if (!phone) {

      return NextResponse.json(
        {
          success: false,
          message:
            "Phone is required"
        },
        {
          status: 400
        }
      );
    }

    const update =
      action ===
      "unblock_wrong"

        ? {
            wrong_attempts: 0,
            locked_until: null,
            is_blocked: false,
            blocked_at: null,
            unblocked_at:
              new Date().toISOString()
          }

        : action ===
          "unblock_resend"

        ? {
            resend_attempts: 0,
            resend_locked_until: null,
            resend_is_blocked:
              false
          }

        : action ===
          "reset"

        ? {
            wrong_attempts: 0,
            locked_until: null,
            is_blocked: false,
            blocked_at: null,
            resend_attempts: 0,
            resend_locked_until: null,
            resend_is_blocked:
              false,
            unblocked_at:
              new Date().toISOString()
          }

        : null;

    if (!update) {

      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid action"
        },
        {
          status: 400
        }
      );
    }

    const {
      error
    } =
      await supabase
        .from(
          "otp_abuse_limits"
        )
        .upsert(
          {
            phone,
            flow,
            ...update
          },
          {
            onConflict:
              "phone,flow"
          }
        );

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message:
        "OTP controls updated"
    });

  } catch (error) {

    if (
      error?.message ===
      "UNAUTHORIZED"
    ) {

      return NextResponse.json(
        {
          success: false,
          message:
            "Unauthorized"
        },
        {
          status: 401
        }
      );
    }

    console.error(
      "ADMIN OTP PATCH:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error?.message ||
          "Unable to update OTP controls"
      },
      {
        status: 500
      }
    );
  }
}