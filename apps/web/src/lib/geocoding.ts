import type { LngLat } from '@drawtrail/types';
import { LYON_CENTER } from '@drawtrail/geo-utils';

export interface PlaceResult {
  id: string;
  name: string;
  center: LngLat;
}
/** Replaceable, cancellable provider. No remote geocoder is enabled by default. */
export interface Geocoder {
  label: string;
  search(query: string, signal: AbortSignal): Promise<readonly PlaceResult[]>;
}

const lyonPlaces: readonly PlaceResult[] = [
  { id: 'lyon', name: 'Lyon · city center', center: LYON_CENTER },
  { id: 'bellecour', name: 'Place Bellecour', center: [4.832, 45.7579] },
  { id: 'terreaux', name: 'Place des Terreaux', center: [4.8336, 45.7674] },
  { id: 'tete-or', name: 'Parc de la Tête d’Or', center: [4.8536, 45.7794] },
  { id: 'part-dieu', name: 'Gare Lyon Part-Dieu', center: [4.8597, 45.7606] },
];

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');

export const localGeocoder: Geocoder = {
  label: 'Local Lyon places',
  async search(query, signal) {
    signal.throwIfAborted();
    const normalized = normalize(query.trim());
    if (normalized.length < 2) return [];
    return lyonPlaces.filter((place) =>
      normalize(place.name).includes(normalized),
    );
  },
};
