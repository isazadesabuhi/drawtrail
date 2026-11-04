import type { EastNorth, GeoJSONLineString, LngLat } from '@drawtrail/types';
import { projectLngLat, unprojectEastNorth } from './geographic';

function metricPoints(line: GeoJSONLineString, anchor: LngLat): EastNorth[] {
  if (line.coordinates.length < 2) {
    throw new RangeError('A route target needs at least two coordinates.');
  }
  return line.coordinates.map((coordinate) =>
    projectLngLat(coordinate, anchor),
  );
}

function cumulativeLengths(points: readonly EastNorth[]) {
  const cumulative = [0];
  for (let index = 1; index < points.length; index++) {
    cumulative.push(
      cumulative[index - 1]! +
        Math.hypot(
          points[index]![0] - points[index - 1]![0],
          points[index]![1] - points[index - 1]![1],
        ),
    );
  }
  return cumulative;
}

function pointAtDistance(
  points: readonly EastNorth[],
  cumulative: readonly number[],
  distance: number,
): EastNorth {
  const end = cumulative.findIndex((value) => value >= distance);
  if (end <= 0) return points[0]!;
  if (end < 0) return points.at(-1)!;
  const startDistance = cumulative[end - 1]!;
  const segmentLength = cumulative[end]! - startDistance;
  const ratio = segmentLength ? (distance - startDistance) / segmentLength : 0;
  const start = points[end - 1]!;
  const finish = points[end]!;
  return [
    start[0] + (finish[0] - start[0]) * ratio,
    start[1] + (finish[1] - start[1]) * ratio,
  ];
}

function turnAngle(points: readonly EastNorth[], index: number) {
  const previous = points[index - 1]!;
  const current = points[index]!;
  const next = points[index + 1]!;
  const first = [previous[0] - current[0], previous[1] - current[1]];
  const second = [next[0] - current[0], next[1] - current[1]];
  const denominator = Math.hypot(...first) * Math.hypot(...second);
  if (denominator === 0) return 0;
  return Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        (first[0]! * second[0]! + first[1]! * second[1]!) / denominator,
      ),
    ),
  );
}

/** Sample in metric arc length, retaining the endpoints and the strongest corners. */
export function sampleOrderedWaypoints(
  line: GeoJSONLineString,
  anchor: LngLat,
  maxWaypoints: number,
): LngLat[] {
  if (
    !Number.isInteger(maxWaypoints) ||
    maxWaypoints < 2 ||
    maxWaypoints > 32
  ) {
    throw new RangeError('Waypoint limit must be an integer from 2 to 32.');
  }
  const points = metricPoints(line, anchor);
  const cumulative = cumulativeLengths(points);
  const total = cumulative.at(-1)!;
  if (!Number.isFinite(total) || total < 1) {
    throw new RangeError('Target geometry is too short to route.');
  }

  const samples = Array.from({ length: maxWaypoints }, (_, index) => {
    const distance = (total * index) / (maxWaypoints - 1);
    return { distance, point: pointAtDistance(points, cumulative, distance) };
  });
  const corners = points
    .map((point, index) => ({
      point,
      distance: cumulative[index]!,
      angle:
        index > 0 && index < points.length - 1 ? turnAngle(points, index) : 0,
    }))
    .filter((candidate) => candidate.angle >= (25 * Math.PI) / 180)
    .sort((left, right) => right.angle - left.angle);

  for (const corner of corners) {
    if (samples.length <= 2) break;
    const closest = samples
      .slice(1, -1)
      .reduce(
        (best, sample, sampleIndex) =>
          Math.abs(sample.distance - corner.distance) <
          Math.abs(samples[best + 1]!.distance - corner.distance)
            ? sampleIndex
            : best,
        0,
      );
    const slot = closest + 1;
    if (
      Math.abs(samples[slot]!.distance - corner.distance) > 0.5 &&
      Math.abs(samples[slot - 1]!.distance - corner.distance) > 0.5 &&
      Math.abs(samples[slot + 1]!.distance - corner.distance) > 0.5
    ) {
      samples[slot] = corner;
    }
  }

  return samples
    .sort((left, right) => left.distance - right.distance)
    .reduce<LngLat[]>((result, sample) => {
      const coordinate = unprojectEastNorth(sample.point, anchor);
      const previous = result.at(-1);
      if (
        !previous ||
        Math.hypot(
          projectLngLat(coordinate, anchor)[0] -
            projectLngLat(previous, anchor)[0],
          projectLngLat(coordinate, anchor)[1] -
            projectLngLat(previous, anchor)[1],
        ) > 1
      ) {
        result.push(coordinate);
      }
      return result;
    }, []);
}

/** Symmetric mean nearest-sample error normalized by the target's metric diagonal. */
export function scoreLineSimilarity(
  target: GeoJSONLineString,
  route: GeoJSONLineString,
  anchor: LngLat,
): { score: number; normalizedError: number } {
  const targetPoints = metricPoints(target, anchor);
  const routePoints = metricPoints(route, anchor);
  const targetDistances = cumulativeLengths(targetPoints);
  const routeDistances = cumulativeLengths(routePoints);
  const targetLength = targetDistances.at(-1)!;
  const routeLength = routeDistances.at(-1)!;
  if (targetLength < 1 || routeLength < 1) {
    throw new RangeError('Cannot score degenerate line geometry.');
  }
  const resample = (
    points: readonly EastNorth[],
    distances: readonly number[],
    length: number,
    count = 64,
  ) =>
    Array.from({ length: count }, (_, index) =>
      pointAtDistance(points, distances, (length * index) / (count - 1)),
    );
  const targetSamples = resample(targetPoints, targetDistances, targetLength);
  const routeSamples = resample(routePoints, routeDistances, routeLength);
  const meanNearest = (
    source: readonly EastNorth[],
    destination: readonly EastNorth[],
  ) =>
    source.reduce(
      (sum, point) =>
        sum +
        Math.min(
          ...destination.map((candidate) =>
            Math.hypot(point[0] - candidate[0], point[1] - candidate[1]),
          ),
        ),
      0,
    ) / source.length;
  const symmetricMean =
    (meanNearest(targetSamples, routeSamples) +
      meanNearest(routeSamples, targetSamples)) /
    2;
  const east = targetPoints.map(([value]) => value);
  const north = targetPoints.map(([, value]) => value);
  const diagonal = Math.max(
    1,
    Math.hypot(
      Math.max(...east) - Math.min(...east),
      Math.max(...north) - Math.min(...north),
    ),
  );
  const normalizedError = symmetricMean / diagonal;
  return {
    score: Math.max(0, Math.min(1, 1 - normalizedError)),
    normalizedError,
  };
}

export function lineLengthMeters(line: GeoJSONLineString, anchor: LngLat) {
  return cumulativeLengths(metricPoints(line, anchor)).at(-1)!;
}
