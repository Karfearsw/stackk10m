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
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      try {
        const json = await res.json();
        const msg = typeof (json as any)?.message === "string" && (json as any).message.trim() ? (json as any).message : "";
        throw new Error(`${res.status}: ${msg || JSON.stringify(json)}`);
      } catch {}
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
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
