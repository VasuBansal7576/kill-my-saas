import type { ApiErrorBody } from "./types";

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);
  const abortFromCaller = () => controller.abort();
  init?.signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as ApiErrorBody | null;
      throw new Error(body?.error?.message ?? `Request failed with status ${response.status}.`);
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (controller.signal.aborted && !init?.signal?.aborted) throw new Error("The request took too long. Try again.", { cause: error });
    throw error;
  } finally {
    window.clearTimeout(timeout);
    init?.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export function jsonRequest(method: "POST" | "PATCH" | "PUT", body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}
