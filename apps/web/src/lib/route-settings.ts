import type { ActivityMode } from '@drawtrail/types';
import type { RoutePreferences } from '@drawtrail/validation';

export type RouteSettings = {
  mode: ActivityMode;
  targetDistanceKm: string;
  bestShapeMatch: boolean;
  searchRadiusMeters: number | null;
  closeLoop: boolean;
  hills: RoutePreferences['hills'];
  cyclingRoads: RoutePreferences['cyclingRoads'];
  cyclingSurface: RoutePreferences['cyclingSurface'];
  maxDistanceDeviationPercent: string | null;
};

export const DEFAULT_ROUTE_SETTINGS: RouteSettings = {
  mode: 'walking',
  targetDistanceKm: '3',
  bestShapeMatch: false,
  searchRadiusMeters: null,
  closeLoop: false,
  hills: 'balanced',
  cyclingRoads: 'balanced',
  cyclingSurface: 'any',
  maxDistanceDeviationPercent: null,
};
