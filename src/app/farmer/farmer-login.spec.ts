import { ChangeDetectorRef } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Farmer, LinkCandidate } from './farmer.models';
import { FarmerLoginPanel } from './panels/farmer-login-panel';

const FARMER = { id: 'f1', full_name: 'Ramesh Patil', can_manage: true, is_self: false } as unknown as Farmer;

function candidate(over: Partial<LinkCandidate> = {}): LinkCandidate {
  return { user_id: 'u1', email: 'ramesh@test.example', full_name: 'Ramesh Patil', linked: false, ...over };
}

describe('FarmerLoginPanel', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  function render() {
    const f = TestBed.createComponent(FarmerLoginPanel);
    f.componentRef.setInput('farmer', FARMER);
    f.detectChanges();
    return f;
  }

  it('links a Farmer-role login and shows it as linked', async () => {
    const f = render();
    http.expectOne('/api/v1/farmers/f1/link-candidates').flush([candidate()]);
    await f.whenStable();
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No login is linked');
    const button = () => el.querySelector<HTMLButtonElement>('[data-testid="login-link"]')!;
    expect(button().disabled).toBe(true);                                 // nothing chosen yet
    (f.componentInstance as unknown as { selected: string }).selected = 'u1';
    f.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    f.detectChanges();
    button().click();
    const link = http.expectOne((r) => r.method === 'POST' && r.url === '/api/v1/farmers/f1/link-user');
    expect(link.request.body).toEqual({ user_id: 'u1' });
    link.flush({ ...FARMER, user_id: 'u1' });
    http.expectOne('/api/v1/farmers/f1/link-candidates').flush([candidate({ linked: true })]);
    await f.whenStable();
    f.detectChanges();
    expect(el.textContent).toContain('Linked login: Ramesh Patil');
    expect(el.querySelector('[data-testid="login-link"]')).toBeNull();     // no other candidate left
  });

  it('explains how to get a login when no Farmer-role account exists', async () => {
    const f = render();
    http.expectOne('/api/v1/farmers/f1/link-candidates').flush([]);
    await f.whenStable();
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Ask an administrator to create the farmer\'s account (role Farmer)');
  });
});
