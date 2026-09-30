import { NextResponse } from "next/server";

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Login page ko direct allow karo
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  // Sirf /admin routes protect karo
  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  // Current backend session cookie check
  const sessionCookie =
    request.cookies.get("gamerzadda_admin_session")?.value;

  // Cookie nahi hai → login
  if (!sessionCookie) {
    return NextResponse.redirect(
      new URL("/admin/login", request.url)
    );
  }

  // Cookie present hai → request ko allow karo.
  // Actual admin/session validation AdminLayout + backend karega.
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};