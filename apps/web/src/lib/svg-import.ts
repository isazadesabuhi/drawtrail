import type { Drawing, DrawingPoint, DrawingStroke } from '@drawtrail/types';
import { fitStrokes } from '@drawtrail/geo-utils';
import { drawingSchema, DRAWING_LIMITS } from '@drawtrail/validation';

export const MAX_SVG_BYTES = 256 * 1024;
const svgNamespace = 'http://www.w3.org/2000/svg';
const commands = new Set(['M', 'L', 'H', 'V', 'C', 'Q', 'Z']);
const attrs: Record<string, readonly string[]> = {
  svg: ['xmlns', 'viewBox', 'width', 'height', 'version'],
  g: [],
  path: ['d'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points'],
  rect: ['x', 'y', 'width', 'height'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  title: [],
  desc: [],
};
const paint = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'fill-rule',
  'id',
];

function numbers(value: string): number[] {
  const result: number[] = [];
  const token = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/y;
  let i = 0;
  while (i < value.length) {
    if (/[\s,]/.test(value[i]!)) {
      i++;
      continue;
    }
    token.lastIndex = i;
    const match = token.exec(value);
    if (!match) throw new Error('SVG geometry contains an invalid number.');
    const n = Number(match[0]);
    if (!Number.isFinite(n) || Math.abs(n) > 1e6)
      throw new Error('SVG coordinates are too large or invalid.');
    result.push(n);
    i = token.lastIndex;
    if (result.length > 16000) throw new Error('SVG geometry is too complex.');
  }
  return result;
}

function pathStrokes(
  value: string,
): { points: DrawingPoint[]; closed: boolean }[] {
  const tokens =
    value.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
  if (
    value.replace(
      /[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?|[\s,]/g,
      '',
    )
  )
    throw new Error('Invalid SVG path syntax.');
  if (tokens.length > 16000) throw new Error('SVG path is too complex.');
  const strokes: { points: DrawingPoint[]; closed: boolean }[] = [];
  let i = 0,
    command = '',
    x = 0,
    y = 0,
    points: DrawingPoint[] = [];
  const read = () => {
    const token = tokens[i++];
    if (!token || /^[A-Za-z]$/.test(token))
      throw new Error('SVG path is missing coordinates.');
    const n = Number(token);
    if (!Number.isFinite(n) || Math.abs(n) > 1e6)
      throw new Error('Invalid SVG coordinates.');
    return n;
  };
  const flush = (closed: boolean) => {
    if (points.length < 2)
      throw new Error('Each SVG subpath must contain a line.');
    if (
      closed &&
      (points.at(-1)![0] !== points[0]![0] ||
        points.at(-1)![1] !== points[0]![1])
    )
      points.push(points[0]!);
    strokes.push({ points, closed });
    points = [];
  };
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i]!)) command = tokens[i++]!;
    const upper = command.toUpperCase(),
      relative = command !== upper;
    if (!commands.has(upper))
      throw new Error(
        'Supported SVG path commands: M, L, H, V, C, Q, Z. Convert arcs and smooth curves to basic paths first.',
      );
    if (upper === 'Z') {
      if (!points.length)
        throw new Error('SVG close command needs an open subpath.');
      [x, y] = points[0]!;
      flush(true);
      command = '';
      continue;
    }
    const ox = relative ? x : 0,
      oy = relative ? y : 0;
    if (upper === 'M') {
      if (points.length) flush(false);
      x = read() + ox;
      y = read() + oy;
      points.push([x, y]);
      command = relative ? 'l' : 'L';
    } else {
      if (!points.length) throw new Error('SVG subpaths must begin with M.');
      if (upper === 'L') {
        x = read() + ox;
        y = read() + oy;
        points.push([x, y]);
      }
      if (upper === 'H') {
        x = read() + ox;
        points.push([x, y]);
      }
      if (upper === 'V') {
        y = read() + oy;
        points.push([x, y]);
      }
      if (upper === 'C' || upper === 'Q') {
        const startX = x,
          startY = y;
        const ax = read() + ox,
          ay = read() + oy;
        const bx = read() + ox,
          by = read() + oy;
        const ex = upper === 'C' ? read() + ox : bx,
          ey = upper === 'C' ? read() + oy : by;
        for (let j = 1; j <= 24; j++) {
          const t = j / 24,
            u = 1 - t;
          points.push(
            upper === 'C'
              ? [
                  u ** 3 * startX +
                    3 * u * u * t * ax +
                    3 * u * t * t * bx +
                    t ** 3 * ex,
                  u ** 3 * startY +
                    3 * u * u * t * ay +
                    3 * u * t * t * by +
                    t ** 3 * ey,
                ]
              : [
                  u * u * startX + 2 * u * t * ax + t * t * ex,
                  u * u * startY + 2 * u * t * ay + t * t * ey,
                ],
          );
        }
        x = ex;
        y = ey;
      }
    }
    if (
      points.length > DRAWING_LIMITS.pointsPerStroke ||
      strokes.length > DRAWING_LIMITS.strokes
    )
      throw new Error('SVG has too many strokes or points.');
  }
  if (points.length) flush(false);
  return strokes;
}

