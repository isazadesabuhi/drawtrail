import { z } from 'zod';

export const activityModeSchema = z.enum(['walking', 'running', 'cycling']);

/** WGS84/GeoJSON order. Regional bounds must also be checked by the editor. */
export const lngLatSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
