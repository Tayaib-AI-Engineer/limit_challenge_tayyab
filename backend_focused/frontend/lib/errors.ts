import axios from 'axios';

import { apiBaseUrl, SessionExpiredError } from './api-client';

// Every failed request is turned into one of these, so components never parse raw
// axios errors. Shapes come from the backend README's "Errors" table.
export type ApiProblem =
  | { kind: 'validation'; message: string; fields: Record<string, string> }
  | { kind: 'not-found'; message: string }
  | { kind: 'conflict'; message: string; blocking: Record<string, number> }
  | { kind: 'session-expired'; message: string }
  | { kind: 'unauthorized'; message: string }
  | { kind: 'network'; message: string }
  | { kind: 'server'; message: string };

function firstMessage(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return firstMessage(value[0]);
  return null;
}

export function toApiProblem(error: unknown): ApiProblem {
  if (error instanceof SessionExpiredError) {
    return { kind: 'session-expired', message: error.message };
  }
  if (!axios.isAxiosError(error)) {
    return { kind: 'server', message: 'Something went wrong.' };
  }
  if (!error.response) {
    return {
      kind: 'network',
      message: `Can't reach the API at ${apiBaseUrl}. Is the backend running?`,
    };
  }

  const { status, data } = error.response;
  const body = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const detail = firstMessage(body.detail);

  if (status === 400) {
    // DRF: {"field": ["message", ...], "non_field_errors": [...]}
    const fields: Record<string, string> = {};
    for (const [field, value] of Object.entries(body)) {
      const message = firstMessage(value);
      if (message && field !== 'non_field_errors' && field !== 'detail') fields[field] = message;
    }
    const message =
      firstMessage(body.non_field_errors) ??
      detail ??
      'Some values are invalid. Check the highlighted fields.';
    return { kind: 'validation', message, fields };
  }
  if (status === 401) return { kind: 'unauthorized', message: detail ?? 'Not signed in.' };
  if (status === 404) return { kind: 'not-found', message: detail ?? 'Not found.' };
  if (status === 409) {
    const blocking = (body.blocking_objects ?? {}) as Record<string, number>;
    return { kind: 'conflict', message: detail ?? 'This conflicts with existing data.', blocking };
  }
  return { kind: 'server', message: `The server failed (${status}). Try again in a moment.` };
}

/** True for 4xx answers, which retrying won't change. */
export function isClientError(error: unknown): boolean {
  if (error instanceof SessionExpiredError) return true;
  return axios.isAxiosError(error) && !!error.response && error.response.status < 500;
}
