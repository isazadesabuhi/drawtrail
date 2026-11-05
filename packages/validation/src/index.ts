import { z } from 'zod';

export const activityModeSchema = z.enum(['walking', 'running', 'cycling']);

/** WGS84/GeoJSON order. Regional bounds must also be checked by the editor. */
export const lngLatSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);

/** Lyon editor bounds catch reversed [latitude, longitude] input as well as world-range errors. */
export const lyonLngLatSchema = lngLatSchema.superRefine(
  ([longitude, latitude], context) => {
    if (
      longitude < 4.65 ||
      longitude > 5.02 ||
      latitude < 45.63 ||
      latitude > 45.9
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Coordinate must be [longitude, latitude] inside the Lyon editor area.',
      });
    }
  },
);

export const geoJSONLineFeatureCollectionSchema = z
  .object({
    type: z.literal('FeatureCollection'),
    features: z.array(
      z
        .object({
          type: z.literal('Feature'),
          id: z.string().optional(),
          properties: z.record(z.string(), z.unknown()),
          geometry: z
            .object({
              type: z.literal('LineString'),
              coordinates: z.array(lyonLngLatSchema).min(2),
            })
            .strict(),
        })
        .strict(),
    ),
  })
  .strict();

export const DRAWING_LIMITS = {
  strokes: 24,
  pointsPerStroke: 2048,
  totalPoints: 8192,
} as const;
const drawingPointSchema = z.tuple([
  z.number().finite().min(0).max(1),
  z.number().finite().min(0).max(1),
]);
export const drawingStrokeSchema = z
  .object({
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(120),
    closed: z.boolean(),
    points: z
      .array(drawingPointSchema)
      .min(2)
      .max(DRAWING_LIMITS.pointsPerStroke),
  })
  .strict()
  .superRefine((stroke, context) => {
    const first = stroke.points[0]!;
    if (
      !stroke.points.some(
        (point) => point[0] !== first[0] || point[1] !== first[1],
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A stroke needs two different points.',
      });
    }
    const last = stroke.points.at(-1)!;
    if (
      stroke.closed &&
      (stroke.points.length < 4 || first[0] !== last[0] || first[1] !== last[1])
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Closed strokes must end at their first point and have at least three vertices.',
      });
    }
  });
export const drawingSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1).max(120),
    source: z.enum(['freehand', 'preset', 'svg', 'silhouette']),
    strokes: z.array(drawingStrokeSchema).max(DRAWING_LIMITS.strokes),
  })
  .strict()
  .superRefine((drawing, context) => {
    if (
      new Set(drawing.strokes.map((stroke) => stroke.id)).size !==
      drawing.strokes.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Stroke IDs must be unique.',
      });
    }
    if (
      drawing.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0) >
      DRAWING_LIMITS.totalPoints
    ) {
      context.addIssue({
        code: 'custom',
        message: 'The drawing has too many points.',
      });
    }
  });
export const drawingDraftSchema = z
  .object({
    version: z.literal(1),
    drawing: drawingSchema,
    selectedStrokeId: z.string().max(80).nullable(),
  })
  .strict();