export function importSvg(text: string): Drawing {
  if (new TextEncoder().encode(text).length > MAX_SVG_BYTES)
    throw new Error('SVG must be 256 KB or smaller.');
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(text))
    throw new Error(
      'SVG declarations and external resources are not supported.',
    );
  const document = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = document.documentElement;
  if (root.localName !== 'svg' || document.querySelector('parsererror'))
    throw new Error('Choose a valid SVG document.');
  const elements = [root, ...Array.from(root.querySelectorAll('*'))];
  if (elements.length > 256) throw new Error('SVG contains too many elements.');
  const strokes: DrawingStroke[] = [];
  const add = (points: DrawingPoint[], closed: boolean) => {
    if (
      closed &&
      points.length &&
      (points[0]![0] !== points.at(-1)![0] ||
        points[0]![1] !== points.at(-1)![1])
    )
      points.push(points[0]!);
    strokes.push({
      id: `svg-${strokes.length + 1}`,
      label: `Stroke ${strokes.length + 1}`,
      points,
      closed,
    });
    if (
      strokes.length > DRAWING_LIMITS.strokes ||
      strokes.reduce((sum, stroke) => sum + stroke.points.length, 0) >
        DRAWING_LIMITS.totalPoints
    )
      throw new Error('SVG is too complex. Use fewer paths.');
  };
  for (const element of elements) {
    const name = element.localName;
    if (
      !(name in attrs) ||
      (element.namespaceURI && element.namespaceURI !== svgNamespace)
    )
      throw new Error(
        `Unsupported SVG element: ${name}. Use basic path geometry only.`,
      );
    let depth = 0;
    for (
      let parent = element.parentElement;
      parent;
      parent = parent.parentElement
    )
      depth++;
    if (depth > 12) throw new Error('SVG nesting is too deep.');
    for (const attribute of Array.from(element.attributes)) {
      if (
        !attrs[name]!.includes(attribute.name) &&
        !paint.includes(attribute.name)
      )
        throw new Error(
          `Unsupported SVG attribute: ${attribute.name}. Scripts, styling, transforms and references are not allowed.`,
        );
      if (
        attribute.name !== 'xmlns' &&
        /url\s*\(|javascript:|https?:/i.test(attribute.value)
      )
        throw new Error('External SVG resources are not allowed.');
    }
    const numeric = (attribute: string, fallback = 0) => {
      const value = element.getAttribute(attribute);
      if (value === null) return fallback;
      const parsed = numbers(value);
      if (parsed.length !== 1) throw new Error(`Invalid SVG ${attribute}.`);
      return parsed[0]!;
    };
    if (name === 'path')
      for (const stroke of pathStrokes(element.getAttribute('d') ?? ''))
        add(stroke.points, stroke.closed);
    if (name === 'polyline' || name === 'polygon') {
      const values = numbers(element.getAttribute('points') ?? '');
      if (values.length < 4 || values.length % 2)
        throw new Error('Invalid SVG point list.');
      add(
        Array.from({ length: values.length / 2 }, (_, i) => [
          values[i * 2]!,
          values[i * 2 + 1]!,
        ]),
        name === 'polygon',
      );
    }
    if (name === 'line')
      add(
        [
          [numeric('x1'), numeric('y1')],
          [numeric('x2'), numeric('y2')],
        ],
        false,
      );
    if (name === 'rect') {
      const x = numeric('x'),
        y = numeric('y'),
        width = numeric('width'),
        height = numeric('height');
      if (width <= 0 || height <= 0)
        throw new Error('SVG rectangle dimensions must be positive.');
      add(
        [
          [x, y],
          [x + width, y],
          [x + width, y + height],
          [x, y + height],
        ],
        true,
      );
    }
    if (name === 'circle' || name === 'ellipse') {
      const cx = numeric('cx'),
        cy = numeric('cy'),
        rx = numeric(name === 'circle' ? 'r' : 'rx'),
        ry = name === 'circle' ? rx : numeric('ry');
      if (rx <= 0 || ry <= 0) throw new Error('SVG radii must be positive.');
      add(
        Array.from({ length: 64 }, (_, i) => [
          cx + Math.cos((i / 64) * Math.PI * 2) * rx,
          cy + Math.sin((i / 64) * Math.PI * 2) * ry,
        ]),
        true,
      );
    }
  }
  if (!strokes.length)
    throw new Error('SVG contains no supported drawing paths.');
  const drawing = {
    version: 1,
    name: 'Imported SVG',
    source: 'svg',
    strokes: fitStrokes(strokes),
  };
  const parsed = drawingSchema.safeParse(drawing);
  if (!parsed.success)
    throw new Error(
      'SVG geometry is degenerate or too detailed. Simplify it before importing.',
    );
  return parsed.data;
}
