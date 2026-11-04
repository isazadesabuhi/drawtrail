import type { Drawing, DrawingPoint } from '@drawtrail/types';
import { fitStrokes, simplifyStroke } from '@drawtrail/geo-utils';
import { drawingSchema } from '@drawtrail/validation';

export interface RasterPixels {
  width: number;
  height: number;
  data: ArrayLike<number>;
}
/** Single dark connected silhouette on a light/transparent background; no holes. */
export function traceSilhouette({
  width,
  height,
  data,
}: RasterPixels): Drawing {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2 ||
    width > 128 ||
    height > 128 ||
    data.length !== width * height * 4
  )
    throw new Error('Trace images must be between 2 and 128 pixels per side.');
  const mask = new Uint8Array(width * height);
  let dark = 0,
    midtones = 0;
  for (let i = 0; i < mask.length; i++) {
    const alpha = data[i * 4 + 3]! / 255;
    const luminance =
      (data[i * 4]! * 0.2126 +
        data[i * 4 + 1]! * 0.7152 +
        data[i * 4 + 2]! * 0.0722) *
        alpha +
      255 * (1 - alpha);
    if (luminance > 32 && luminance < 223) midtones++;
    if (luminance < 128) {
      mask[i] = 1;
      dark++;
    }
  }
  if (!dark || dark > mask.length * 0.9 || midtones > mask.length * 0.15)
    throw new Error(
      'Use a high-contrast dark silhouette on a light background, with room around it. Photos and shaded images are not supported.',
    );
  const visited = new Uint8Array(mask.length);
  const seed = mask.indexOf(1),
    queue = [seed];
  visited[seed] = 1;
  for (let index = 0; index < queue.length; index++) {
    const pixel = queue[index]!,
      x = pixel % width,
      y = Math.floor(pixel / width);
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (nx! < 0 || nx! >= width || ny! < 0 || ny! >= height) continue;
      const next = ny! * width + nx!;
      if (mask[next] && !visited[next]) {
        visited[next] = 1;
        queue.push(next);
      }
    }
  }
  if (queue.length !== dark)
    throw new Error(
      'The image has separate dark shapes. Trace one connected silhouette at a time; separate contours are never joined automatically.',
    );
  const edges = new Map<string, DrawingPoint>();
  const key = ([x, y]: DrawingPoint) => `${x},${y}`;
  const add = (a: DrawingPoint, b: DrawingPoint) => {
    if (edges.has(key(a)))
      throw new Error(
        'The silhouette touches itself at a corner. Use a simpler solid shape.',
      );
    edges.set(key(a), b);
    if (edges.size > 8192)
      throw new Error(
        'The silhouette outline is too complex. Use a simpler image.',
      );
  };
  const filled = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (filled(x, y)) {
        if (!filled(x, y - 1)) add([x, y], [x + 1, y]);
        if (!filled(x + 1, y)) add([x + 1, y], [x + 1, y + 1]);
        if (!filled(x, y + 1)) add([x + 1, y + 1], [x, y + 1]);
        if (!filled(x - 1, y)) add([x, y + 1], [x, y]);
      }
  const startKey = edges.keys().next().value as string;
  const coordinates = startKey.split(',');
  const start: DrawingPoint = [Number(coordinates[0]), Number(coordinates[1])];
  const outline: DrawingPoint[] = [start];
  let cursor = start;
  do {
    const next = edges.get(key(cursor));
    if (!next)
      throw new Error('The silhouette outline is not a simple closed loop.');
    edges.delete(key(cursor));
    outline.push(next);
    cursor = next;
  } while (key(cursor) !== startKey && outline.length <= 8193);
  if (edges.size)
    throw new Error(
      'Holes or multiple outlines are not supported. Use one solid silhouette.',
    );
  const points = simplifyStroke(outline, 0.2, true);
  return drawingSchema.parse({
    version: 1,
    name: 'Traced silhouette',
    source: 'silhouette',
    strokes: fitStrokes([
      { id: 'silhouette-1', label: 'Outline 1', closed: true, points },
    ]),
  });
}
