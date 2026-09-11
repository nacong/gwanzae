"use client";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? "";

export const AUTH_TOKEN_KEY = "gwanzae-access-token";
export const AUTH_USER_KEY = "gwanzae-auth-user";

export type AuthUser = {
  id: number;
  username: string;
  full_name: string;
  email: string;
  organization_id: number;
  organization_name: string;
  role: "admin" | "worker";
  organization_entry_code?: string | null;
};

export type LoginResult = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  user: AuthUser;
};

type SignupBody = {
  username: string;
  password: string;
  full_name: string;
  email: string;
  organization_mode: "create" | "join";
  organization_name?: string;
  entry_code?: string;
};

export class AuthRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "AuthRequestError";
  }
}

function errorDetail(text: string, fallback: string): string {
  try {
    const detail = JSON.parse(text).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail.map((item) => item?.msg).filter(Boolean).join("\n") || fallback;
    }
  } catch { /* 원문 또는 기본 문구 사용 */ }
  return text || fallback;
}

async function authRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new AuthRequestError(response.status, errorDetail(text, `요청에 실패했습니다. (HTTP ${response.status})`));
  }
  return (text ? JSON.parse(text) : null) as T;
}

export async function loginAccount(username: string, password: string): Promise<LoginResult> {
  return authRequest<LoginResult>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function signupAccount(body: SignupBody): Promise<AuthUser> {
  return authRequest<AuthUser>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchCurrentUser(token: string): Promise<AuthUser> {
  return authRequest<AuthUser>("/auth/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function requestPasswordReset(email: string): Promise<{ message: string; reset_token?: string }> {
  return authRequest<{ message: string; reset_token?: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPasswordAccount(token: string, newPassword: string): Promise<{ message: string }> {
  return authRequest<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

export function saveAuth(result: LoginResult): void {
  sessionStorage.setItem(AUTH_TOKEN_KEY, result.access_token);
  sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(result.user));
  // 구버전의 브라우저 전체 공유 인증값은 다른 탭의 작업자를 덮어쓸 수 있어 제거한다.
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export function clearAuth(): void {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(AUTH_TOKEN_KEY);
}

export function getStoredAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) as AuthUser : null;
  } catch {
    return null;
  }
}
