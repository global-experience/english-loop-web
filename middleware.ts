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

  // 공개 피드와 로그인 화면을 제외한 앱 화면은 세션 쿠키가 있어야 한다.
  // 여기서는 쿠키의 존재만 빠르게 확인하고, 유효성은 기존 /api/me가 검증한다.
  // 비로그인 사용자를 브라우저에서 API 응답까지 기다리게 하지 않으므로
  // `스플래시 -> 오늘 로딩 -> 빈 화면 -> 로그인` 전환을 없앨 수 있다.
  if (!request.cookies.has("session_id")) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";

    const requestedPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    if (requestedPath !== "/") {
      loginUrl.searchParams.set("next", requestedPath);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/backend/:path*",
    "/",
    "/today/:path*",
    "/learn/:path*",
    "/review/:path*",
    "/report/:path*",
    "/settings/:path*",
  ],
};
