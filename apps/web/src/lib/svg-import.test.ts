// @vitest-environment jsdom
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawingSchema } from '@drawtrail/validation';
import { importSvg } from './svg-import';
const wrap = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

describe('restricted SVG import', () => {
  it('imports a fixed curved heart as a closed normalized stroke', () => {
    const result = importSvg(
      readFileSync(resolve('tests/fixtures/drawing/heart.svg'), 'utf8'),
    );
    expect(drawingSchema.safeParse(result).success).toBe(true);
    expect(result.strokes).toHaveLength(1);
    expect(result.strokes[0]?.closed).toBe(true);
    expect(result.strokes[0]?.points[0]).toEqual(
      result.strokes[0]?.points.at(-1),
    );
  });
  it('keeps path elements and multiple move commands as distinct ordered strokes', () => {
    const result = importSvg(
      wrap(
        '<path d="M0 0L10 10 M20 0 l10 10"/><line x1="0" y1="20" x2="10" y2="20"/>',
      ),
    );
    expect(result.strokes).toHaveLength(3);
    expect(result.strokes.map((stroke) => stroke.id)).toEqual([
      'svg-1',
      'svg-2',
      'svg-3',
    ]);
    expect(result.strokes.every((stroke) => !stroke.closed)).toBe(true);
  });
  it('supports basic primitives and quadratic curves', () => {
    expect(
      importSvg(
        wrap(
          '<rect width="10" height="20"/><circle cx="30" cy="20" r="5"/><ellipse cx="50" cy="20" rx="5" ry="3"/><polygon points="0,0 5,0 5,5"/><polyline points="0,0 3,5"/><path d="M0 0Q5 10 10 0"/>',
        ),
      ).strokes,
    ).toHaveLength(6);
  });
  it.each([
    '<script>alert(1)</script>',
    '<image href="https://example.com/x.png"/>',
    '<foreignObject/>',
    '<use href="#x"/>',
    '<path onload="alert(1)" d="M0 0L1 1"/>',
    '<path style="fill:red" d="M0 0L1 1"/>',
    '<g transform="scale(2)"><path d="M0 0L1 1"/></g>',
    '<path fill="url(https://example.com/a)" d="M0 0L1 1"/>',
    '<path d="M0 0A2 2 0 0 1 5 5"/>',
    '<path d="M0 0L5"/>',
    '<path d="M0 0L1@2"/>',
  ])('rejects active, referenced, unsupported or malformed SVG', (body) =>
    expect(() => importSvg(wrap(body))).toThrow(),
  );
  it('rejects DTD/entity declarations, malformed XML and oversized files before inserting any nodes', () => {
    expect(() =>
      importSvg(
        '<!DOCTYPE svg [<!ENTITY x "a">]>' + wrap('<path d="M0 0L1 1"/>'),
      ),
    ).toThrow('declarations');
    expect(() => importSvg('<svg><path></svg>')).toThrow();
    expect(() => importSvg(wrap(' '.repeat(300_000)))).toThrow('256 KB');
    expect(document.querySelector('script')).toBeNull();
  });
});
