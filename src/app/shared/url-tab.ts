import { Signal, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { reloadOn } from './reload-on';

export interface UrlTab {
  /** Index for `<mat-tab-group [selectedIndex]>`. */
  readonly index: Signal<number>;
  /** Bind to `(selectedIndexChange)`: selects the tab and writes `?tab=<key>` (replaceUrl), so refresh and back keep it. */
  select(index: number): void;
}

/**
 * The selected tab of a page, kept in `?tab=`. `keys` lists the keys of the tabs that are actually rendered, in order; pages whose
 * tabs depend on permissions pass only the visible ones, so `?tab=registry` always selects the Registry tab whatever comes before it.
 * Unknown keys select the first tab. Call from an injection context.
 */
export function urlTab(keys: () => readonly string[]): UrlTab {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  const param = toSignal(route.queryParamMap.pipe(map((q) => q.get('tab'))));
  const index = signal(0);
  reloadOn(() => [keys(), param()], () => index.set(Math.max(0, keys().indexOf(param() ?? ''))));
  return {
    index,
    select(i: number): void {
      index.set(i);
      const key = keys()[i];
      if (!key || key === param()) return;
      void router.navigate([], { relativeTo: route, queryParams: { tab: key }, queryParamsHandling: 'merge', replaceUrl: true });
    },
  };
}
