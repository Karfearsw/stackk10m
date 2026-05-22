export const MAX_TIME_ENTRY_HOURS = 16;
export const MIN_TIME_ENTRY_MINUTES = 5;

function parseTimeHm(raw: unknown) {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number.parseInt(m[1], 10);
  const min = Number.parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23) return null;
  if (min < 0 || min > 59) return null;
  return { h, m: min };
}

export function computeManualTimeEntry(input: { date: string; startTime: string; endTime: string }) {
  const start = parseTimeHm(input.startTime);
  const end = parseTimeHm(input.endTime);
  if (!start || !end) {
    return { ok: false as const, error: "Invalid startTime/endTime" };
  }
  const startMinutes = start.h * 60 + start.m;
  const endMinutes = end.h * 60 + end.m;
  let durationMinutes = endMinutes - startMinutes;
  if (durationMinutes < 0) durationMinutes += 24 * 60;
  if (durationMinutes === 0) return { ok: false as const, error: "Start and end times are the same" };
  const hours = durationMinutes / 60;
  const flags: string[] = [];
  let status: string = "draft";
  let payableHours: number | null = null;
  if (durationMinutes > MAX_TIME_ENTRY_HOURS * 60) {
    flags.push("duration_over_max");
    status = "disputed";
    payableHours = 0;
  } else if (durationMinutes < MIN_TIME_ENTRY_MINUTES) {
    flags.push("too_short");
    status = "disputed";
    payableHours = 0;
  }
  return { ok: true as const, hours, flags, status, payableHours };
}

