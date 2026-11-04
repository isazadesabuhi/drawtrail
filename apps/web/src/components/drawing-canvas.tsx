'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Drawing, DrawingPoint, DrawingStroke } from '@drawtrail/types';
import { simplifyStroke } from '@drawtrail/geo-utils';
import { drawingStrokeId } from '../lib/drawing-id';

export function DrawingLines({
  drawing,
  selectedId,
}: {
  drawing: Drawing;
  selectedId?: string | null;
}) {
  return (
    <>
      {drawing.strokes.map((stroke) => (
        <polyline
          key={stroke.id}
          points={stroke.points.map((point) => point.join(',')).join(' ')}
          fill="none"
          className={
            selectedId === stroke.id
              ? 'drawing-stroke selected-stroke'
              : 'drawing-stroke'
          }
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </>
  );
}

export function DrawingCanvas({
  drawing,
  selectedId,
  onStroke,
  onMessage,
}: {
  drawing: Drawing;
  selectedId: string | null;
  onStroke: (stroke: DrawingStroke) => void;
  onMessage: (text: string) => void;
}) {
  const pointer = useRef<{ id: number; points: DrawingPoint[] } | null>(null);
  const [live, setLive] = useState<readonly DrawingPoint[]>([]);
  const [keyboardPoints, setKeyboardPoints] = useState<DrawingPoint[]>([]);
  const [cursor, setCursor] = useState<DrawingPoint>([0.5, 0.5]);
  const [cursorVisible, setCursorVisible] = useState(false);

  function position(event: PointerEvent<SVGSVGElement>): DrawingPoint {
    const bounds = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    ];
  }
  function finish(raw: readonly DrawingPoint[]) {
    if (
      raw.length < 2 ||
      !raw.some(
        (point) =>
          Math.hypot(point[0] - raw[0]![0], point[1] - raw[0]![1]) > 0.003,
      )
    ) {
      onMessage('Draw a line with at least two different points.');
      return;
    }
    const closed =
      raw.length > 3 &&
      Math.hypot(raw[0]![0] - raw.at(-1)![0], raw[0]![1] - raw.at(-1)![1]) <
        0.025;
    const prepared = closed ? [...raw.slice(0, -1), raw[0]!] : [...raw];
    const points = simplifyStroke(prepared, 0.0015, closed);
    onStroke({
      id: drawingStrokeId(),
      label: `Stroke ${drawing.strokes.length + 1}`,
      closed,
      points,
    });
  }
  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.button > 0 || pointer.current) return;
    const point = position(event);
    if (!point.every(Number.isFinite)) return;
    event.preventDefault();
    event.currentTarget.focus();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* Synthetic/unsupported capture still permits drawing. */
    }
    pointer.current = { id: event.pointerId, points: [point] };
    setKeyboardPoints([]);
    setLive([point]);
    setCursor(point);
    setCursorVisible(true);
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const point = position(event);
    if (!point.every(Number.isFinite)) return;
    setCursor(point);
    setCursorVisible(true);
    const active = pointer.current;
    if (!active || active.id !== event.pointerId) return;
    const previous = active.points.at(-1)!;
    if (Math.hypot(point[0] - previous[0], point[1] - previous[1]) < 0.002)
      return;
    if (active.points.length >= 2048) {
      pointer.current = null;
      setLive([]);
      onMessage('That stroke is too detailed. Draw a shorter stroke.');
      return;
    }
    active.points.push(point);
    setLive([...active.points]);
  }
  function end(event: PointerEvent<SVGSVGElement>) {
    const active = pointer.current;
    if (!active || active.id !== event.pointerId) return;
    const point = position(event);
    if (point.every(Number.isFinite) && active.points.length < 2048)
      active.points.push(point);
    pointer.current = null;
    setLive([]);
    finish(active.points);
  }
  function keyboard(event: KeyboardEvent<SVGSVGElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const step = event.shiftKey ? 0.05 : 0.01;
    const delta: Record<string, DrawingPoint> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (delta[event.key]) {
      event.preventDefault();
      const [dx, dy] = delta[event.key]!;
      setCursor([
        Math.max(0, Math.min(1, cursor[0] + dx)),
        Math.max(0, Math.min(1, cursor[1] + dy)),
      ]);
      setCursorVisible(true);
    } else if (event.key === ' ') {
      event.preventDefault();
      if (keyboardPoints.length >= 2048) {
        onMessage('Finish this stroke before adding more points.');
        return;
      }
      setKeyboardPoints([...keyboardPoints, cursor]);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      finish(keyboardPoints);
      setKeyboardPoints([]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setKeyboardPoints([]);
      setLive([]);
      pointer.current = null;
    }
  }
  return (
    <>
      <p id="drawing-instructions" className="canvas-instructions">
        Draw with a mouse or one finger. Keyboard: arrows move the cursor, Space
        adds a point, Enter finishes, Escape cancels. Hold Shift for larger
        steps.
      </p>
      <svg
        className="drawing-canvas"
        viewBox="0 0 1 1"
        role="application"
        aria-label="Drawing canvas"
        aria-describedby="drawing-instructions"
        tabIndex={0}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={() => {
          pointer.current = null;
          setLive([]);
          onMessage('The interrupted stroke was cancelled.');
        }}
        onPointerLeave={() => {
          if (!pointer.current) setCursorVisible(false);
        }}
        onFocus={() => setCursorVisible(true)}
        onBlur={() => {
          setCursorVisible(false);
          setKeyboardPoints([]);
        }}
        onKeyDown={keyboard}
      >
        <DrawingLines drawing={drawing} selectedId={selectedId} />
        {[live, keyboardPoints].map(
          (points, index) =>
            points.length > 0 && (
              <polyline
                key={index}
                className="drawing-stroke live-stroke"
                points={points.map((point) => point.join(',')).join(' ')}
                fill="none"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ),
        )}
        {!drawing.strokes.length && !live.length && !keyboardPoints.length && (
          <text
            x=".5"
            y=".49"
            textAnchor="middle"
            className="drawing-placeholder"
          >
            Make your first mark.
          </text>
        )}
        {cursorVisible && (
          <circle
            cx={cursor[0]}
            cy={cursor[1]}
            r=".009"
            className="drawing-cursor"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="drawing-canvas-footer">
        <span>Target drawing · no street routing yet</span>
        <output aria-label="Drawing cursor">
          X {Math.round(cursor[0] * 100)}% · Y {Math.round(cursor[1] * 100)}%
        </output>
      </div>
    </>
  );
}
