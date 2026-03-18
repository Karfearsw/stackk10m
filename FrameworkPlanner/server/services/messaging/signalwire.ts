export type SendSmsInput = {
  to: string;
  body: string;
  from?: string;
};

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`${name} is not configured`);
  return String(v).trim();
}

export async function sendSignalWireSms(input: SendSmsInput): Promise<{ messageSid: string }> {
  const projectId = requireEnv("SIGNALWIRE_PROJECT_ID");
  const apiToken = requireEnv("SIGNALWIRE_API_TOKEN");
  const spaceUrl = requireEnv("SIGNALWIRE_SPACE_URL");

  const from = input.from || process.env.SIGNALWIRE_FROM_NUMBER;
  if (!from || !String(from).trim()) throw new Error("SIGNALWIRE_FROM_NUMBER is not configured");

  const endpoint = `https://${spaceUrl}/api/laml/2010-04-01/Accounts/${projectId}/Messages.json`;
  const auth = Buffer.from(`${projectId}:${apiToken}`).toString("base64");

  const form = new URLSearchParams();
  form.append("From", from);
  form.append("To", input.to);
  form.append("Body", input.body);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || "SMS send failed");
  }
  return { messageSid: String(data.sid || data.Sid || "") };
}

