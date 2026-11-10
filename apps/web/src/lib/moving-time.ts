import type { ActivityMode } from '@drawtrail/types';

const DEFAULT_RATE: Record<ActivityMode, number> = {
  walking: 10,
  running: 6,
  cycling: 18,
};

export function defaultMovingRate(mode: ActivityMode) {
  return DEFAULT_RATE[mode];
}

/** Rate is min/km for walking and running, or km/h for cycling. */
export function estimateMovingTimeSeconds(
  distanceMeters: number,
  mode: ActivityMode,
  rate: number,
): number | null {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return null;
  if (!Number.isFinite(rate)) return null;

  if (mode === 'cycling') {
    if (rate < 3 || rate > 80) return null;
    return (distanceMeters / 1000 / rate) * 60 * 60;
  }
  if (rate < 2 || rate > 60) return null;
  return (distanceMeters / 1000) * rate * 60;
}

export function formatMovingTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Unavailable';
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}
