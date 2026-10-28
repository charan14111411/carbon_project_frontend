import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, switchMap, throwError } from 'rxjs';

import { API_BASE } from '../api/api.service';
import { ApiError, ApiErrorBody } from '../api/api.models';
import { AuthService } from '../auth/auth.service';

const AUTH_ENDPOINT = /\/auth\/(login|refresh|logout|token)$/;

/** Adds the bearer token; on a 401 refreshes once and retries the original request. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_BASE)) return next(req);
  const auth = inject(AuthService);
  const isAuthCall = AUTH_ENDPOINT.test(req.url);
  const token = auth.accessToken();
  const withToken = token && !isAuthCall ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(withToken).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || isAuthCall || !token) {
        return throwError(() => err);
      }
      return auth.refresh().pipe(
        catchError((refreshErr: unknown) => {
          auth.sessionEnded();
          return throwError(() => refreshErr);
        }),
        switchMap((fresh) => next(req.clone({ setHeaders: { Authorization: `Bearer ${fresh}` } }))),
      );
    }),
  );
};

/** Converts every HTTP failure into an ApiError carrying the backend's error envelope. */
export const errorInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((err: unknown) => {
      // Downloads ask for a Blob, so an error envelope arrives as a Blob too: read it so the error_code is not lost.
      if (err instanceof HttpErrorResponse && err.error instanceof Blob) {
        return blobText(err.error).pipe(switchMap((text) => throwError(() => toApiError(err, parseJson(text)))));
      }
      return throwError(() => toApiError(err, err instanceof HttpErrorResponse ? err.error : null));
    }),
  );

function toApiError(err: unknown, errorBody: unknown): ApiError {
  if (!(err instanceof HttpErrorResponse)) return ApiError.from(err);
  if (err.status === 0) return new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  const body = errorBody as Partial<ApiErrorBody> | null;
  if (body && typeof body === 'object' && typeof body.error_code === 'string') {
    return new ApiError(err.status, body.error_code, body.message ?? 'Request failed.', body.details ?? {}, body.request_id ?? null);
  }
  const fallback = err.status >= 500 ? 'The server had a problem. Please try again.' : 'The request failed.';
  return new ApiError(err.status, 'HTTP_ERROR', fallback, {}, err.headers.get('X-Request-ID'));
}

/** The Blob's text ('' if it cannot be read). FileReader rather than Blob.text(), which older engines (and jsdom) lack. */
function blobText(blob: Blob): Observable<string> {
  return new Observable<string>((sub) => {
    const reader = new FileReader();
    reader.onload = () => {
      sub.next(typeof reader.result === 'string' ? reader.result : '');
      sub.complete();
    };
    reader.onerror = () => {
      sub.next('');
      sub.complete();
    };
    reader.readAsText(blob);
    return () => {
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
  });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
