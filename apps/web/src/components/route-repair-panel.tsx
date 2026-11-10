'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ActivityMode, GeoJSONLineString } from '@drawtrail/types';
import {
  apiEnvelopeSchema,
  lngLatSchema,
  routeRepairSuccessSchema,
  type RouteGenerationSuccess,
  type RouteRepairSuccess,
} from '@drawtrail/validation';

export function RouteRepairPanel({
  mode,
  route,
  targetGeometry,
  onRepaired,
}: {
  mode: ActivityMode;
  route: RouteGenerationSuccess['route'];
  targetGeometry: GeoJSONLineString;
  onRepaired: (result: RouteRepairSuccess) => void;
}) {
  const [open, setOpen] = useState(false);
  const [startPercent, setStartPercent] = useState(30);
  const [endPercent, setEndPercent] = useState(70);
  const [viaEnabled, setViaEnabled] = useState(false);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (endPercent - startPercent < 10) {
      setError('Choose a section at least 10% of the route long.');
      return;
    }
    let viaWaypoints: [number, number][] = [];
    if (viaEnabled) {
      if (!latitude.trim() || !longitude.trim()) {
        setError(
          'Enter a valid replacement waypoint in longitude, latitude order.',
        );
        return;
      }
      const via: [number, number] = [Number(longitude), Number(latitude)];
      if (!lngLatSchema.safeParse(via).success) {
        setError(
          'Enter a valid replacement waypoint in longitude, latitude order.',
        );
        return;
      }
      viaWaypoints = [via];
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/v1/repair', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          mode,
          route: route.geometry,
          targetGeometry,
          startRatio: startPercent / 100,
          endRatio: endPercent / 100,
          viaWaypoints,
        }),
      });
      const parsed = apiEnvelopeSchema(routeRepairSuccessSchema).safeParse(
        await response.json().catch(() => null),
      );
      if (!parsed.success)
        throw new Error('The repair service returned an invalid response.');
      if (parsed.data.status === 'error')
        throw new Error(parsed.data.error.message);
      if (!response.ok)
        throw new Error('The repair service could not reroute this section.');
      onRepaired(parsed.data.data);
      setOpen(false);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : 'The repair service could not reroute this section.',
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <section className="route-repair-panel" aria-label="Repair route section">
      {!open ? (
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setError('');
            setOpen(true);
          }}
        >
          Repair a section
        </button>
      ) : (
        <form onSubmit={submit}>
          <div className="route-repair-heading">
            <h3>Repair a section</h3>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                request.current?.abort();
                setBusy(false);
                setError('');
                setOpen(false);
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
          <p className="field-hint">
            Choose the part to replace. The route will be rebuilt through its
            remaining waypoints, so nearby streets may shift slightly.
          </p>
          <label htmlFor="repair-start">
            Section starts at {startPercent}%
          </label>
          <input
            id="repair-start"
            type="range"
            min={0}
            max={80}
            step={5}
            value={startPercent}
            onChange={(event) =>
              setStartPercent(
                Math.min(Number(event.target.value), endPercent - 10),
              )
            }
          />
          <label htmlFor="repair-end">Section ends at {endPercent}%</label>
          <input
            id="repair-end"
            type="range"
            min={20}
            max={100}
            step={5}
            value={endPercent}
            onChange={(event) =>
              setEndPercent(
                Math.max(Number(event.target.value), startPercent + 10),
              )
            }
          />
          <label className="route-repair-via-toggle">
            <input
              type="checkbox"
              checked={viaEnabled}
              onChange={(event) => setViaEnabled(event.target.checked)}
            />
            Add a replacement waypoint
          </label>
          {viaEnabled && (
            <div className="coordinate-fields">
              <div>
                <label htmlFor="repair-latitude">Waypoint latitude</label>
                <input
                  id="repair-latitude"
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(event) => setLatitude(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="repair-longitude">Waypoint longitude</label>
                <input
                  id="repair-longitude"
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(event) => setLongitude(event.target.value)}
                />
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? 'Repairing route…' : 'Reroute selected section'}
          </button>
        </form>
      )}
    </section>
  );
}
