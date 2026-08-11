export async function publicProgramRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string; code?: string } } | null;
    const error = new Error(body?.error?.message ?? `Request failed with status ${response.status}.`) as Error & { code?: string };
    error.code = body?.error?.code;
    throw error;
  }
  return response.json() as Promise<T>;
}

export function jsonRequest(method: "POST" | "PUT" | "DELETE", body?: unknown): RequestInit {
  return {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}
