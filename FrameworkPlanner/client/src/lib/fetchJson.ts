type UnauthorizedBehavior = "returnNull" | "throw";

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

async function readErrorMessage(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      const json = await res.json();
      const msg = typeof json?.message === "string" && json.message.trim() ? json.message : "";
      return msg || JSON.stringify(json);
    } catch {}
  }
  try {
    const text = await res.text();
    return text || res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  options?: { on401?: UnauthorizedBehavior },
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.headers || {}),
    },
    credentials: "include",
  });

  if (options?.on401 === "returnNull" && res.status === 401) return null as any;

  if (!res.ok) {
    const msg = await readErrorMessage(res);
    throw new Error(`${res.status}: ${msg}`);
  }

  if (res.status === 204) return null as any;
  return (await res.json()) as T;
}

