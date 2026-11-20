export const ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function isActivityWithinWindow(value, cutoff) {
  const occurredAt = Date.parse(value);
  return Number.isFinite(occurredAt) && Number.isFinite(cutoff)
    && occurredAt >= cutoff && occurredAt <= cutoff + ACTIVITY_WINDOW_MS;
}
