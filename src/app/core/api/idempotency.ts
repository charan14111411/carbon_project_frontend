/**
 * Idempotency-Key helpers. A money- or credit-critical POST carries one key per user submission: a retry of the same request (the
 * auth interceptor's replay after a token refresh, a double click, a retry after a lost response) sends the same key, so the server
 * replays the first result instead of acting twice.
 */

/** A fresh Idempotency-Key for one user submission (kept across retries of that submission, renewed after success). */
export function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * One Idempotency-Key per form and per form content. Sending the same values again (a double click, a retry after a lost response)
 * reuses the key, so the server replays the first request instead of recording twice; any change to the values gets a fresh key.
 * Call reset() once the request succeeded so the next, separate submission is never taken for a replay.
 */
export class FormKeys {
  private readonly keys = new Map<string, { content: string; key: string }>();

  for(form: string, body: unknown): string {
    const content = JSON.stringify(body);
    const known = this.keys.get(form);
    if (known?.content === content) return known.key;
    const key = newKey();
    this.keys.set(form, { content, key });
    return key;
  }

  reset(form: string): void {
    this.keys.delete(form);
  }
}
