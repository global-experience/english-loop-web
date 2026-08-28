export function getApiBase(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  const isLoopbackEnv = envUrl === "http://localhost:8000" || envUrl === "http://127.0.0.1:8000";

  // Production uses the same-origin /backend rewrite. Absolute non-local URLs
  // are also respected for deployments that do not use the rewrite.
  if (envUrl && !isLoopbackEnv) {
    return envUrl;
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }

  return envUrl || "http://localhost:8000";
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
