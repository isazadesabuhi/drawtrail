'use client';

import { useEffect, useState } from 'react';
import type { RouteGenerationSuccess } from '@drawtrail/validation';

type SharedRoute = {
  name: string;
  route: RouteGenerationSuccess;
  expiresAt: string;
};

function routePath(route: RouteGenerationSuccess) {
  const coordinates = route.route.geometry.coordinates;
  const bounds = coordinates.reduce<[number, number, number, number]>(
    ([minX, minY, maxX, maxY], [longitude, latitude]) => [
      Math.min(minX, longitude),
      Math.min(minY, latitude),
      Math.max(maxX, longitude),
      Math.max(maxY, latitude),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  const [minX, minY, maxX, maxY] = bounds;
  const spanX = Math.max(maxX - minX, 0.00001);
  const spanY = Math.max(maxY - minY, 0.00001);
  const step = Math.max(1, Math.ceil(coordinates.length / 800));
  const sampled = coordinates.filter(
    (_, index) => index % step === 0 || index === coordinates.length - 1,
  );
  return sampled
    .map(([longitude, latitude], index) => {
      const x = 24 + ((longitude - minX) / spanX) * 452;
      const y = 176 - ((latitude - minY) / spanY) * 152;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

export default function SharedRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [share, setShare] = useState<SharedRoute | null>(null);
  const [error, setError] = useState('Loading shared route…');

  useEffect(() => {
    let active = true;
    void params.then(async ({ id }) => {
      try {
        const response = await fetch(
          `/api/v1/shares?id=${encodeURIComponent(id)}`,
        );
        const data = (await response.json()) as SharedRoute & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(data.error ?? 'Shared route unavailable.');
        if (active) setShare(data);
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Shared route unavailable.',
          );
      }
    });
    return () => {
      active = false;
    };
  }, [params]);

  if (!share)
    return (
      <main className="shared-route-page">
        <p role="status">{error}</p>
      </main>
    );

  const { route } = share;
  return (
    <main className="shared-route-page">
      <p className="eyebrow">DrawTrail shared route</p>
      <h1>{share.name}</h1>
      <p>
        {(route.distanceMeters / 1000).toFixed(2)} km ·{' '}
        {route.route.properties.mode}
      </p>
      <svg
        className="shared-route-preview"
        viewBox="0 0 500 200"
        role="img"
        aria-label="Preview of the shared route shape"
      >
        <path d={routePath(route)} />
      </svg>
      <p className="field-hint">
        This public link expires{' '}
        {new Date(share.expiresAt).toLocaleDateString()}. The route path
        includes its exact start and end locations.
      </p>
    </main>
  );
}
