'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LibreMap, Marker } from 'maplibre-gl';
import type { LngLat } from '@drawtrail/types';
import { LYON_BOUNDS, LYON_CENTER, LYON_ZOOM } from '@drawtrail/geo-utils';
import type { MapConfiguration } from '../lib/map-config';

export interface ViewRequest {
  center: LngLat;
  zoom: number;
  revision: number;
}
interface MapCanvasProps {
  configuration: MapConfiguration;
  startPoint: LngLat | null;
  view: ViewRequest;
  onSelect: (point: LngLat) => boolean;
}

export function MapCanvas({
  configuration,
  startPoint,
  view,
  onSelect,
}: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const selectedRef = useRef(startPoint);
  const viewRef = useRef(view);
  const syncMarkerRef = useRef<(() => void) | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [viewport, setViewport] = useState({
    center: LYON_CENTER,
    zoom: LYON_ZOOM,
    bearing: 0,
  });

  useEffect(() => {
    selectedRef.current = startPoint;
    syncMarkerRef.current?.();
  }, [startPoint]);

  useEffect(() => {
    if (configuration.mode === 'unconfigured' || !container.current) return;
    let disposed = false;
    let map: LibreMap | undefined;
    let observer: ResizeObserver | undefined;
    let sourceFailed = false;
    const timeout = window.setTimeout(() => {
      if (!disposed) setStatus('error');
    }, 12_000);
    async function initialize() {
      try {
        // Importing inside an effect keeps WebGL and workers out of SSR.
        const {
          Map,
          Marker,
          NavigationControl,
          FullscreenControl,
          AttributionControl,
          setWorkerUrl,
        } = await import('maplibre-gl');
        if (
          disposed ||
          !container.current ||
          configuration.mode === 'unconfigured'
        )
          return;
        // MapLibre 6's separate worker needs an explicit bundler-resolved URL.
        setWorkerUrl(
          new URL(
            'maplibre-gl/dist/maplibre-gl-worker.mjs',
            import.meta.url,
          ).toString(),
        );
        map = new Map({
          container: container.current,
          style: configuration.style,
          center: [...viewRef.current.center],
          zoom: viewRef.current.zoom,
          minZoom: 10,
          maxZoom: 18,
          maxBounds: [[...LYON_BOUNDS[0]], [...LYON_BOUNDS[1]]],
          attributionControl: false,
          renderWorldCopies: false,
        });
        mapRef.current = map;
        map.addControl(
          new NavigationControl({ showCompass: true, showZoom: true }),
          'top-right',
        );
        map.addControl(
          new AttributionControl({ compact: false }),
          'bottom-right',
        );
        if (document.fullscreenEnabled)
          map.addControl(new FullscreenControl(), 'top-right');
        map
          .getCanvas()
          .setAttribute(
            'aria-label',
            'Lyon map. Pan with arrow keys; use the coordinate form to select a start point.',
          );
        map.on('load', () => {
          window.clearTimeout(timeout);
          if (!disposed && !sourceFailed) setStatus('ready');
        });
        map.on('error', () => {
          sourceFailed = true;
          window.clearTimeout(timeout);
          if (!disposed) setStatus('error');
        });
        map.on('click', (event) => {
          onSelect([event.lngLat.lng, event.lngLat.lat]);
        });
        map.on('moveend', () => {
          if (disposed || !map) return;
          const center = map.getCenter();
          setViewport({
            center: [center.lng, center.lat],
            zoom: map.getZoom(),
            bearing: map.getBearing(),
          });
        });
        syncMarkerRef.current = () => {
          if (!map || disposed) return;
          const point = selectedRef.current;
          if (!point) {
            markerRef.current?.remove();
            markerRef.current = null;
            return;
          }
          if (markerRef.current) {
            markerRef.current.setLngLat([...point]);
            return;
          }
          const marker = new Marker({ color: '#ed7749', draggable: true })
            .setLngLat([...point])
            .addTo(map);
          marker
            .getElement()
            .setAttribute(
              'aria-label',
              'Selected start point. Drag to move, or use the coordinate form.',
            );
          marker.on('dragend', () => {
            const moved = marker.getLngLat();
            if (!onSelect([moved.lng, moved.lat]) && selectedRef.current)
              marker.setLngLat([...selectedRef.current]);
          });
          markerRef.current = marker;
        };
        syncMarkerRef.current();
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => map?.resize());
          observer.observe(container.current);
        }
      } catch {
        window.clearTimeout(timeout);
        if (!disposed) setStatus('error');
      }
    }
    void initialize();
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      observer?.disconnect();
      syncMarkerRef.current = null;
      markerRef.current?.remove();
      markerRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
  }, [configuration, onSelect, attempt]);

  useEffect(() => {
    viewRef.current = view;
    mapRef.current?.jumpTo({
      center: [...view.center],
      zoom: view.zoom,
      bearing: 0,
      pitch: 0,
    });
  }, [view]);

  const unconfigured = configuration.mode === 'unconfigured';
  return (
    <div className="map-stage">
      <div
        className="map-surface"
        ref={container}
        role="region"
        aria-label="Interactive Lyon map"
      />
      {unconfigured ? (
        <div className="map-message" role="status">
          <strong>Map provider not configured</strong>
          <p>You can still choose a start point with the coordinate form.</p>
        </div>
      ) : status === 'loading' ? (
        <div className="map-message" role="status">
          <strong>Finding your view of Lyon…</strong>
          <p>Loading the map. Coordinate selection is already available.</p>
        </div>
      ) : status === 'error' ? (
        <div className="map-message map-message-error" role="alert">
          <strong>The map is unavailable</strong>
          <p>
            Check your connection or map configuration. Your start point is
            kept, and coordinates still work.
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setStatus('loading');
              setAttempt((value) => value + 1);
            }}
          >
            Retry map
          </button>
        </div>
      ) : (
        <span className="map-ready-badge">Lyon · click to set your start</span>
      )}
      <output className="map-view-readout" aria-label="Map viewport">
        View: {viewport.center[1].toFixed(4)}, {viewport.center[0].toFixed(4)} ·
        Zoom {viewport.zoom.toFixed(1)} · Bearing {Math.round(viewport.bearing)}
        °
      </output>
    </div>
  );
}
