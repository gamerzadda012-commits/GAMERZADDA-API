import { NextResponse } from "next/server";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://api.gamerzadda.in";

const SESSION_COOKIE_NAME = "gamerzadda_admin_session";

export async function POST(request) {
  try {
    /*
     * This endpoint is kept for compatibility with the existing
     * frontend login flow.
     *
     * The actual admin session is now created by:
     * POST /api/admin/login
     * on the backend, using the custom
     * gamerzadda_admin_session cookie.
     */

    if (!URL || !ANON || !SERVICE) {
      return NextResponse.json(
        {
          success: false,
          error: "Server Supabase configuration missing.",
        },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);
    const accessToken = body?.access_token;

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing access token.",
        },
        { status: 400 }
      );
    }

    // Verify the Supabase access token.
    const userRes = await fetch(`${URL}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!userRes.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid Supabase session.",
        },
        { status: 401 }
      );
    }

    const user = await userRes.json();

    if (!user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid user session.",
        },
        { status: 401 }
      );
    }

    // Verify that this Supabase user is an active admin.
    const adminRes = await fetch(
      `${URL}/rest/v1/users?select=id,role,status&id=eq.${encodeURIComponent(
        user.id
      )}&limit=1`,
      {
        method: "GET",
        headers: {
          apikey: SERVICE,
          Authorization: `Bearer ${SERVICE}`,
        },
        cache: "no-store",
      }
    );

    if (!adminRes.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Could not verify admin account.",
        },
        { status: 500 }
      );
    }

    const rows = await adminRes.json();
    const admin = rows?.[0];

    if (
      !admin ||
      admin.role !== "admin" ||
      admin.status !== "active"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Admin access required.",
        },
        { status: 403 }
      );
    }

    /*
     * IMPORTANT:
     *
     * Do NOT create gamerzadda_admin_access here.
     *
     * The real admin session is created by the backend
     * /api/admin/login endpoint.
     *
     * If this endpoint is called by an older frontend flow,
     * redirect that flow to the backend login instead.
     */

    const response = NextResponse.json({
      success: true,
      admin: {
        id: admin.id,
        role: admin.role,
        status: admin.status,
      },
    });

    return response;
  } catch (error) {
    console.error("ADMIN SESSION ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Session verification failed.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    /*
     * Clear the current custom admin session cookie.
     *
     * This route can clear the frontend-domain cookie,
     * but the authoritative admin session is managed by
     * the backend /api/admin/login / logout flow.
     */

    const response = NextResponse.json({
      success: true,
    });

    response.cookies.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    // Also clear the old cookie if it still exists on any client.
    response.cookies.set("gamerzadda_admin_access", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error("ADMIN LOGOUT ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Logout failed.",
      },
      { status: 500 }
    );
  }
}