import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/* =========================================================
   ADMIN AUTH
========================================================= */

async function requireAdmin(request) {
  const cookie =
    request.cookies.get(
      "gamerzadda_admin_session"
    )?.value || "";

  if (!cookie) {
    console.error(
      "OTP ADMIN AUTH: gamerzadda_admin_session cookie missing"
    );

    throw new Error("UNAUTHORIZED");
  }

  const apiUrl = (
    process.env.NEXT_PUBLIC_API_URL ||
    "https://api.gamerzadda.in"
  )
    .trim()
    .replace(/\/+$/, "");

  try {
    const response = await fetch(
      `${apiUrl}/api/admin/session`,
      {
        method: "GET",
        headers: {
          Cookie:
            `gamerzadda_admin_session=${encodeURIComponent(
              cookie
            )}`,
        },
        cache: "no-store",
      }
    );

    const data = await response
      .json()
      .catch(() => null);

    if (
      !response.ok ||
      !data?.success ||
      !data?.authenticated ||
      !data?.admin
    ) {
      console.error(
        "OTP ADMIN AUTH FAILED:",
        {
          status: response.status,
          success: data?.success,
          authenticated:
            data?.authenticated,
          error: data?.error,
        }
      );

      throw new Error("UNAUTHORIZED");
    }

    const admin = data.admin;

    const role = String(
      admin.role || ""
    )
      .trim()
      .toLowerCase();

    const status = String(
      admin.status || "active"
    )
      .trim()
      .toLowerCase();

    if (role !== "admin") {
      throw new Error("UNAUTHORIZED");
    }

    if (status !== "active") {
      throw new Error("UNAUTHORIZED");
    }

    return admin;
  } catch (error) {
    if (
      error?.message ===
      "UNAUTHORIZED"
    ) {
      throw error;
    }

    console.error(
      "OTP ADMIN SESSION REQUEST ERROR:",
      error
    );

    throw new Error("UNAUTHORIZED");
  }
}

/* =========================================================
   OTP STATUS
========================================================= */

