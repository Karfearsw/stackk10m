export type DialerConnectionState = "idle" | "connecting" | "ready" | "error";

export type DialerCallState = "idle" | "dialing" | "ringing" | "connected" | "held" | "ended" | "failed";

export type DialerListId = "new" | "followups_due" | "all_callable";

export type DialerDisposition =
  | "answered"
  | "missed"
  | "failed"
  | "no_answer"
  | "wrong_number"
  | "do_not_call"
  | "call_back";

export interface DialerQueueItem {
  leadId: number;
  ownerName: string;
  ownerPhone: string;
  address: string;
  city: string;
  state: string;
  status: string | null;
  nextFollowUpAt: string | null;
  lastCallAt: string | null;
}

