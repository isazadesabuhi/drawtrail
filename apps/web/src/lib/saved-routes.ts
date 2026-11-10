import { z } from 'zod';
import {
  routeGenerationSuccessSchema,
  type RouteGenerationSuccess,
} from '@drawtrail/validation';

const savedRouteSchema = z
  .object({
    id: z.string().min(1).max(120),
    name: z.string().trim().min(1).max(80),
    savedAt: z.string().datetime(),
    selectedAlternativeIndex: z.number().int().min(0).max(2),
    result: routeGenerationSuccessSchema,
  })
  .strict();
const savedRouteCollectionSchema = z
  .object({ version: z.literal(1), routes: z.array(savedRouteSchema).max(20) })
  .strict();

export type SavedRoute = z.infer<typeof savedRouteSchema>;
export const MAX_SAVED_ROUTES = 20;
export const SAVED_ROUTES_STORAGE_KEY = 'drawtrail.saved-routes.v1';
const MAX_STORAGE_CHARACTERS = 1_500_000;

export interface RouteStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function parseSavedRoutes(raw: string | null): SavedRoute[] {
  try {
    if (!raw) return [];
    const parsed = savedRouteCollectionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.routes : [];
  } catch {
    return [];
  }
}

export function readSavedRoutes(storage: RouteStorage): SavedRoute[] {
  try {
    return parseSavedRoutes(storage.getItem(SAVED_ROUTES_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveRouteLocally(
  storage: RouteStorage,
  name: string,
  result: RouteGenerationSuccess,
  selectedAlternativeIndex: number,
): { routes: SavedRoute[]; error?: string } {
  const current = readSavedRoutes(storage);
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `route-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const candidate = savedRouteSchema.safeParse({
    id,
    name: name.trim(),
    savedAt: new Date().toISOString(),
    selectedAlternativeIndex,
    result,
  });
  if (!candidate.success)
    return {
      routes: current,
      error: 'Enter a route name and select a valid route.',
    };
  const routes = [candidate.data, ...current].slice(0, MAX_SAVED_ROUTES);
  const value = JSON.stringify({ version: 1, routes });
  if (value.length > MAX_STORAGE_CHARACTERS)
    return {
      routes: current,
      error:
        'This route library is full. Remove a saved route before adding another.',
    };
  try {
    storage.setItem(SAVED_ROUTES_STORAGE_KEY, value);
    return { routes };
  } catch {
    return {
      routes: current,
      error:
        'This browser could not save the route. Check available local storage.',
    };
  }
}

export function removeSavedRoute(storage: RouteStorage, id: string) {
  const routes = readSavedRoutes(storage).filter((route) => route.id !== id);
  try {
    storage.setItem(
      SAVED_ROUTES_STORAGE_KEY,
      JSON.stringify({ version: 1, routes }),
    );
    return { routes };
  } catch {
    return {
      routes: readSavedRoutes(storage),
      error: 'Could not remove the saved route.',
    };
  }
}
