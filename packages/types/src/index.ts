/** Public coordinates always use GeoJSON order: [longitude, latitude]. */
export type LngLat = readonly [longitude: number, latitude: number];
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