function getOtpStatus(row) {
  if (row?.verified === true) {
    return "verified";
  }

  if (
    row?.expires_at &&
    new Date(row.expires_at).getTime() <=
      Date.now()
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

    const { searchParams } =
      new URL(request.url);

    const phone = String(
      searchParams.get("phone") || ""
    ).replace(/\D/g, "");

    const flow =
      searchParams.get("flow") || "all";

    const status =
      searchParams.get("status") || "all";

    const period =
      searchParams.get("period") || "7";

    const ip = String(
      searchParams.get("ip") || ""
    ).trim();

    const sort =
      searchParams.get("sort") === "oldest"
        ? "oldest"
        : "newest";

    let limit = Number(
      searchParams.get("limit") || 200
    );

    if (!Number.isFinite(limit)) {
      limit = 200;
    }

    limit = Math.min(
      Math.max(Math.floor(limit), 1),
      500
    );

    /* =====================================================
       OTP REQUESTS
    ===================================================== */

    let query = supabase
      .from("otp_codes")
      .select(
        [
          "id",
          "phone",
          "flow",
          "expires_at",
          "attempts",
          "verified",
          "created_at",
          "ip_address",
        ].join(",")
      );

    if (phone) {
      query = query.ilike(
        "phone",
        `%${phone}%`
      );
    }

    if (
      flow &&
      flow !== "all"
    ) {
      query = query.eq(
        "flow",
        flow
      );
    }

    if (ip) {
      query = query.ilike(
        "ip_address",
        `%${ip}%`
      );
    }

    if (
      period &&
      period !== "all"
    ) {
      const days = Number(period);

      if (
        Number.isFinite(days) &&
        days > 0
      ) {
        const since = new Date(
          Date.now() -
            days *
              24 *
              60 *
              60 *
              1000
        ).toISOString();

        query = query.gte(
          "created_at",
          since
        );
      }
    }

    query = query.order(
      "created_at",
      {
        ascending:
          sort === "oldest",
      }
    );

    query = query.limit(limit);

    const {
      data,
      error,
    } = await query;

    if (error) {
      console.error(
        "OTP DATABASE ERROR:",
        error
      );

      throw error;
    }

    /* =====================================================
       OTP ABUSE LIMITS

       This is the real wrong-attempt counter.
    ===================================================== */

    const {
      data: abuseData,
      error: abuseError,
    } = await supabase
      .from("otp_abuse_limits")
      .select(
        [
          "phone",
          "flow",
          "wrong_attempts",
          "locked_until",
          "is_blocked",
          "resend_attempts",
          "resend_locked_until",
          "resend_is_blocked",
        ].join(",")
      );

    if (abuseError) {
      console.error(
        "OTP ABUSE QUERY ERROR:",
        abuseError
      );

      throw abuseError;
    }

    const abuseRows =
      abuseData || [];

    /*
      Create a lookup:

      phone + flow
          ->
      wrong_attempts
    */

    const abuseMap = new Map();

    for (const row of abuseRows) {
      const key =
        `${String(row.phone || "")}:${String(
          row.flow || "login"
        )}`;

      abuseMap.set(key, {
        wrong_attempts: Number(
          row.wrong_attempts || 0
        ),
        locked_until:
          row.locked_until || null,
        is_blocked:
          row.is_blocked === true,
        resend_attempts: Number(
          row.resend_attempts || 0
        ),
        resend_locked_until:
          row.resend_locked_until || null,
        resend_is_blocked:
          row.resend_is_blocked === true,
      });
    }

    /* =====================================================
       BUILD REQUEST ROWS

       Attempts = wrong_attempts
       from otp_abuse_limits
    ===================================================== */

    let requests = (
      data || []
    ).map((row) => {
      const key =
        `${String(row.phone || "")}:${String(
          row.flow || "login"
        )}`;

      const abuse =
        abuseMap.get(key);

      return {
        id: row.id,
        phone: row.phone,
        flow: row.flow,
        expires_at:
          row.expires_at,

        /*
          IMPORTANT:
          Use abuse counter instead of
          otp_codes.attempts.
        */
        attempts: Number(
          abuse?.wrong_attempts || 0
        ),

        wrong_attempts: Number(
          abuse?.wrong_attempts || 0
        ),

        locked_until:
          abuse?.locked_until || null,

        is_blocked:
          abuse?.is_blocked === true,

        resend_attempts: Number(
          abuse?.resend_attempts || 0
        ),

        resend_locked_until:
          abuse?.resend_locked_until ||
          null,

        resend_is_blocked:
          abuse?.resend_is_blocked === true,

        verified:
          row.verified === true,

        created_at:
          row.created_at,

        ip_address:
          row.ip_address || null,

        status:
          getOtpStatus(row),
      };
    });

    /* =====================================================
       STATUS FILTER
    ===================================================== */

    if (
      status &&
      status !== "all"
    ) {
      requests =
        requests.filter(
          (row) =>
            row.status === status
        );
    }

    /* =====================================================
       PHONE RANKING
    ===================================================== */

    const phoneMap = {};

    for (const row of requests) {
      const key = String(
        row.phone || ""
      );

      if (!key) continue;

      phoneMap[key] =
        (phoneMap[key] || 0) + 1;
    }

    const phoneRanking =
      Object.entries(phoneMap)
        .map(
          ([phone, count]) => ({
            phone,
            count,
          })
        )
        .sort(
          (a, b) =>
            b.count - a.count
        )
        .slice(0, 20);

    /* =====================================================
       IP RANKING
    ===================================================== */

    const ipMap = {};

    for (const row of requests) {
      if (!row.ip_address) {
        continue;
      }

      ipMap[row.ip_address] =
        (ipMap[row.ip_address] || 0) +
        1;
    }

    const ipRanking =
      Object.entries(ipMap)
        .map(
          ([ip, count]) => ({
            ip,
            count,
          })
        )
        .sort(
          (a, b) =>
            b.count - a.count
        )
        .slice(0, 15);

    /* =====================================================
       BLOCKED PHONES
    ===================================================== */

    const blockedPhones =
      new Set(
        abuseRows
          .filter(
            (row) =>
              row.is_blocked === true ||
              row.resend_is_blocked === true
          )
          .map((row) =>
            String(row.phone || "")
          )
          .filter(Boolean)
      );

    /* =====================================================
       IP BLOCKS
    ===================================================== */

    const {
      data: ipBlockData,
      error: ipBlockError,
    } = await supabase
      .from("otp_ip_blocks")
      .select(
        "id, ip_address, reason, is_permanent, expires_at, is_active, created_at, updated_at"
      )
      .eq("is_active", true)
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (ipBlockError) {
      console.error(
        "OTP IP BLOCK QUERY ERROR:",
        ipBlockError
      );

      throw ipBlockError;
    }

    const blockedIps =
      ipBlockData || [];

    /* =====================================================
       STATS
    ===================================================== */

    const stats = {
      total:
        requests.length,

      uniquePhones:
        new Set(
          requests.map(
            (row) => row.phone
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
              "expired" ||
            row.status ===
              "failed"
        ).length,

      blocked:
        blockedPhones.size,
    };

    /* =====================================================
       RESPONSE
    ===================================================== */

    return NextResponse.json(
      {
        success: true,
        requests,
        stats,
        phoneRanking,
        ipRanking,
        blockedIps,
        blockedPhones:
          Array.from(
            blockedPhones
          ),
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
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
          code: "UNAUTHORIZED",
          message: "Unauthorized",
        },
        {
          status: 401,
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    console.error(
      "ADMIN OTP GET ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        code: "OTP_ACTIVITY_ERROR",
        message:
          "Unable to load OTP activity",
      },
      {
        status: 500,
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

    const action =
      String(
        body?.action || ""
      ).trim();

    /* =====================================================
       IP BLOCK / UNBLOCK
    ===================================================== */

    if (
      action === "block_ip" ||
      action === "unblock_ip"
    ) {
      const ipAddress =
        String(
          body?.ip_address || ""
        ).trim();

      if (!ipAddress) {
        return NextResponse.json(
          {
            success: false,
            message:
              "IP address is required",
          },
          {
            status: 400,
          }
        );
      }

      if (
        action === "block_ip"
      ) {
        const reason =
          String(
            body?.reason || ""
          ).trim() ||
          "Blocked by admin";

        const expiresAt =
          body?.expires_at
            ? new Date(
                body.expires_at
              ).toISOString()
            : null;

        const isPermanent =
          body?.is_permanent !==
          false;

        const {
          data,
          error,
        } = await supabase
          .from("otp_ip_blocks")
          .upsert(
            {
              ip_address:
                ipAddress,
              reason,
              is_permanent:
                isPermanent,
              expires_at:
                isPermanent
                  ? null
                  : expiresAt,
              is_active: true,
              updated_at:
                new Date().toISOString(),
            },
            {
              onConflict:
                "ip_address",
            }
          )
          .select()
          .single();

        if (error) {
          console.error(
            "OTP IP BLOCK ERROR:",
            error
          );

          throw error;
        }

        return NextResponse.json(
          {
            success: true,
            message:
              "IP blocked successfully",
            data,
          },
          {
            status: 200,
            headers: {
              "Cache-Control":
                "no-store",
            },
          }
        );
      }

      const {
        data,
        error,
      } = await supabase
        .from("otp_ip_blocks")
        .update({
          is_active: false,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "ip_address",
          ipAddress
        )
        .eq(
          "is_active",
          true
        )
        .select()
        .maybeSingle();

      if (error) {
        console.error(
          "OTP IP UNBLOCK ERROR:",
          error
        );

        throw error;
      }

      return NextResponse.json(
        {
          success: true,
          message:
            "IP unblocked successfully",
          data: data || null,
        },
        {
          status: 200,
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    /* =====================================================
       PHONE OTP CONTROLS
    ===================================================== */

    const phone =
      String(
        body?.phone || ""
      ).replace(/\D/g, "");

    const flow =
      String(
        body?.flow || "login"
      ).trim();

    if (!phone) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Phone is required",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !flow ||
      !["login", "signup"].includes(
        flow
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid OTP flow",
        },
        {
          status: 400,
        }
      );
    }

    let update = null;

    /* =====================================================
       RESET EVERYTHING
    ===================================================== */

    if (
      action === "reset"
    ) {
      update = {
        wrong_attempts: 0,

        locked_until: null,

        is_blocked: false,

        blocked_at: null,

        resend_attempts: 0,

        resend_locked_until:
          null,

        resend_is_blocked:
          false,

        unblocked_at:
          new Date().toISOString(),
      };
    }

    /* =====================================================
       RESET WRONG OTP ONLY
    ===================================================== */

    else if (
      action ===
      "unblock_wrong"
    ) {
      update = {
        wrong_attempts: 0,
        locked_until: null,
        is_blocked: false,
        blocked_at: null,
        unblocked_at:
          new Date().toISOString(),
      };
    }

    /* =====================================================
       RESET RESEND ONLY
    ===================================================== */

    else if (
      action ===
      "unblock_resend"
    ) {
      update = {
        resend_attempts: 0,
        resend_locked_until:
          null,
        resend_is_blocked:
          false,
      };
    }

    if (!update) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Invalid action",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data,
      error,
    } = await supabase
      .from("otp_abuse_limits")
      .upsert(
        {
          phone,
          flow,
          ...update,
        },
        {
          onConflict:
            "phone,flow",
        }
      )
      .select()
      .maybeSingle();

    if (error) {
      console.error(
        "OTP CONTROL UPDATE ERROR:",
        error
      );

      throw error;
    }

    return NextResponse.json(
      {
        success: true,
        message:
          "OTP controls updated",
        data:
          data || null,
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store",
        },
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
          code: "UNAUTHORIZED",
          message:
            "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    console.error(
      "ADMIN OTP PATCH ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error?.message ||
          "Unable to update OTP controls",
      },
      {
        status: 500,
      }
    );
  }
}