import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ApiError } from '../api/api.models';
import { AuthService } from '../auth/auth.service';
import { authInterceptor, errorInterceptor } from './interceptors';

async function rejection(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('expected the request to fail');
}

describe('HTTP interceptors', () => {
  let http: HttpClient;
  let ctl: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    ctl = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => ctl.verify());

  function signIn(token = 'old'): void {
    (auth as unknown as { token: { set(v: string): void } }).token.set(token);
  }

  it('adds the bearer token to API calls but not to auth endpoints or other hosts', () => {
    signIn('abc');
    http.get('/api/v1/admin/users').subscribe();
    expect(ctl.expectOne('/api/v1/admin/users').request.headers.get('Authorization')).toBe('Bearer abc');
    http.post('/api/v1/auth/login', {}).subscribe();
    expect(ctl.expectOne('/api/v1/auth/login').request.headers.has('Authorization')).toBe(false);
    http.get('https://tiles.example/x').subscribe();
    expect(ctl.expectOne('https://tiles.example/x').request.headers.has('Authorization')).toBe(false);
  });

  it('on 401 refreshes once and retries with the new token', async () => {
    signIn('old');
    const result = firstValueFrom(http.get<{ ok: boolean }>('/api/v1/admin/users'));
    ctl.expectOne('/api/v1/admin/users').flush({ error_code: 'TOKEN_EXPIRED', message: 'expired' }, { status: 401, statusText: 'Unauthorized' });
    ctl.expectOne('/api/v1/auth/refresh').flush({ access_token: 'new', token_type: 'bearer', expires_in: 900, must_change_password: false });
    const retry = ctl.expectOne('/api/v1/admin/users');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new');
    retry.flush({ ok: true });
    expect(await result).toEqual({ ok: true });
  });

  it('ends the session when the refresh also fails', async () => {
    signIn('old');
    const ended = vi.spyOn(auth, 'sessionEnded').mockImplementation(() => undefined);
    const result = rejection(firstValueFrom(http.get('/api/v1/admin/users')));
    ctl.expectOne('/api/v1/admin/users').flush({}, { status: 401, statusText: 'Unauthorized' });
    ctl.expectOne('/api/v1/auth/refresh').flush(
      { success: false, error_code: 'REFRESH_REUSED', message: 'revoked', details: {}, request_id: 'x' },
      { status: 401, statusText: 'Unauthorized' },
    );
    const err = await result;
    expect(ended).toHaveBeenCalled();
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('REFRESH_REUSED');
  });

  it('ends the session when the retry after a successful refresh is refused again', async () => {
    signIn('old');
    const ended = vi.spyOn(auth, 'sessionEnded').mockImplementation(() => undefined);
    const result = rejection(firstValueFrom(http.get('/api/v1/admin/users')));
    ctl.expectOne('/api/v1/admin/users').flush({}, { status: 401, statusText: 'Unauthorized' });
    ctl.expectOne('/api/v1/auth/refresh').flush({ access_token: 'new', token_type: 'bearer', expires_in: 900, must_change_password: false });
    ctl.expectOne('/api/v1/admin/users').flush(
      { success: false, error_code: 'SESSION_REVOKED', message: 'ended', details: {}, request_id: 'y' },
      { status: 401, statusText: 'Unauthorized' },
    );
    expect((await result).code).toBe('SESSION_REVOKED');
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the retry fails for another reason', async () => {
    signIn('old');
    const ended = vi.spyOn(auth, 'sessionEnded').mockImplementation(() => undefined);
    const result = rejection(firstValueFrom(http.get('/api/v1/admin/users')));
    ctl.expectOne('/api/v1/admin/users').flush({}, { status: 401, statusText: 'Unauthorized' });
    ctl.expectOne('/api/v1/auth/refresh').flush({ access_token: 'new', token_type: 'bearer', expires_in: 900, must_change_password: false });
    ctl.expectOne('/api/v1/admin/users').flush({}, { status: 403, statusText: 'Forbidden' });
    expect((await result).status).toBe(403);
    expect(ended).not.toHaveBeenCalled();
  });

  it('turns the backend error envelope into an ApiError with field errors', async () => {
    const result = rejection(firstValueFrom(http.post('/api/v1/admin/users', {})));
    ctl.expectOne('/api/v1/admin/users').flush(
      { success: false, error_code: 'VALIDATION_FAILED', message: 'The submitted data is invalid.', request_id: 'req-9',
        details: { errors: [{ field: 'email', message: 'bad email' }] } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    const err = await result;
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.requestId).toBe('req-9');
    expect(err.fieldErrors).toEqual([{ field: 'email', message: 'bad email' }]);
  });

  it('reads the error envelope of a failed download (Blob body) so the error code is kept', async () => {
    const result = rejection(firstValueFrom(http.get('/api/v1/evidence/documents/d1/download', { responseType: 'blob' })));
    const envelope = { success: false, error_code: 'DOCUMENT_QUARANTINED', message: 'This document is quarantined.', details: {}, request_id: 'r1' };
    ctl.expectOne('/api/v1/evidence/documents/d1/download').flush(
      new Blob([JSON.stringify(envelope)], { type: 'application/json' }), { status: 409, statusText: 'Conflict' });
    const err = await result;
    expect(err.code).toBe('DOCUMENT_QUARANTINED');
    expect(err.message).toBe('This document is quarantined.');
    expect(err.requestId).toBe('r1');
  });

  it('reports network failures clearly', async () => {
    const result = rejection(firstValueFrom(http.get('/api/v1/health')));
    ctl.expectOne('/api/v1/health').error(new ProgressEvent('error'), { status: 0 });
    expect((await result).code).toBe('NETWORK_ERROR');
  });
});
