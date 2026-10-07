// @vitest-environment jsdom
/**
 * CallBar unification tests (Dialer PRD Task A).
 *
 * Proves:
 *  1. CallBar renders the full call-state machine identically wherever it is
 *     used (both dialer pages render the SAME component with the same props —
 *     asserted structurally below, and deterministically here).
 *  2. The bar never dials by itself: every control delegates to page-provided
 *     callbacks, so the server-side DNC gates in the pages' makeCall paths
 *     cannot be bypassed (zero network calls during bar interaction).
 *  3. Two-leg sessions map onto the unified vocabulary via sessionToCallBarCall.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  CallBar,
  formatCallElapsed,
  sessionToCallBarCall,
  type CallBarProps,
} from "@/components/telephony/CallBar";

const APP = path.resolve(__dirname, "..");

function baseProps(overrides: Partial<CallBarProps> = {}): CallBarProps {
  return {
    call: null,
    onMute: vi.fn(),
    onHold: vi.fn(),
    onHangup: vi.fn(),
    onDTMF: vi.fn(),
    ...overrides,
  };
}

describe("CallBar state machine", () => {
  it("idle shows Ready with no call buttons", () => {
    const { container } = render(<CallBar {...baseProps()} />);
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(container.querySelector('[data-testid="call-bar-hangup"]')).toBeNull();
  });

  it("dialing shows Dialing… with mute/hold/keypad/end", () => {
    render(
      <CallBar
        {...baseProps({
          call: { state: "dialing", muted: false, remoteNumber: "+15551234567" },
          contactName: "Jane Seller",
        })}
      />,
    );
    expect(screen.getByText("Jane Seller")).toBeTruthy();
    expect(screen.getByText(/Dialing/)).toBeTruthy();
    for (const id of ["mute", "hold", "keypad-toggle", "hangup"]) {
      expect(screen.getByTestId(`call-bar-${id}`)).toBeTruthy();
    }
  });

  it("active shows Connected, elapsed timer, and muted state", () => {
    render(
      <CallBar
        {...baseProps({
          call: { state: "active", muted: true, remoteNumber: "+15551234567" },
          elapsedMs: 125000,
        })}
      />,
    );
    expect(screen.getByText(/Connected/)).toBeTruthy();
    expect(screen.getByText("+15551234567 • 2:05")).toBeTruthy();
    expect(screen.getByText("Unmute")).toBeTruthy();
  });

  it("held shows Resume and On hold", () => {
    render(
      <CallBar {...baseProps({ call: { state: "held", muted: false, remoteNumber: "+1555" } })} />,
    );
    expect(screen.getByText(/On hold/)).toBeTruthy();
    expect(screen.getByText("Resume")).toBeTruthy();
  });

  it("failed shows Call failed with no in-call buttons", () => {
    const { container } = render(
      <CallBar {...baseProps({ call: { state: "failed", muted: false, remoteNumber: "+1555" } })} />,
    );
    expect(screen.getByText(/Call failed/)).toBeTruthy();
    expect(container.querySelector('[data-testid="call-bar-hangup"]')).toBeNull();
  });

  it("incoming variant shows answer/decline with caller info", () => {
    const onAnswer = vi.fn();
    const onDecline = vi.fn();
    render(
      <CallBar
        {...baseProps({
          incoming: { remoteNumber: "+15559876543", callerName: "Bob Buyer", onAnswer, onDecline },
        })}
      />,
    );
    expect(screen.getByText("Bob Buyer")).toBeTruthy();
    fireEvent.click(screen.getByTestId("call-bar-answer"));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("call-bar-decline"));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it("DTMF keypad opens and routes digits to onDTMF", () => {
    const onDTMF = vi.fn();
    render(
      <CallBar
        {...baseProps({
          call: { state: "active", muted: false, remoteNumber: "+1555" },
          onDTMF,
        })}
      />,
    );
    fireEvent.click(screen.getByTestId("call-bar-keypad-toggle"));
    fireEvent.click(screen.getByTestId("call-bar-dtmf-5"));
    fireEvent.click(screen.getByTestId("call-bar-dtmf-#"));
    expect(onDTMF).toHaveBeenNthCalledWith(1, "5");
    expect(onDTMF).toHaveBeenNthCalledWith(2, "#");
  });

  it("mute/hold/hangup delegate to props", () => {
    const onMute = vi.fn();
    const onHold = vi.fn();
    const onHangup = vi.fn();
    render(
      <CallBar
        {...baseProps({
          call: { state: "active", muted: false, remoteNumber: "+1555" },
          onMute,
          onHold,
          onHangup,
        })}
      />,
    );
    fireEvent.click(screen.getByTestId("call-bar-mute"));
    fireEvent.click(screen.getByTestId("call-bar-hold"));
    fireEvent.click(screen.getByTestId("call-bar-hangup"));
    expect(onMute).toHaveBeenCalledTimes(1);
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(onHangup).toHaveBeenCalledTimes(1);
  });
});

describe("CallBar never dials (DNC gates stay in the pages)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("makes zero network calls no matter which buttons are pressed", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in test"));
    const props = baseProps({
      call: { state: "active", muted: false, remoteNumber: "+15551234567" },
    });
    render(<CallBar {...props} />);
    for (const id of ["mute", "hold", "keypad-toggle", "hangup"]) {
      fireEvent.click(screen.getByTestId(`call-bar-${id}`));
    }
    fireEvent.click(screen.getByTestId("call-bar-dtmf-1"));
    expect(fetchSpy).not.toHaveBeenCalled();
    // And the bar exposes no dial/makeCall prop at all.
    expect("onDial" in props).toBe(false);
    expect("makeCall" in props).toBe(false);
  });
});

describe("CallBar renders identically on both dialer pages", () => {
  const canonical: CallBarProps = {
    call: { state: "active", muted: false, remoteNumber: "+15551234567" },
    contactName: "Jane Seller",
    displayNumber: "+15551234567",
    elapsedMs: 61000,
    onMute: () => {},
    onHold: () => {},
    onHangup: () => {},
    onDTMF: () => {},
  };

  it("produces byte-identical markup for identical props (workspace vs phone)", () => {
    const { container: workspace } = render(<CallBar {...canonical} />);
    const { container: phone } = render(<CallBar {...canonical} />);
    expect(workspace.innerHTML).toBe(phone.innerHTML);
  });

  it("both pages render the shared CallBar (no duplicated inline controls)", () => {
    const phoneSrc = fs.readFileSync(path.join(APP, "client/src/pages/phone.tsx"), "utf8");
    const widgetSrc = fs.readFileSync(
      path.join(APP, "client/src/components/dialer/widgets/PhoneWidget.tsx"),
      "utf8",
    );
    for (const [name, src] of [["phone.tsx", phoneSrc], ["PhoneWidget.tsx", widgetSrc]] as const) {
      expect(src, name).toContain("@/components/telephony/CallBar");
      expect(src.match(/<CallBar[\s>]/g)?.length, name).toBe(1);
    }
  });
});

describe("sessionToCallBarCall", () => {
  it("maps two-leg session statuses onto the unified vocabulary", () => {
    expect(sessionToCallBarCall({ status: "lead_ringing" })?.state).toBe("dialing");
    expect(sessionToCallBarCall({ status: "bridging" })?.state).toBe("dialing");
    expect(sessionToCallBarCall({ status: "connected" })?.state).toBe("active");
    expect(
      sessionToCallBarCall({ status: "connected" }, { held: true })?.state,
    ).toBe("held");
    expect(sessionToCallBarCall({ status: "failed" })?.state).toBe("failed");
    expect(sessionToCallBarCall({ status: "completed" })?.state).toBe("finished");
    expect(sessionToCallBarCall(null)).toBeNull();
  });
});

describe("formatCallElapsed", () => {
  it("formats m:ss", () => {
    expect(formatCallElapsed(0)).toBe("0:00");
    expect(formatCallElapsed(61000)).toBe("1:01");
    expect(formatCallElapsed(null)).toBe("0:00");
  });
});
