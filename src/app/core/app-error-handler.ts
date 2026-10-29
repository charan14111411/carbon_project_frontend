import { ErrorHandler, Injectable, Injector, inject } from '@angular/core';

import { ApiError } from './api/api.models';

/**
 * Safety net for API reads subscribed without an error callback: RxJS reports such an error as unhandled, and without this the page
 * would just look empty ("no data"). An ApiError that reaches here is shown as an error toast. 401s are left alone (the auth
 * interceptor already ended the session). NotifyService is loaded on demand so the snack-bar stays out of the initial bundle.
 */
@Injectable()
export class AppErrorHandler extends ErrorHandler {
  private readonly injector = inject(Injector);

  override handleError(error: unknown): void {
    if (error instanceof ApiError && error.status !== 401) {
      import('./notify.service')
        .then((m) => this.injector.get(m.NotifyService).error(error))
        .catch(() => undefined);   // e.g. the app is being torn down: the error is still logged below
    }
    super.handleError(error);
  }
}
