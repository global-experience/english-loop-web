const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

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
  const method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers.set("X-CSRF-Token", decodeURIComponent(csrfToken()));
  const response = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init, headers, credentials: "include" });
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
  return path.startsWith("/") ? `${API_BASE}${path}` : path;
}
