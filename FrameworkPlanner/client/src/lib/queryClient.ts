import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { fetchJson } from "./fetchJson";

function getAuthToken(): string | null {
  try {
    return localStorage.getItem("authToken") || localStorage.getItem("token");
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Read the body exactly once; a second read throws "body stream already read".
    const raw = await res.text().catch(() => "");
    let message = raw || res.statusText;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json") && raw) {
      try {
        const json = JSON.parse(raw);
        const msg = typeof (json as any)?.message === "string" && (json as any).message.trim() ? (json as any).message : "";
        const err = (json as any)?.error;
        const detail = (json as any)?.detail;
        const pick = msg || (typeof err === "string" ? err : err?.message) || detail || raw;
        if (pick) message = pick;
      } catch {}
    }
    const error = new Error(`${res.status}: ${message}`) as any;
    error.status = res.status;
    error.body = raw;
    throw error;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

export async function apiUpload(
  method: string,
  url: string,
  data: FormData,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: {
      ...authHeaders(),
    },
    body: data,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  <T,>(opts: { on401: UnauthorizedBehavior }) =>
  async ({ queryKey }) => {
    return await fetchJson<T>(queryKey.join("/") as string, undefined, { on401: opts.on401 });
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
