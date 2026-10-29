import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';

import { firstAdminRoute } from '../navigation/nav.config';
import { AuthService } from './auth.service';

/** Signed-in users only; remembers where the user was going. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? true : inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Keep signed-in users away from the login page. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? inject(Router).createUrlTree(['/']) : true;
};

/** A temporary password must be replaced before anything else (mirrors the API rule). */
export const passwordChangedGuard: CanActivateChildFn = () => {
  const auth = inject(AuthService);
  return auth.mustChangePassword() ? inject(Router).createUrlTree(['/change-password']) : true;
};

/** `/admin` has no page of its own: go to the first administration page the user may open (or "No access"). */
export const adminIndexGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return inject(Router).parseUrl(firstAdminRoute((c) => auth.has(c)) ?? '/forbidden');
};

/** Route `data: { permissions: [...] }` — every listed permission is required;
 *  `data: { anyPermissions: [...] }` — at least one is required (e.g. staff read OR farmer self-service). */
export const permissionGuard: CanActivateFn = (route) => {
  const required = (route.data['permissions'] as string[] | undefined) ?? [];
  const any = (route.data['anyPermissions'] as string[] | undefined) ?? [];
  const auth = inject(AuthService);
  const ok = auth.hasAll(required) && (any.length === 0 || any.some((p) => auth.has(p)));
  return ok ? true : inject(Router).createUrlTree(['/forbidden']);
};
