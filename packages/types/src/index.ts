/** Public coordinates always use GeoJSON order: [longitude, latitude]. */
export type LngLat = readonly [longitude: number, latitude: number];
/** Local East/North metres in a tangent plane centered on an explicit WGS84 anchor. */
export type EastNorth = readonly [eastMeters: number, northMeters: number];
export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: readonly LngLat[];
}
export interface GeoJSONFeature<
  P extends Record<string, unknown> = Record<string, unknown>,
> {
  type: 'Feature';
  id?: string;
  properties: P;
  geometry: GeoJSONLineString;
}
export interface GeoJSONFeatureCollection<
  P extends Record<string, unknown> = Record<string, unknown>,
> {
  type: 'FeatureCollection';
  features: readonly GeoJSONFeature<P>[];
}
export type ActivityMode = 'walking' | 'running' | 'cycling';

export interface ActivityOption {
  id: ActivityMode;
  label: string;
  description: string;
}

/** Drawing coordinates are unitless: x right, y down, within [0, 1]. */
export type DrawingPoint = readonly [x: number, y: number];
export interface DrawingStroke {
  id: string;
  label: string;
  closed: boolean;
  points: readonly DrawingPoint[];
}
export interface Drawing {
  version: 1;
  name: string;
  source: 'freehand' | 'preset' | 'svg' | 'silhouette';
  strokes: readonly DrawingStroke[];
}
