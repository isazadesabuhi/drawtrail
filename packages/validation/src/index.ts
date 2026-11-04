import { z } from 'zod';

export const activityModeSchema = z.enum(['walking', 'running', 'cycling']);

/** WGS84/GeoJSON order. Regional bounds must also be checked by the editor. */
export const lngLatSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);

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
