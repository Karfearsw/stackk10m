import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";

/**
 * CodecPicker — per-browser preferred audio codec, adopted from the Telnyx
 * webrtc-demo-js settings panel.
 *
 * Options come from the browser's own RTCRtpReceiver capabilities (the same
 * source the @telnyx/webrtc SDK documents for `preferred_codecs` on newCall),
 * falling back to the common Telnyx set when the API is unavailable. A codec
 * is a browser/device concern, so the choice lives in localStorage rather than
 * the server — useTelnyxRTCCall reads it on every outbound WebRTC dial.
 */

export const PREFERRED_CODEC_KEY = "ol.preferredAudioCodec";

const FALLBACK_CODECS = ["opus", "PCMU", "PCMA", "G722"];

export function listBrowserAudioCodecs(): string[] {
  try {
    const RTCRtpReceiverAny = (window as any).RTCRtpReceiver;
    const caps = RTCRtpReceiverAny?.getCapabilities?.("audio");
    const codecs = Array.isArray(caps?.codecs) ? caps.codecs : [];
    const names: string[] = codecs
      .map((c: any) => String(c?.mimeType || "").split("/")[1] || "")
      .filter(Boolean);
    const unique = Array.from(new Set(names));
    if (unique.length) return unique;
  } catch {}
  return FALLBACK_CODECS;
}

export function getPreferredCodec(): string | null {
  try {
    return window.localStorage.getItem(PREFERRED_CODEC_KEY);
  } catch {
    return null;
  }
}

export function setPreferredCodec(codec: string | null) {
  try {
    if (codec) window.localStorage.setItem(PREFERRED_CODEC_KEY, codec);
    else window.localStorage.removeItem(PREFERRED_CODEC_KEY);
  } catch {}
}

/**
 * Resolve the stored preference to full codec objects for the SDK's
 * `preferred_codecs` newCall option (the SDK expects codec objects, not names).
 */
export function resolvePreferredCodecs(): Array<{ mimeType: string }> | undefined {
  const wanted = getPreferredCodec();
  if (!wanted) return undefined;
  try {
    const RTCRtpReceiverAny = (window as any).RTCRtpReceiver;
    const caps = RTCRtpReceiverAny?.getCapabilities?.("audio");
    const codecs = Array.isArray(caps?.codecs) ? caps.codecs : [];
    const match = codecs.filter(
      (c: any) => String(c?.mimeType || "").toLowerCase() === `audio/${wanted.toLowerCase()}`,
    );
    if (match.length) return match;
  } catch {}
  return undefined;
}

export function CodecPicker() {
  const options = useMemo(() => listBrowserAudioCodecs(), []);
  const [value, setValue] = useState<string>(() => getPreferredCodec() || "");

  useEffect(() => {
    setValue(getPreferredCodec() || "");
  }, []);

  return (
    <div className="space-y-1" data-testid="codec-picker">
      <Label htmlFor="preferred-codec">Preferred audio codec</Label>
      <select
        id="preferred-codec"
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          setPreferredCodec(next || null);
        }}
        title="Applies to WebRTC calls from this browser on the next dial"
      >
        <option value="">Auto (browser default)</option>
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        Applies to WebRTC calls from this browser on the next dial.
      </p>
    </div>
  );
}
