import type { LngLat } from '@drawtrail/types';
export * from './drawing';
export * from './geographic';
export * from './routing';

/** Initial editor location, not a claim of loaded routing coverage. */
export const LYON_CENTER: LngLat = [4.8357, 45.764];

export const LYON_ZOOM = 13;
/** Editor test area only; this is not a statement of routing coverage. */
export const LYON_BOUNDS = [
  [4.65, 45.63],
  [5.02, 45.9],
] as const;

export function isInsideLyon([longitude, latitude]: LngLat): boolean {
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= LYON_BOUNDS[0][0] &&
    longitude <= LYON_BOUNDS[1][0] &&
    latitude >= LYON_BOUNDS[0][1] &&
    latitude <= LYON_BOUNDS[1][1]
  );
}
