import { RESPONSE_INIT, inject } from '@angular/core';

/**
 * Sets the server-rendered page's HTTP status (404 for an unknown product, so search engines drop it). Call it in an
 * injection context; in the browser it does nothing.
 */
export function responseStatus(): (status: number) => void {
  const init = inject(RESPONSE_INIT, { optional: true });
  return status => {
    if (init) init.status = status;
  };
}
