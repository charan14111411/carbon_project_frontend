import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { CalculationApi } from '../../calculation/calculation.api';
import { RegistryApi } from '../../registry/registry.api';
import { VerificationApi, VvbApi } from '../../verification/verification.api';
import { FormKeys, newKey } from './idempotency';

describe('Idempotency keys', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('makes a fresh key each time and FormKeys reuses one only for identical content until reset', () => {
    expect(newKey()).not.toBe(newKey());
    const keys = new FormKeys();
    const a = keys.for('f', { x: 1 });
    expect(keys.for('f', { x: 1 })).toBe(a);
    expect(keys.for('f', { x: 2 })).not.toBe(a);
    keys.reset('f');
    expect(keys.for('f', { x: 2 })).not.toBe(a);
  });

  it('sends an Idempotency-Key on every registry, VVB and calculation-approval mutation', () => {
    const reg = TestBed.inject(RegistryApi);
    const ver = TestBed.inject(VerificationApi);
    const vvb = TestBed.inject(VvbApi);
    const calc = TestBed.inject(CalculationApi);
    const calls: [Observable<unknown>, string][] = [
      [reg.createSubmission('p1', {}), '/api/v1/registry/projects/p1/submissions'],
      [reg.freeze('s1'), '/api/v1/registry/submissions/s1/freeze'],
      [reg.submit('s1'), '/api/v1/registry/submissions/s1/submit'],
      [reg.recordSubmitted('s1', {}), '/api/v1/registry/submissions/s1/record-submitted'],
      [reg.recordResponse('s1', {}), '/api/v1/registry/submissions/s1/record-response'],
      [reg.recordIssuance('s1', {}), '/api/v1/registry/submissions/s1/issuances'],
      [reg.confirm('i1', 'ok'), '/api/v1/registry/issuances/i1/confirm'],
      [reg.void('i1', 'wrong'), '/api/v1/registry/issuances/i1/void'],
      [ver.submit('a1'), '/api/v1/verification/assignments/a1/submit'],
      [vvb.decide('vs1', new File(['x'], 'd.pdf'), { decision: 'VERIFIED' }), '/api/v1/vvb/submissions/vs1/decision'],
      [calc.approve('r1', 'fine'), '/api/v1/calculations/runs/r1/approve'],
    ];
    for (const [obs, url] of calls) {
      obs.subscribe();
      const req = http.expectOne(url);
      expect(req.request.headers.get('Idempotency-Key')).toBeTruthy();
      req.flush({});
    }
  });

  it('passes a caller-held key through unchanged so a retry replays', () => {
    TestBed.inject(RegistryApi).confirm('i1', 'ok', 'k-held').subscribe();
    expect(http.expectOne('/api/v1/registry/issuances/i1/confirm').request.headers.get('Idempotency-Key')).toBe('k-held');
  });
});
