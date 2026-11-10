import { z } from 'zod';

export const elevationMetersSchema = z.number().finite().min(-500).max(10_000);
const sample = z
  .object({
    distanceMeters: z.number().finite().nonnegative(),
    elevationMeters: elevationMetersSchema.nullable(),
  })
  .strict();

export const routeElevationSchema = z
  .discriminatedUnion('status', [
    z
      .object({
        status: z.literal('unavailable'),
        source: z.literal('valhalla'),
        reason: z.enum([
          'missing_data',
          'service_unavailable',
          'invalid_response',
        ]),
      })
      .strict(),
    z
      .object({
        status: z.literal('complete'),
        source: z.literal('valhalla'),
        samples: z
          .array(sample.extend({ elevationMeters: elevationMetersSchema }))
          .min(2)
          .max(1024),
        ascentMeters: z.number().finite().nonnegative(),
        descentMeters: z.number().finite().nonnegative(),
      })
      .strict(),
    z
      .object({
        status: z.literal('partial'),
        source: z.literal('valhalla'),
        samples: z.array(sample).min(2).max(1024),
        ascentMeters: z.null(),
        descentMeters: z.null(),
      })
      .strict(),
  ])
  .superRefine((profile, context) => {
    if (profile.status === 'unavailable') return;
    if (
      profile.samples[0]!.distanceMeters !== 0 ||
      profile.samples.some(
        (point, i) =>
          i > 0 &&
          point.distanceMeters <= profile.samples[i - 1]!.distanceMeters,
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Elevation distances must start at zero and increase.',
      });
    }
    if (
      profile.status === 'partial' &&
      (!profile.samples.some((p) => p.elevationMeters === null) ||
        !profile.samples.some((p) => p.elevationMeters !== null))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Partial elevation requires both known and missing samples.',
      });
    }
  });

export type RouteElevation = z.infer<typeof routeElevationSchema>;
