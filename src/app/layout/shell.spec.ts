import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ApiError } from '../core/api/api.models';
import { AppErrorHandler } from '../core/app-error-handler';
import { NotifyService } from '../core/notify.service';
import { internalLink } from './shell';

describe('notification links', () => {
  it.each(['/projects/p1', '/mrv/projects/p1?tab=registry', '/farms/f1#map'])('follows the in-app path %s', (link) => {
    expect(internalLink(link)).toBe(link);
  });

  it.each([null, '', 'https://evil.example/x', '//evil.example/x', '/\\evil.example', 'javascript:alert(1)', 'projects/p1', '/a\nb', ' /x'])(
    'ignores %j', (link) => expect(internalLink(link)).toBeNull());
});

describe('AppErrorHandler', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [{ provide: ErrorHandler, useClass: AppErrorHandler }] }));

  it('shows an unhandled API failure as an error toast, but not a 401 (the session handling owns that)', async () => {
    const notify = TestBed.inject(NotifyService);
    const shown = vi.spyOn(notify, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = TestBed.inject(ErrorHandler);
    handler.handleError(new ApiError(500, 'INTERNAL', 'Database down'));
    handler.handleError(new ApiError(401, 'TOKEN_EXPIRED', 'expired'));
    handler.handleError(new Error('template bug'));
    await vi.waitFor(() => expect(shown).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(shown).toHaveBeenCalledTimes(1);
    expect((shown.mock.calls[0][0] as ApiError).message).toBe('Database down');
  });
});
