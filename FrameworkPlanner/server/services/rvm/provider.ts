import { TelnyxClient, TelnyxConfigError } from "../telecom/telnyx-client.js";
import {
  isTelephonyMediaStorageConfigured,
  getTelephonyMediaSignedUrl,
  putTelephonyMediaObject,
} from "../../telephony/objectStorage.js";
import { storage } from "../../storage.js";

export type RvmDropRequest = {
  audioAssetId: number;
  toNumbers: string[];
};

export type RvmDropStatus = "queued" | "sending" | "sent" | "failed";

export type RvmDropResult = {
  toNumber: string;
  status: RvmDropStatus;
  providerId?: string | null;
  error?: string | null;
};

export interface RvmProvider {
  name: string;
  requestDrops(input: RvmDropRequest): Promise<RvmDropResult[]>;
  pollStatuses(providerIds: string[]): Promise<Record<string, { status: RvmDropStatus; error?: string | null }>>;
}

// Real ringless-voicemail delivery over Telnyx Call Control:
//  1. The voicemail audio (stored in rvm_audio_assets) is pushed once into the
//     telephony media bucket and served to Telnyx via a short-lived signed URL.
//  2. Each drop is a real outbound Call Control call with
//     answering_machine_detection enabled.
//  3. When Telnyx reports "human_detected", the app plays the audio; when the
//     call ends we hang up — leaving an actual voicemail. Delivery state is
//     tracked in rvm_drops via the real call_control_id, updated by the
//     /api/telnyx/webhook handler (rvm.* events) and the poller.
export class TelnyxRvmProvider implements RvmProvider {
  name = "telnyx";
  private client = new TelnyxClient();

  private async requireConfig(): Promise<void> {
    if (!process.env.TELNYX_API_KEY) throw new TelnyxConfigError(["TELNYX_API_KEY"]);
    if (!process.env.TELNYX_CONNECTION_ID) throw new TelnyxConfigError(["TELNYX_CONNECTION_ID"]);
    if (!isTelephonyMediaStorageConfigured()) {
      throw new Error(
        "RVM over Telnyx requires TELEPHONY_MEDIA_* object storage so the voicemail audio can be served to Telnyx over a signed URL. Configure TELEPHONY_MEDIA_BUCKET / REGION / ACCESS_KEY_ID / SECRET_ACCESS_KEY.",
      );
    }
  }

  /** Upload the voicemail audio to object storage once and reuse a signed URL until it nears expiry. */
  private async getAudioUrl(audioAssetId: number): Promise<string> {
    return getRvmAudioUrl(audioAssetId);
  }

  async requestDrops(input: RvmDropRequest): Promise<RvmDropResult[]> {
    await this.requireConfig();
    const audioUrl = await this.getAudioUrl(input.audioAssetId);
    const from = process.env.TELNYX_DEFAULT_FROM_NUMBER || "";

    const out: RvmDropResult[] = [];
    for (const toNumber of input.toNumbers) {
      try {
        // Real Call Control call with machine detection; playback + hangup are
        // driven by the webhook handler on call.machine.* / call.human.*.
        const { callControlId } = await this.client.dial({
          to: toNumber,
          from,
          answeringMachineDetection: { advanced: true },
          clientState: Buffer.from(
            JSON.stringify({ kind: "rvm", audioAssetId: input.audioAssetId }),
          ).toString("base64"),
        });
        out.push({ toNumber, status: "sending", providerId: callControlId });
      } catch (e: any) {
        out.push({ toNumber, status: "failed", providerId: null, error: String(e?.message || e) });
      }
    }
    return out;
  }

  async pollStatuses(providerIds: string[]): Promise<Record<string, { status: RvmDropStatus; error?: string | null }>> {
    // Call Control terminal state arrives via webhooks (which know whether a
    // voicemail was actually left). A bare status poll cannot distinguish a
    // completed drop from a human answering, so it never flips rows to
    // "sent" — the poller only marks long-stuck rows failed.
    const out: Record<string, { status: RvmDropStatus; error?: string | null }> = {};
    for (const id of providerIds) out[id] = { status: "sending" as RvmDropStatus };
    return out;
  }
}

// Module-level signed-URL cache shared by the launch path and the webhook
// handler (so playback events can re-derive the URL for the same asset).
let audioUrlCache: { audioAssetId: number; url: string; expiresAt: number } | null = null;

export async function getRvmAudioUrl(audioAssetId: number): Promise<string> {
  const now = Date.now();
  if (audioUrlCache && audioUrlCache.audioAssetId === audioAssetId && audioUrlCache.expiresAt > now + 60_000) {
    return audioUrlCache.url;
  }
  const asset = await storage.getRvmAudioAssetById(audioAssetId);
  if (!asset) throw new Error(`RVM audio asset ${audioAssetId} not found`);
  const buf = Buffer.from(String(asset.contentBase64 || ""), "base64");
  if (!buf.length) throw new Error(`RVM audio asset ${audioAssetId} is empty`);

  const key = `rvm/${audioAssetId}/${String(asset.name || "audio").replace(/[^\w.\-]+/g, "_").slice(0, 80)}`;
  await uploadTelephonyMediaObject({ key, body: buf, contentType: String(asset.mimeType || "audio/mpeg") });
  const url = await getTelephonyMediaSignedUrl({ key, expiresInSeconds: 6 * 60 * 60 });
  if (!url) throw new Error("Failed to sign RVM audio URL");
  audioUrlCache = { audioAssetId, url, expiresAt: now + 6 * 60 * 60 * 1000 };
  return url;
}

async function uploadTelephonyMediaObject(input: { key: string; body: Buffer; contentType: string }) {
  await putTelephonyMediaObject(input);
}

export function getRvmProvider(): RvmProvider {
  // No mock/demo provider exists: this is the only RVM implementation and it
  // performs real Telnyx Call Control drops. Missing configuration fails the
  // launch loudly instead of fabricating "sent" rows.
  return new TelnyxRvmProvider();
}
