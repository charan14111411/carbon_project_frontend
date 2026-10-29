import { InjectionToken, Signal, inject, signal } from '@angular/core';

/**
 * True while the surrounding page shows a record that refuses writes, e.g. a CLOSED project: its MRV and calculation history stay
 * readable, but no panel offers an action. Pages provide it (`{ provide: READ_ONLY, useFactory: () => inject(Page).closed }`);
 * anywhere else it is false.
 */
export const READ_ONLY = new InjectionToken<Signal<boolean>>('READ_ONLY', { providedIn: 'root', factory: () => signal(false).asReadonly() });

/**
 * For panel permission flags: false when the page is read-only. Read once when the panel is created; the MRV workspace creates its
 * panels only after the project has loaded, and CLOSED is final. Call from an injection context.
 */
export function writable(): boolean {
  return !inject(READ_ONLY)();
}