export const routeGenerationRequestSchema = z
  .object({
    drawing: drawingSchema,
    center: lngLatSchema,
    mode: activityModeSchema,
    targetDistanceKm: z.number().finite().min(0.2).max(20),
    loop: z.boolean(),
    bounds: z
      .object({
        radiusMeters: z.number().finite().min(100).max(50_000),
        continuityToleranceMeters: z.number().finite().min(0.25).max(20),
      })
      .strict(),
    settings: z
      .object({
        maxWaypoints: z.number().int().min(2).max(32),
        seed: z.string().min(1).max(120),
        placement: z
          .object({
            rotationDegrees: z.number().finite().min(-180).max(180),
            scale: z.number().finite().min(0.5).max(2),
            offsetEastMeters: z.number().finite().min(-50_000).max(50_000),
            offsetNorthMeters: z.number().finite().min(-50_000).max(50_000),
          })
          .strict(),
        searchArea: z
          .object({
            radiusMeters: z.number().finite().min(250).max(25_000),
            candidateCount: z.number().int().min(2).max(16),
            maxDistanceDeviationRatio: z
              .number()
              .finite()
              .min(0.05)
              .max(2)
              .optional(),
            maxRuntimeMs: z.number().int().min(1000).max(120_000).optional(),
            maxRouterRequests: z.number().int().min(1).max(512).optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();

const routeGenerationErrorCodeSchema = z.enum([
  'invalid_request',
  'invalid_drawing',
  'unsupported_multistroke',
  'infeasible_waypoint',
  'no_route',
  'missing_region',
  'engine_down',
  'timeout',
  'cancelled',
  'route_discontinuity',
  'invalid_response',
  'optimization_budget',
]);

const routeGenerationAlternativeSchema = z
  .object({
    id: z.string().min(1).max(80),
    targetGeometry: z
      .object({
        type: z.literal('LineString'),
        coordinates: z.array(lngLatSchema).min(2),
      })
      .strict(),
    route: z
      .object({
        type: z.literal('Feature'),
        properties: z.object({ mode: activityModeSchema }).strict(),
        geometry: z
          .object({
            type: z.literal('LineString'),
            coordinates: z.array(lngLatSchema).min(2),
          })
          .strict(),
      })
      .strict(),
    distanceMeters: z.number().finite().positive(),
    similarityScore: z.number().finite().min(0).max(1),
    retracingMeters: z.number().finite().min(0),
    score: z.number().finite(),
    waypointCount: z.number().int().min(2).max(32),
    warnings: z.array(z.string().min(1)),
  })
  .strict();

export const routeGenerationSuccessSchema = z
  .object({
    status: z.literal('success'),
    targetGeometry: z
      .object({
        type: z.literal('LineString'),
        coordinates: z.array(lngLatSchema).min(2),
      })
      .strict(),
    route: z
      .object({
        type: z.literal('Feature'),
        properties: z.object({ mode: activityModeSchema }).strict(),
        geometry: z
          .object({
            type: z.literal('LineString'),
            coordinates: z.array(lngLatSchema).min(2),
          })
          .strict(),
      })
      .strict(),
    distanceMeters: z.number().finite().positive(),
    requestedDistanceMeters: z.number().finite().positive(),
    similarityScore: z.number().finite().min(0).max(1),
    retracingMeters: z.number().finite().min(0),
    waypointCount: z.number().int().min(2).max(32),
    warnings: z.array(z.string().min(1)),
    alternatives: z
      .array(routeGenerationAlternativeSchema)
      .min(1)
      .max(3)
      .optional(),
  })
  .strict();

export const routeGenerationFailureSchema = z
  .object({
    status: z.literal('error'),
    code: routeGenerationErrorCodeSchema,
    message: z.string().min(1),
    waypointIndex: z.number().int().min(0).optional(),
    warnings: z.array(z.string().min(1)),
  })
  .strict();

export const routeGenerationResponseSchema = z.discriminatedUnion('status', [
  routeGenerationSuccessSchema,
  routeGenerationFailureSchema,
]);

export const apiErrorCodeSchema = z.enum([
  'invalid_request',
  'invalid_drawing',
  'unsupported_multistroke',
  'infeasible_waypoint',
  'no_route',
  'missing_region',
  'engine_down',
  'timeout',
  'cancelled',
  'route_discontinuity',
  'invalid_response',
  'optimization_budget',
  'not_found',
  'service_unavailable',
  'idempotency_conflict',
  'internal_error',
]);

export function apiEnvelopeSchema<T extends z.ZodType>(dataSchema: T) {
  return z.discriminatedUnion('status', [
    z
      .object({
        apiVersion: z.literal('v1'),
        status: z.literal('success'),
        data: dataSchema,
        error: z.null(),
      })
      .strict(),
    z
      .object({
        apiVersion: z.literal('v1'),
        status: z.literal('error'),
        data: z.null(),
        error: z
          .object({
            code: apiErrorCodeSchema,
            message: z.string().min(1),
            warnings: z.array(z.string().min(1)).default([]),
          })
          .strict(),
      })
      .strict(),
  ]);
}

export const generationJobStateSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export const generationProgressSchema = z
  .object({
    stage: z.string().min(1),
    completed: z.number().int().min(0),
    total: z.number().int().min(1),
  })
  .strict();
export const generationJobAcceptedSchema = z
  .object({
    id: z.string().uuid(),
    state: generationJobStateSchema,
    statusUrl: z.string().startsWith('/api/v1/generations/'),
    reused: z.boolean(),
  })
  .strict();
export const generationJobStatusSchema = z
  .object({
    id: z.string().uuid(),
    state: generationJobStateSchema,
    progress: generationProgressSchema.nullable(),
    result: routeGenerationSuccessSchema.nullable(),
    error: z
      .object({
        code: apiErrorCodeSchema,
        message: z.string().min(1),
      })
      .strict()
      .nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    startedAt: z.string().datetime().nullable(),
    completedAt: z.string().datetime().nullable(),
  })
  .strict();

export type RouteGenerationRequest = z.infer<
  typeof routeGenerationRequestSchema
>;
export type RouteGenerationSuccess = z.infer<
  typeof routeGenerationSuccessSchema
>;
export type RouteGenerationAlternative = z.infer<
  typeof routeGenerationAlternativeSchema
>;
export type RouteGenerationFailure = z.infer<
  typeof routeGenerationFailureSchema
>;
export type RouteGenerationResponse = z.infer<
  typeof routeGenerationResponseSchema
>;
export type GenerationJobAccepted = z.infer<typeof generationJobAcceptedSchema>;
export type GenerationJobStatus = z.infer<typeof generationJobStatusSchema>;
export type GenerationJobState = z.infer<typeof generationJobStateSchema>;
export type GenerationProgress = z.infer<typeof generationProgressSchema>;
