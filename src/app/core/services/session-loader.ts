import { effect, untracked } from '@angular/core';

/**
 * Keeps a store in step with the signed-in account: `load` runs when an account that may use the store signs in
 * (`key` turns from null into its id), `clear` when it signs out. Create it in an injection context (a field of a
 * service). `ready()` waits for the current load, for the app's start-up.
 */
export class SessionLoader {
  private current: { key: string | null; done: Promise<void> } = { key: null, done: Promise.resolve() };

  constructor(
    private readonly key: () => string | null,
    private readonly load: (isCurrent: () => boolean) => Promise<void>,
    private readonly clear: () => void,
  ) {
    effect(() => {
      const next = this.key();
      untracked(() => this.ensure(next));
    });
  }

  /** The load for the account signed in now (started if it has not been). */
  ready(): Promise<void> {
    return this.ensure(this.key());
  }

  /** Loads again, e.g. after a refused save, so the page shows what was stored. */
  reload(): Promise<void> {
    this.current = { key: null, done: Promise.resolve() };
    return this.ready();
  }

  private ensure(key: string | null): Promise<void> {
    if (key === this.current.key) return this.current.done;
    const entry: { key: string | null; done: Promise<void> } = { key, done: Promise.resolve() };
    this.current = entry;
    if (key === null) {
      this.clear();
    } else {
      // A load that finishes after a sign-out or another sign-in must not fill the store.
      entry.done = this.load(() => this.current === entry).catch(() => undefined);
    }
    return entry.done;
  }
}
