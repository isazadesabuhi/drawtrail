// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RouteGenerationSuccess } from '@drawtrail/validation';
import { SAVED_ROUTES_STORAGE_KEY } from '../lib/saved-routes';
import { SavedRouteLibrary } from './saved-route-library';

const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
beforeEach(() => {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
});
afterEach(() => {
  cleanup();
  if (originalStorage)
    Object.defineProperty(window, 'localStorage', originalStorage);
});

const result: RouteGenerationSuccess = {
  status: 'success',
  targetGeometry: {
    type: 'LineString',
    coordinates: [
      [4.83, 45.76],
      [4.84, 45.77],
    ],
  },
  route: {
    type: 'Feature',
    properties: { mode: 'walking' },
    geometry: {
      type: 'LineString',
      coordinates: [
        [4.83, 45.76],
        [4.84, 45.77],
      ],
    },
  },
  distanceMeters: 1400,
  requestedDistanceMeters: 1500,
  similarityScore: 0.9,
  retracingMeters: 10,
  waypointCount: 4,
  warnings: [],
};

describe('saved route library', () => {
  it('requires location consent before publishing and shows the public link', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: '650fd6f4-44b1-4d90-8c95-78910e1c3df0' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <SavedRouteLibrary
        currentResult={result}
        selectedAlternativeIndex={0}
        onOpen={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Save, export, or share').closest('details'),
    ).toHaveProperty('open', false);
    fireEvent.click(screen.getByText('Save, export, or share'));
    const publishButton = screen.getByRole('button', {
      name: 'Create public link',
    });
    expect(publishButton).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Publish the route for 30 days/));
    fireEvent.click(publishButton);
    expect(await screen.findByRole('link')).toHaveAttribute(
      'href',
      expect.stringContaining('/shared/650fd6f4-44b1-4d90-8c95-78910e1c3df0'),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/shares',
      expect.objectContaining({ method: 'POST' }),
    );
    vi.unstubAllGlobals();
  });

  it('saves a named route, reopens it after remount, and removes it', async () => {
    const { unmount } = render(
      <SavedRouteLibrary
        currentResult={result}
        selectedAlternativeIndex={0}
        onOpen={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Save, export, or share'));
    fireEvent.change(screen.getByLabelText('Route name'), {
      target: { value: 'Morning loop' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save route' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved Morning loop on this device.',
    );
    expect(window.localStorage.getItem(SAVED_ROUTES_STORAGE_KEY)).toContain(
      'Morning loop',
    );
    unmount();

    const onOpen = vi.fn();
    render(
      <SavedRouteLibrary
        currentResult={null}
        selectedAlternativeIndex={0}
        onOpen={onOpen}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Morning loop' }),
    );
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Morning loop', result }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Morning loop' }),
    );
    expect(
      screen.getByText('No saved routes on this device yet.'),
    ).toBeVisible();
  });
});
