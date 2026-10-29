import { DestroyRef, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PageEvent } from '@angular/material/paginator';
import { Sort } from '@angular/material/sort';
import { EMPTY, Observable, Subject, catchError, expand, finalize, map, of, reduce, switchMap, tap } from 'rxjs';

import { ApiError, Page, PageQuery } from '../core/api/api.models';

/** Largest page the API serves (backend `page_size` le=100). */
export const MAX_PAGE_SIZE = 100;

/**
 * Every item of a paged list, fetched page by page (for pickers and short lists that must never be cut off silently at one page).
 * Stops when `total` is reached or a page comes back empty.
 */
export function allPages<T>(fetch: (q: { page: number; page_size: number }) => Observable<Page<T>>): Observable<T[]> {
  const get = (page: number) => fetch({ page, page_size: MAX_PAGE_SIZE }).pipe(map((res) => ({ page, res })));
  return get(1).pipe(
    expand(({ page, res }) => (res.items.length && page * MAX_PAGE_SIZE < res.total ? get(page + 1) : EMPTY)),
    reduce((all, { res }) => all.concat(res.items), [] as T[]),
  );
}

/**
 * Server-side pagination + sorting state for a list page (spec section 38).
 * Overlapping requests are cancelled (switchMap) so results never arrive out of order.
 */
export class PagedList<T> {
  readonly items = signal<T[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly sort = signal<string | null>(null);

  private readonly trigger = new Subject<void>();

  constructor(fetch: (q: PageQuery) => Observable<Page<T>>, destroyRef: DestroyRef, defaultSort: string | null = null) {
    this.sort.set(defaultSort);
    this.trigger
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.error.set(null);
        }),
        switchMap(() =>
          fetch({ page: this.page(), page_size: this.pageSize(), sort: this.sort() }).pipe(
            catchError((e: unknown) => {
              this.error.set(ApiError.from(e));
              return of(null);
            }),
            finalize(() => this.loading.set(false)),
          ),
        ),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((res) => {
        this.loading.set(false);
        if (!res) return;
        this.items.set(res.items);
        this.total.set(res.total);
      });
  }

  load(): void {
    this.trigger.next();
  }

  /** Filters changed: go back to page 1. */
  reset(): void {
    this.page.set(1);
    this.load();
  }

  onPage(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    this.pageSize.set(e.pageSize);
    this.load();
  }

  onSort(s: Sort): void {
    this.sort.set(s.direction ? `${s.direction === 'desc' ? '-' : ''}${s.active}` : null);
    this.reset();
  }
}
