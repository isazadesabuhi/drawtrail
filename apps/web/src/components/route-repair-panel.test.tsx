// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiSuccessEnvelope } from '@drawtrail/api-client';
import type { RouteRepairSuccess } from '@drawtrail/validation';
import { RouteRepairPanel } from './route-repair-panel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const route = {
  type: 'Feature' as const,
  properties: { mode: 'walking' as const },
  geometry: {
    type: 'LineString' as const,
    coordinates: [
      [4.83, 45.76] as [number, number],
      [4.84, 45.76] as [number, number],
    ],
  },
};
const targetGeometry = route.geometry;
const repaired: RouteRepairSuccess = {
  status: 'success',
  route: {
    ...route,
    geometry: {
      type: 'LineString',
      coordinates: [
        [4.83, 45.76],
        [4.835, 45.761],
        [4.84, 45.76],
      ],
    },
  },
  distanceMeters: 1000,
  similarityScore: 0.8,
  retracingMeters: 20,
  waypointCount: 19,
  warnings: [],
};

describe('route repair panel', () => {
  it('submits a selected section and applies the router response', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(apiSuccessEnvelope(repaired)),
    );
    vi.stubGlobal('fetch', fetcher);
    const onRepaired = vi.fn();
    render(
      <RouteRepairPanel
        mode="walking"
        route={route}
        targetGeometry={targetGeometry}
        onRepaired={onRepaired}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Repair a section' }));
    fireEvent.change(screen.getByLabelText('Section starts at 30%'), {
      target: { value: '25' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Reroute selected section' }),
    );

    expect(
      await screen.findByRole('button', { name: 'Repair a section' }),
    ).toBeVisible();
    expect(fetcher).toHaveBeenCalledWith(
      '/api/v1/repair',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"startRatio":0.25'),
      }),
    );
    expect(onRepaired).toHaveBeenCalledWith(repaired);
  });

  it('requires a valid via waypoint when the option is enabled', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    render(
      <RouteRepairPanel
        mode="walking"
        route={route}
        targetGeometry={targetGeometry}
        onRepaired={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Repair a section' }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Add a replacement waypoint' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Reroute selected section' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'valid replacement waypoint',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
