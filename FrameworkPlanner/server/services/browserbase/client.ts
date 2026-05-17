import Browserbase from "@browserbasehq/sdk";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`${name} is not configured`);
  return String(v).trim();
}

export function getBrowserbaseClient() {
  const apiKey = requireEnv("BROWSERBASE_API_KEY");
  return new Browserbase({ apiKey });
}

export async function browserbaseSearch(input: { query: string; numResults?: number; timeoutMs?: number }) {
  const client = getBrowserbaseClient();
  const query = String(input.query || "").trim();
  if (!query) throw new Error("Missing query");
  return await client.search.web(
    { query, numResults: input.numResults },
    input.timeoutMs ? { timeout: input.timeoutMs } : undefined,
  );
}

export async function browserbaseFetch(input: {
  url: string;
  allowRedirects?: boolean;
  allowInsecureSsl?: boolean;
  proxies?: boolean;
  timeoutMs?: number;
}) {
  const client = getBrowserbaseClient();
  const url = String(input.url || "").trim();
  if (!url) throw new Error("Missing url");
  return await client.fetchAPI.create(
    {
      url,
      allowRedirects: input.allowRedirects,
      allowInsecureSsl: input.allowInsecureSsl,
      proxies: input.proxies,
    },
    input.timeoutMs ? { timeout: input.timeoutMs } : undefined,
  );
}

