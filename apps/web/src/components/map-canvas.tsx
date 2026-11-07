'use client';

import { useEffect, useRef, useState } from 'react';
import type { GeoJSONSource, Map as LibreMap, Marker } from 'maplibre-gl';
import type { GeoJSONFeatureCollection, LngLat } from '@drawtrail/types';
import { LYON_CENTER, LYON_ZOOM } from '@drawtrail/geo-utils';
import type { MapConfiguration } from '../lib/map-config';

export interface ViewRequest {
  center: LngLat;
  zoom: number;
  revision: number;
  bounds?: [[number, number], [number, number]];
}
interface MapCanvasProps {
  configuration: MapConfiguration;
  startPoint: LngLat | null;
  view: ViewRequest;
  onSelect: (point: LngLat) => boolean;
  targetGeometry: GeoJSONFeatureCollection;
  routeGeometry: GeoJSONFeatureCollection;
  searchAreaGeometry: GeoJSONFeatureCollection;
}

const TARGET_SOURCE = 'drawtrail-target-geometry';
const ROUTE_SOURCE = 'drawtrail-route-geometry';
const SEARCH_AREA_SOURCE = 'drawtrail-search-area';

function mutableGeoJSON(data: GeoJSONFeatureCollection) {
  return JSON.parse(JSON.stringify(data)) as Parameters<
    GeoJSONSource['setData']
  >[0];
}

export function MapCanvas({
  configuration,
  startPoint,
  view,
  onSelect,
  targetGeometry,
  routeGeometry,
  searchAreaGeometry,
}: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const selectedRef = useRef(startPoint);
  const viewRef = useRef(view);
  const targetGeometryRef = useRef(targetGeometry);
  const routeGeometryRef = useRef(routeGeometry);
  const searchAreaGeometryRef = useRef(searchAreaGeometry);
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
          minZoom: 2,
          maxZoom: 18,
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
            'Map. Pan with arrow keys; use the coordinate form to select a search area center.',
          );
        map.on('load', () => {
          window.clearTimeout(timeout);
          map?.addSource(TARGET_SOURCE, {
            type: 'geojson',
            data: mutableGeoJSON(targetGeometryRef.current),
          });
          map?.addSource(ROUTE_SOURCE, {
            type: 'geojson',
            data: mutableGeoJSON(routeGeometryRef.current),
          });
          map?.addSource(SEARCH_AREA_SOURCE, {
            type: 'geojson',
            data: mutableGeoJSON(searchAreaGeometryRef.current),
          });
          map?.addLayer({
            id: 'drawtrail-search-area-line',
            type: 'line',
            source: SEARCH_AREA_SOURCE,
            paint: {
              'line-color': '#657d91',
              'line-width': 2,
              'line-dasharray': [2, 2],
            },
          });
          map?.addLayer({
            id: 'drawtrail-route-line',
            type: 'line',
            source: ROUTE_SOURCE,
            paint: {
              'line-color': '#426b4d',
              'line-width': 5,
              'line-dasharray': [2, 1.5],
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          });
          map?.addLayer({
            id: 'drawtrail-target-line',
            type: 'line',
            source: TARGET_SOURCE,
            paint: { 'line-color': '#d27143', 'line-width': 4 },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          });
          if (viewRef.current.bounds) {
            map?.fitBounds(viewRef.current.bounds, {
              padding: 56,
              maxZoom: 15,
              duration: 450,
            });
          }
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
    if (view.bounds) {
      mapRef.current?.fitBounds(view.bounds, {
        padding: 56,
        maxZoom: 15,
        duration: 450,
      });
    } else {
      mapRef.current?.jumpTo({
        center: [...view.center],
        zoom: view.zoom,
        bearing: 0,
        pitch: 0,
      });
    }
  }, [view]);

  useEffect(() => {
    targetGeometryRef.current = targetGeometry;
    mapRef.current
      ?.getSource<GeoJSONSource>(TARGET_SOURCE)
      ?.setData(mutableGeoJSON(targetGeometry));
  }, [targetGeometry]);

  useEffect(() => {
    routeGeometryRef.current = routeGeometry;
    mapRef.current
      ?.getSource<GeoJSONSource>(ROUTE_SOURCE)
      ?.setData(mutableGeoJSON(routeGeometry));
  }, [routeGeometry]);

  useEffect(() => {
    searchAreaGeometryRef.current = searchAreaGeometry;
    mapRef.current
      ?.getSource<GeoJSONSource>(SEARCH_AREA_SOURCE)
      ?.setData(mutableGeoJSON(searchAreaGeometry));
  }, [searchAreaGeometry]);

  const unconfigured = configuration.mode === 'unconfigured';
  return (
    <div className="map-stage">
      <div
        className="map-surface"
        ref={container}
        role="region"
        aria-label="Interactive map"
      />
      {unconfigured ? (
        <div className="map-message" role="status">
          <strong>Map provider not configured</strong>
          <p>You can still choose a start point with the coordinate form.</p>
        </div>
      ) : status === 'loading' ? (
        <div className="map-message" role="status">
          <strong>Finding your map view…</strong>
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
        <span className="map-ready-badge">
          Map · click to set your area center
        </span>
      )}
      <output className="map-view-readout" aria-label="Map viewport">
        View: {viewport.center[1].toFixed(4)}, {viewport.center[0].toFixed(4)} ·
        Zoom {viewport.zoom.toFixed(1)} · Bearing {Math.round(viewport.bearing)}
        °
      </output>
    </div>
  );
}
