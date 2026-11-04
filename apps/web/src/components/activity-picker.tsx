'use client';

import { useState } from 'react';
import type { ActivityMode, ActivityOption } from '@drawtrail/types';
import { activityModeSchema } from '@drawtrail/validation';

const activities: ActivityOption[] = [
  {
    id: 'walking',
    label: 'Walk',
    description:
      'Slow down. Look around. Find a little wonder in the everyday.',
  },
  {
    id: 'running',
    label: 'Run',
    description:
      'Find your rhythm. Give your usual running loop a creative twist.',
  },
  {
    id: 'cycling',
    label: 'Ride',
    description:
      'Take the scenic way. Turn a bigger canvas into an adventure on two wheels.',
  },
];

export function ActivityPicker() {
  const [mode, setMode] = useState<ActivityMode>('walking');
  const selected = activities.find((activity) => activity.id === mode)!;

  return (
    <article className="activity-card">
      <div className="card-topline">
        <span className="step-number">01</span>
        <span className="small-label">THE WAY YOU MOVE</span>
      </div>
      <h3>What moves you?</h3>
      <p>There’s more than one way to draw a trail.</p>
      <fieldset className="activity-options">
        <legend className="sr-only">Choose an activity</legend>
        {activities.map((activity) => (
          <label
            className={`activity-option ${mode === activity.id ? 'selected' : ''}`}
            key={activity.id}
          >
            <input
              type="radio"
              name="activity"
              value={activity.id}
              checked={mode === activity.id}
              onChange={(event) =>
                setMode(activityModeSchema.parse(event.target.value))
              }
            />
            <span className="activity-icon" aria-hidden="true">
              {activity.id === 'walking'
                ? '↟'
                : activity.id === 'running'
                  ? '↗'
                  : '◎'}
            </span>
            {activity.label}
            <span className="radio-dot" aria-hidden="true" />
          </label>
        ))}
      </fieldset>
      <div className="activity-description" role="status">
        <span className="description-mark" aria-hidden="true">
          ✳
        </span>
        <p>{selected.description}</p>
      </div>
      <p className="local-note">
        A little inspiration for now. Your route editor is next.
      </p>
    </article>
  );
}
