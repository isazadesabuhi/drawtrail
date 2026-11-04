/** Public coordinates always use GeoJSON order: [longitude, latitude]. */
export type LngLat = readonly [longitude: number, latitude: number];
export type ActivityMode = 'walking' | 'running' | 'cycling';

export interface ActivityOption {
  id: ActivityMode;
  label: string;
  description: string;
}
