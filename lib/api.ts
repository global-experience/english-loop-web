export function getApiBase(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  const isLocalDevEnv = envUrl ? isLocalDevApiUrl(envUrl) : false;

  // Keep production traffic same-origin. NEXT_PUBLIC_* values are bundled into
  // browser JavaScript, so the deployed API origin must stay server-side behind
  // the /backend rewrite configured by API_PROXY_ORIGIN.
  if (envUrl && (envUrl.startsWith("/") || isLocalDevEnv)) {
    return envUrl;
  }

  if (envUrl) {
    return "/backend";
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }

  return envUrl || "http://localhost:8000";
}

function isLocalDevApiUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1" ||
      url.hostname === "[::1]" ||
      url.hostname.startsWith("192.168.") ||
      url.hostname.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(url.hostname)
    );
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function csrfToken() {
  if (typeof document === "undefined") return "";
  return document.cookie.split("; ").find((value) => value.startsWith("csrf_token="))?.split("=")[1] || "";
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiBase = getApiBase();
  const method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers);
  const internalSecret = process.env.NEXT_PUBLIC_INTERNAL_API_SECRET || "loopine-internal-secret-dev-key";
  headers.set("X-Internal-Secret", internalSecret);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers.set("X-CSRF-Token", decodeURIComponent(csrfToken()));
  const response = await fetch(`${apiBase}${path}`, { cache: "no-store", ...init, headers, credentials: "include" });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = data?.error;
    throw new ApiError(response.status, error?.code || "REQUEST_FAILED", error?.message || "요청을 처리하지 못했습니다.");
  }
  return data as T;
}

export function mediaUrl(path: string | null) {
  if (!path) return null;
  const apiBase = getApiBase();
  return path.startsWith("/") ? `${apiBase}${path}` : path;
}
