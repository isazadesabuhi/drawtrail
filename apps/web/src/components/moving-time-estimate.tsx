'use client';

import { useState } from 'react';
import type { ActivityMode } from '@drawtrail/types';
import {
  defaultMovingRate,
  estimateMovingTimeSeconds,
  formatMovingTime,
} from '../lib/moving-time';

const labels: Record<ActivityMode, string> = {
  walking: 'Walking pace (min/km)',
  running: 'Running pace (min/km)',
  cycling: 'Cycling speed (km/h)',
};

const limits: Record<ActivityMode, { min: number; max: number; step: number }> =
  {
    walking: { min: 2, max: 60, step: 0.1 },
    running: { min: 2, max: 60, step: 0.1 },
    cycling: { min: 3, max: 80, step: 0.5 },
  };

export function MovingTimeEstimate({
  mode,
  distanceMeters,
}: {
  mode: ActivityMode;
  distanceMeters: number;
}) {
  const [rates, setRates] = useState<Record<ActivityMode, string>>({
    walking: String(defaultMovingRate('walking')),
    running: String(defaultMovingRate('running')),
    cycling: String(defaultMovingRate('cycling')),
  });
  const rate = Number(rates[mode]);
  const estimate = estimateMovingTimeSeconds(distanceMeters, mode, rate);
  const range = limits[mode];
  const inputId = 'moving-time-rate';

  return (
    <section
      className="moving-time-estimate"
      aria-labelledby="moving-time-title"
    >
      <div className="moving-time-estimate-heading">
        <h3 id="moving-time-title">Estimated moving time</h3>
        <output
          role="status"
          aria-label="Estimated moving time"
          aria-live="polite"
        >
          {estimate === null
            ? 'Check your pace or speed'
            : formatMovingTime(estimate)}
        </output>
      </div>
      <label htmlFor={inputId}>{labels[mode]}</label>
      <input
        id={inputId}
        type="number"
        inputMode="decimal"
        min={range.min}
        max={range.max}
        step={range.step}
        value={rates[mode]}
        aria-invalid={estimate === null}
        aria-describedby="moving-time-hint"
        onChange={(event) => {
          const value = event.target.value;
          setRates((previous) => ({ ...previous, [mode]: value }));
        }}
      />
      <p id="moving-time-hint">
        Based on your rate and the selected route distance. Stops are not
        included.
      </p>
    </section>
  );
}
