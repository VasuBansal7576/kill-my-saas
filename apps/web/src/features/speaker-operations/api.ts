import type { ApiErrorBody } from "./types";

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as ApiErrorBody | null;
    throw new Error(body?.error?.message ?? `Request failed with status ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

export function jsonRequest(method: "POST" | "PATCH" | "PUT", body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}
