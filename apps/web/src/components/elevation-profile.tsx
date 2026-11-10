'use client';

import { useId, useState } from 'react';
import type { RouteElevation } from '@drawtrail/validation';
import { findSteepSections } from '../lib/steep-sections';

export function ElevationProfile({
  elevation,
}: {
  elevation: RouteElevation | undefined;
}) {
  const [selected, setSelected] = useState(0);
  const id = useId();
  if (!elevation || elevation.status === 'unavailable') {
    return (
      <section className="elevation-profile" aria-label="Route elevation">
        <h3>Elevation</h3>
        <p>
          {elevation?.status === 'unavailable' &&
          elevation.reason === 'service_unavailable'
            ? 'Elevation service is unavailable. Your street route is still available.'
            : 'Elevation data is unavailable for this route. Ascent and descent are unknown.'}
        </p>
      </section>
    );
  }
  const { samples } = elevation;
  const steepSections = findSteepSections(samples);
  const known = samples.filter((point) => point.elevationMeters !== null);
  const heights = known.map((point) => point.elevationMeters!);
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  const total = samples.at(-1)!.distanceMeters;
  const span = Math.max(max - min, 1);
  const x = (distance: number) => 55 + (distance / total) * 475;
  const y = (height: number) => 25 + ((max - height) / span) * 110;
  const runs: string[][] = [];
  let run: string[] = [];
  for (const point of samples) {
    if (point.elevationMeters === null) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push(`${x(point.distanceMeters)},${y(point.elevationMeters)}`);
    }
  }
  if (run.length) runs.push(run);
  const point = samples[Math.min(selected, samples.length - 1)]!;
  return (
    <section className="elevation-profile" aria-label="Route elevation">
      <h3>Elevation profile</h3>
      <dl className="route-result-metrics">
        <div>
          <dt>Estimated ascent</dt>
          <dd>
            {elevation.status === 'complete'
              ? `${Math.round(elevation.ascentMeters)} m`
              : 'Unknown'}
          </dd>
        </div>
        <div>
          <dt>Estimated descent</dt>
          <dd>
            {elevation.status === 'complete'
              ? `${Math.round(elevation.descentMeters)} m`
              : 'Unknown'}
          </dd>
        </div>
      </dl>
      {elevation.status === 'partial' && (
        <p role="status">
          Partial elevation coverage: {known.length} of {samples.length} samples
          available. Full-route ascent and descent are unknown.
        </p>
      )}
      <section className="steep-sections" aria-label="Steep sections">
        <h4>Steep sections</h4>
        <p className="field-hint">
          Approximate grades of at least 8% sustained over 60 m.
        </p>
        {steepSections.length > 0 ? (
          <ul>
            {steepSections.map((section, index) => (
              <li key={`${section.startDistanceMeters}-${index}`}>
                <strong>
                  {section.direction === 'climb' ? 'Climb' : 'Descent'} ·{' '}
                  {section.gradePercent > 0 ? '+' : ''}
                  {section.gradePercent.toFixed(1)}%
                </strong>
                <span>
                  {(section.startDistanceMeters / 1000).toFixed(2)}–
                  {(section.endDistanceMeters / 1000).toFixed(2)} km
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status">
            {elevation.status === 'partial'
              ? 'No sustained steep sections detected in the available elevation data.'
              : 'No sustained steep sections detected.'}
          </p>
        )}
      </section>
      <svg
        viewBox="0 0 560 175"
        role="img"
        aria-label="Route elevation profile"
      >
        <title>Elevation in metres along the selected route</title>
        <line x1="55" y1="145" x2="530" y2="145" className="elevation-axis" />
        <text x="48" y="29" textAnchor="end">
          {Math.round(max)} m
        </text>
        {max !== min && (
          <text x="48" y="139" textAnchor="end">
            {Math.round(min)} m
          </text>
        )}
        <text x="55" y="166">
          0 km
        </text>
        <text x="530" y="166" textAnchor="end">
          {(total / 1000).toFixed(2)} km distance
        </text>
        {runs.map((points, i) =>
          points.length > 1 ? (
            <polyline
              key={i}
              points={points.join(' ')}
              className="elevation-line"
            />
          ) : (
            <circle
              key={i}
              cx={points[0]!.split(',')[0]}
              cy={points[0]!.split(',')[1]}
              r="2"
              className="elevation-point"
            />
          ),
        )}
        {point.elevationMeters !== null && (
          <circle
            cx={x(point.distanceMeters)}
            cy={y(point.elevationMeters)}
            r="4"
            className="elevation-point"
          />
        )}
      </svg>
      <label htmlFor={id}>Inspect elevation along the route</label>
      <input
        id={id}
        type="range"
        min="0"
        max={samples.length - 1}
        step="1"
        value={Math.min(selected, samples.length - 1)}
        onChange={(event) => setSelected(Number(event.target.value))}
        aria-valuetext={`${(point.distanceMeters / 1000).toFixed(2)} km, ${point.elevationMeters === null ? 'elevation unknown' : `${Math.round(point.elevationMeters)} metres elevation`}`}
      />
      <output htmlFor={id} aria-live="polite">
        {(point.distanceMeters / 1000).toFixed(2)} km ·{' '}
        {point.elevationMeters === null
          ? 'Elevation unknown'
          : `${Math.round(point.elevationMeters)} m elevation`}
      </output>
      <p className="field-hint">
        Terrain estimates from{' '}
        <a
          href="https://valhalla.github.io/valhalla/api/elevation/#data-credits"
          target="_blank"
          rel="noopener noreferrer"
        >
          Valhalla elevation data
        </a>
        , sampled about every {Math.round(total / (samples.length - 1))} m.
        Small rises, bridges, and tunnels may differ from the terrain.
      </p>
    </section>
  );
}
