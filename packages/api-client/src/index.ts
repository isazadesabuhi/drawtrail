export const API_VERSION = 'v1' as const;

export function apiSuccessEnvelope<T>(data: T) {
  return {
    apiVersion: API_VERSION,
    status: 'success' as const,
    data,
    error: null,
  };
}

export function apiErrorEnvelope(
  code: string,
  message: string,
  warnings: string[] = [],
) {
  return {
    apiVersion: API_VERSION,
    status: 'error' as const,
    data: null,
    error: { code, message, warnings },
  };
}

export type ApiEnvelope<T> =
  | { apiVersion: 'v1'; status: 'success'; data: T; error: null }
  | {
      apiVersion: 'v1';
      status: 'error';
      data: null;
      error: { code: string; message: string; warnings: string[] };
    };
