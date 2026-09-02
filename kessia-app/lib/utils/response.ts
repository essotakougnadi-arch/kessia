// ============================================================
// KESSIA — API Response Helpers
// Standardise toutes les réponses API
// ============================================================

import { NextResponse } from 'next/server';

export type ApiSuccess<T = unknown> = {
  success: true;
  data: T;
  message?: string;
};

export type ApiError = {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, string[]>;
};

// ---- Success responses ----

export function ok<T>(data: T, message?: string, status = 200): NextResponse {
  return NextResponse.json(
    { success: true, data, ...(message && { message }) } satisfies ApiSuccess<T>,
    { status }
  );
}

export function created<T>(data: T, message?: string): NextResponse {
  return ok(data, message, 201);
}

// ---- Error responses ----

export function badRequest(
  error: string,
  details?: Record<string, string[]>
): NextResponse {
  return NextResponse.json(
    { success: false, error, code: 'BAD_REQUEST', ...(details && { details }) } satisfies ApiError,
    { status: 400 }
  );
}

export function unauthorized(error = 'Non autorisé'): NextResponse {
  return NextResponse.json(
    { success: false, error, code: 'UNAUTHORIZED' } satisfies ApiError,
    { status: 401 }
  );
}

export function forbidden(error = 'Accès refusé'): NextResponse {
  return NextResponse.json(
    { success: false, error, code: 'FORBIDDEN' } satisfies ApiError,
    { status: 403 }
  );
}

export function notFound(error = 'Ressource introuvable'): NextResponse {
  return NextResponse.json(
    { success: false, error, code: 'NOT_FOUND' } satisfies ApiError,
    { status: 404 }
  );
}

export function conflict(error: string): NextResponse {
  return NextResponse.json(
    { success: false, error, code: 'CONFLICT' } satisfies ApiError,
    { status: 409 }
  );
}

export function tooManyRequests(error = 'Trop de tentatives. Réessayez plus tard.'): NextResponse {
  return NextResponse.json(
    { success: false, error, code: 'TOO_MANY_REQUESTS' } satisfies ApiError,
    { status: 429 }
  );
}

export function serverError(error = 'Une erreur interne est survenue'): NextResponse {
  return NextResponse.json(
    { success: false, error, code: 'INTERNAL_ERROR' } satisfies ApiError,
    { status: 500 }
  );
}

// ---- Validation error from Zod ----

export function validationError(
  zodError: { errors: { path: (string | number)[]; message: string }[] }
): NextResponse {
  const details: Record<string, string[]> = {};
  for (const issue of zodError.errors) {
    const field = issue.path.join('.');
    if (!details[field]) details[field] = [];
    details[field].push(issue.message);
  }
  return badRequest('Données invalides', details);
}
