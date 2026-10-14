import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ApiError } from './api/api.models';

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly snack = inject(MatSnackBar);

  success(message: string): void {
    this.snack.open(message, 'OK', { duration: 3500, panelClass: 'snack-success' });
  }

  error(err: unknown, fallback = 'Something went wrong.'): void {
    const e = err instanceof ApiError ? err : ApiError.from(err);
    const ref = e.requestId ? ` (ref ${e.requestId.slice(0, 8)})` : '';
    const fields = fieldSummary(e);
    this.snack.open(`${e.message || fallback}${fields}${ref}`, 'Dismiss', { duration: fields ? 12000 : 7000, panelClass: 'snack-error' });
  }

  /** An error the user can try again from the toast itself (e.g. a failed sign-out): "<what failed> <server message>" + Retry. */
  errorWithRetry(what: string, err: unknown, retry: () => void): void {
    const e = err instanceof ApiError ? err : ApiError.from(err);
    const ref = e.requestId ? ` (ref ${e.requestId.slice(0, 8)})` : '';
    this.snack.open(`${what} ${e.message}${ref}`.trim(), 'Retry', { duration: 15000, panelClass: 'snack-error' })
      .onAction().subscribe(retry);
  }
}

/** " — Depth top cm: …; …" for a 422 with field errors, so the user can see which value the server refused (at most 3). */
export function fieldSummary(e: ApiError): string {
  const errs = e.fieldErrors.filter((f) => f.message);
  if (!errs.length) return '';
  const human = (f: string) => (f.split('.').pop() || f).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const parts = errs.slice(0, 3).map((f) => (f.field ? `${human(f.field)}: ${f.message}` : f.message));
  return ` — ${parts.join('; ')}${errs.length > 3 ? ` (+${errs.length - 3} more)` : ''}`;
}
