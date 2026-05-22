export type TodayQueueItem = {
  id: number;
  title: string;
  description: string | null;
  type: string | null;
  dueAt: string | null;
  priority: string | null;
  status: string | null;
  assignedToUserId: number | null;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
  snoozeCount: number;
  lastSnoozedAt: string | null;
  lastSnoozeReason: string | null;
  score: number;
  buckets: { overdue: boolean; dueToday: boolean };
  assignee: { id: number; label: string } | null;
  lead: {
    id: number;
    address: string;
    zipCode: string;
    source: string | null;
    status: string | null;
    relasScore: number | null;
    estimatedValue: string | null;
    lastTouchAt: string | null;
  } | null;
  opportunity: {
    id: number;
    address: string;
    zipCode: string;
    status: string | null;
    price: string | null;
    arv: string | null;
    leadSource: string | null;
    leadSourceDetail: string | null;
  } | null;
};

export type TodayQueueGroup = {
  key: string;
  label: string;
  count: number;
  meta: { type: string | null; source: string | null; zipCode: string | null; assigneeLabel: string | null };
  items: TodayQueueItem[];
};

export type TodayQueueResponse = {
  start: string;
  end: string;
  counts: { overdue: number; dueToday: number; total: number; snoozeBlocked: number };
  top: TodayQueueItem[];
  groups: TodayQueueGroup[];
};

