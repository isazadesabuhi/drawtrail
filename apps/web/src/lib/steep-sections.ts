export interface ElevationSamplePoint {
  distanceMeters: number;
  elevationMeters: number | null;
}

export interface SteepSection {
  direction: 'climb' | 'descent';
  startDistanceMeters: number;
  endDistanceMeters: number;
  gradePercent: number;
}

export const STEEP_GRADE_THRESHOLD_PERCENT = 8;
export const STEEP_MIN_DISTANCE_METERS = 60;

/** Find sustained steep intervals without bridging missing or noisy samples. */
export function findSteepSections(
  samples: readonly ElevationSamplePoint[],
): SteepSection[] {
  const sections: SteepSection[] = [];
  let startDistance: number | null = null;
  let endDistance = 0;
  let startElevation = 0;
  let endElevation = 0;
  let direction: SteepSection['direction'] | null = null;
  let intervalCount = 0;

  const finish = () => {
    if (
      direction &&
      startDistance !== null &&
      endDistance - startDistance >= STEEP_MIN_DISTANCE_METERS &&
      intervalCount >= 2
    ) {
      const gradePercent =
        ((endElevation - startElevation) / (endDistance - startDistance)) * 100;
      sections.push({
        direction,
        startDistanceMeters: startDistance,
        endDistanceMeters: endDistance,
        gradePercent,
      });
    }
    startDistance = null;
    direction = null;
    intervalCount = 0;
  };

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    const distance = current.distanceMeters - previous.distanceMeters;
    if (
      previous.elevationMeters === null ||
      current.elevationMeters === null ||
      !Number.isFinite(distance) ||
      distance <= 0
    ) {
      finish();
      continue;
    }
    const delta = current.elevationMeters - previous.elevationMeters;
    const grade = (delta / distance) * 100;
    const intervalDirection =
      grade >= STEEP_GRADE_THRESHOLD_PERCENT
        ? 'climb'
        : grade <= -STEEP_GRADE_THRESHOLD_PERCENT
          ? 'descent'
          : null;
    if (!intervalDirection) {
      finish();
      continue;
    }
    if (direction !== intervalDirection) {
      finish();
      startDistance = previous.distanceMeters;
      startElevation = previous.elevationMeters;
      direction = intervalDirection;
    }
    endDistance = current.distanceMeters;
    endElevation = current.elevationMeters;
    intervalCount += 1;
  }
  finish();
  return sections;
}
