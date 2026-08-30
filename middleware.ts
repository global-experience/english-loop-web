import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/backend/")) {
    const requestHeaders = new Headers(request.headers);
    const secretKey = process.env.INTERNAL_API_SECRET || "loopine-internal-secret-dev-key";
    requestHeaders.set("X-Internal-Secret", secretKey);
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/backend/:path*",
};
