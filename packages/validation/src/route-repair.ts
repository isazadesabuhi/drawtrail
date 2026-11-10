import { z } from 'zod';
import { routeElevationSchema } from './elevation';

const activityModeSchema = z.enum(['walking', 'running', 'cycling']);
const lngLatSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
const routePreferencesSchema = z
  .object({
    hills: z.enum(['flatter', 'balanced', 'hilly']),
    cyclingRoads: z.enum(['paths', 'balanced', 'roads']),
    cyclingSurface: z.enum(['paved', 'any', 'rough']),
  })
  .strict();

const lineSchema = z
  .object({
    type: z.literal('LineString'),
    coordinates: z.array(lngLatSchema).min(2).max(8192),
  })
  .strict();

export const routeRepairRequestSchema = z
  .object({
    mode: activityModeSchema,
    route: lineSchema,
    targetGeometry: lineSchema,
    startRatio: z.number().finite().min(0).max(0.9),
    endRatio: z.number().finite().min(0.1).max(1),
    viaWaypoints: z.array(lngLatSchema).max(4),
    preferences: routePreferencesSchema.optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.endRatio - request.startRatio < 0.1) {
      context.addIssue({
        code: 'custom',
        path: ['endRatio'],
        message: 'Select a route section at least 10% of the route long.',
      });
    }
  });

export const routeRepairSuccessSchema = z
  .object({
    status: z.literal('success'),
    elevation: routeElevationSchema.optional(),
    route: z
      .object({
        type: z.literal('Feature'),
        properties: z.object({ mode: activityModeSchema }).strict(),
        geometry: lineSchema,
      })
      .strict(),
    distanceMeters: z.number().finite().positive(),
    similarityScore: z.number().finite().min(0).max(1),
    retracingMeters: z.number().finite().min(0),
    waypointCount: z.number().int().min(2).max(40),
    warnings: z.array(z.string().min(1)),
  })
  .strict();

export type RouteRepairRequest = z.infer<typeof routeRepairRequestSchema>;
export type RouteRepairSuccess = z.infer<typeof routeRepairSuccessSchema>;
