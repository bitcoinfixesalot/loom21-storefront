import { HttpErrorResponse } from '@angular/common/http';

/** The API's problem details (application/problem+json) as the store switches on them. */
export interface Problem {
  status?: number;
  code?: string;
  detail?: string;
  errors?: Record<string, string[]>;
  lines?: { productId: number; requested: number; available: number }[];
}

/** A failed API call: `code` is the API's stable code, or "network" / "unknown". */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly problem: Problem | null,
  ) {
    super(problem?.detail ?? code);
    this.name = 'ApiError';
  }

  static from(error: unknown): ApiError {
    if (error instanceof ApiError) return error;
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return new ApiError(0, 'network', null);
      const problem = typeof error.error === 'object' && error.error ? (error.error as Problem) : null;
      return new ApiError(error.status, problem?.code ?? (error.status === 404 ? 'not_found' : 'unknown'), problem);
    }
    return new ApiError(0, 'unknown', null);
  }
}

/** The codes the store has a buyer-facing text for (i18n key "error.<code>"). */
export const KNOWN_ERRORS = [
  'insufficient_stock',
  'storefront_unavailable',
  'checkout_expired',
  'checkout_paid',
  'rate_limited',
  'validation_failed',
  'not_found',
  'too_many_open_checkouts',
  'reservation_limit',
  'too_many_payment_attempts',
  'payment_method_unavailable',
  'payment_provider_error',
  'network',
] as const;
