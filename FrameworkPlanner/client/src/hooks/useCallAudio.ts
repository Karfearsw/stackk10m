import { useCallback, useEffect, useRef } from "react";

/**
 * In-browser call audio for the click-to-dial dialers.
 *
 * This does NOT transport call media (calls are anchored on real phone numbers
 * via Telnyx call control). It only gives the agent audible feedback:
 *  - a repeating US ringback tone while the call is dialing/ringing,
 *  - a short "connected" chime when the call is answered,
 * so a placed call is not silent in the browser.
 */
export function useCallAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const ringNodesRef = useRef<{ oscA: OscillatorNode; oscB: OscillatorNode; gain: GainNode } | null>(null);

  const getCtx = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  }, []);

  const stopRingback = useCallback(() => {
    const nodes = ringNodesRef.current;
    ringNodesRef.current = null;
    if (!nodes) return;
    try {
      const t = nodes.gain.context.currentTime;
      nodes.gain.gain.cancelScheduledValues(t);
      nodes.gain.gain.setValueAtTime(nodes.gain.gain.value, t);
      nodes.gain.gain.linearRampToValueAtTime(0, t + 0.1);
      window.setTimeout(() => {
        try {
          nodes.oscA.stop();
          nodes.oscB.stop();
          nodes.oscA.disconnect();
          nodes.oscB.disconnect();
          nodes.gain.disconnect();
        } catch {}
      }, 150);
    } catch {}
  }, []);

  const startRingback = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    stopRingback();

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const gain = ctx.createGain();
    oscA.type = "sine";
    oscA.frequency.value = 440;
    oscB.type = "sine";
    oscB.frequency.value = 480;
    gain.gain.value = 0;

    const master = ctx.createGain();
    master.gain.value = 0.14;
    oscA.connect(gain);
    oscB.connect(gain);
    gain.connect(master);
    master.connect(ctx.destination);

    oscA.start();
    oscB.start();

    // US ringback cadence: on for 2s, off for 4s.
    const pattern = [2, 4];
    let i = 0;
    const step = () => {
      if (!ringNodesRef.current) return;
      const isOn = i % 2 === 0;
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(isOn ? 0.7 : 0, now);
      i += 1;
      const waitMs = pattern[(i - 1) % pattern.length] * 1000;
      ringNodesRef.current && (window.setTimeout(step, waitMs));
    };
    step();

    ringNodesRef.current = { oscA, oscB, gain };
    return ctx;
  }, [getCtx, stopRingback]);

  const playConnectTone = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.03);
    gain.gain.setValueAtTime(0.15, ctx.currentTime + 0.18);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  }, [getCtx]);

  // Start the AudioContext on first user gesture so browser autoplay rules pass.
  useEffect(() => {
    const unlock = () => getCtx();
    window.addEventListener("pointerdown", unlock as any);
    window.addEventListener("keydown", unlock as any);
    return () => {
      window.removeEventListener("pointerdown", unlock as any);
      window.removeEventListener("keydown", unlock as any);
    };
  }, [getCtx]);

  useEffect(() => {
    return () => {
      stopRingback();
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
    };
  }, [stopRingback]);

  return { startRingback, stopRingback, playConnectTone };
}
