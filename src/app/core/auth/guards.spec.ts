import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';

import { NAVIGATION, firstAdminRoute, visibleNavigation } from '../navigation/nav.config';
import { makeMe } from '../../../testing/fixtures';
import { AuthService } from './auth.service';
import { adminIndexGuard, authGuard, guestGuard, passwordChangedGuard, permissionGuard } from './guards';

describe('route guards', () => {
  let auth: AuthService;
  let router: Router;
  const state = { url: '/admin/users?page=2' } as RouterStateSnapshot;
  const route = (permissions?: string[]) => ({ data: permissions ? { permissions } : {} }) as unknown as ActivatedRouteSnapshot;
  const run = <T>(fn: () => T) => TestBed.runInInjectionContext(fn);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  it('authGuard sends anonymous users to login and remembers the target', () => {
    const res = run(() => authGuard(route(), state)) as UrlTree;
    expect(router.serializeUrl(res)).toBe('/login?returnUrl=%2Fadmin%2Fusers%3Fpage%3D2');
    auth.me.set(makeMe());
    expect(run(() => authGuard(route(), state))).toBe(true);
  });

  it('guestGuard keeps signed-in users off the login page', () => {
    expect(run(() => guestGuard(route(), state))).toBe(true);
    auth.me.set(makeMe());
    expect(router.serializeUrl(run(() => guestGuard(route(), state)) as UrlTree)).toBe('/');
  });

  it('permissionGuard requires every listed permission', () => {
    auth.me.set(makeMe(['users.read']));
    expect(run(() => permissionGuard(route(['users.read']), state))).toBe(true);
    const denied = run(() => permissionGuard(route(['users.read', 'users.manage']), state)) as UrlTree;
    expect(router.serializeUrl(denied)).toBe('/forbidden');
  });

  it('passwordChangedGuard forces a temporary password to be replaced', () => {
    auth.me.set(makeMe([], { must_change_password: true }));
    expect(router.serializeUrl(run(() => passwordChangedGuard(route(), state)) as UrlTree)).toBe('/change-password');
    auth.me.set(makeMe());
    expect(run(() => passwordChangedGuard(route(), state))).toBe(true);
  });
});

describe('navigation registry', () => {
  it('shows only sections and items the user is permitted to open', () => {
    const support = visibleNavigation(NAVIGATION, (c) => ['users.read', 'organizations.read'].includes(c));
    expect(support.map((s) => s.title)).toEqual(['Overview', 'Administration']);
    expect(support[1].items.map((i) => i.route)).toEqual(['/admin/users', '/admin/organizations']);
    const nobody = visibleNavigation(NAVIGATION, () => false);
    expect(nobody.flatMap((s) => s.items).map((i) => i.route)).toEqual(['/dashboard']);
  });
});

describe('navigation and routes (review fixes)', () => {
  const items = (codes: string[]) => visibleNavigation(NAVIGATION, (c) => codes.includes(c)).flatMap((s) => s.items);

  it('never shows two items for the same page: a staff user who is also a farmer sees "Farms" once', () => {
    const shown = items(['farms.read', 'farmers.self']);
    expect(shown.filter((i) => i.route === '/farms').map((i) => i.label)).toEqual(['Farms']);
    expect(items(['farmers.self']).filter((i) => i.route === '/farms').map((i) => i.label)).toEqual(['My farms']);
  });

  it('gives every navigation item its own icon', () => {
    const all = NAVIGATION.flatMap((s) => s.items).filter((i) => i.label !== 'My farms');   // "My farms" stands in for "Farms"
    expect(new Set(all.map((i) => i.icon)).size).toBe(all.length);
  });

  it('opens the staff farmer list for farmers.read only; a farmer may still open a farmer record', async () => {
    const { routes } = await import('../../app.routes');
    const shell = routes.find((r) => r.path === '')!;
    const farmers = shell.children!.find((r) => r.path === 'farmers')!;
    expect(farmers.data).toBeUndefined();
    expect(farmers.children!.find((r) => r.path === '')!.data).toEqual({ permissions: ['farmers.read'] });
    expect(farmers.children!.find((r) => r.path === ':id')!.data!['anyPermissions']).toContain('farmers.self');
  });

  it('/admin goes to the first administration page the user may open', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const auth = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    const go = () => router.serializeUrl(TestBed.runInInjectionContext(() =>
      adminIndexGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)) as UrlTree);
    auth.me.set(makeMe(['audit.read', 'security.read']));
    expect(go()).toBe('/admin/audit');
    auth.me.set(makeMe(['security.read']));
    expect(go()).toBe('/admin/security');
    auth.me.set(makeMe(['projects.read']));
    expect(go()).toBe('/forbidden');
    expect(firstAdminRoute((c) => c === 'users.read')).toBe('/admin/users');
  });
});
