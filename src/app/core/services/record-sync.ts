/** A record the API keeps: it answers every save with the stored copy and its new `updatedAt`. */
interface Versioned {
  id: string;
  updatedAt: string;
}

export interface RecordSyncOptions<T extends Versioned> {
  /** The record as the page has it now; undefined once it is gone. */
  current(id: string): T | undefined;
  /** Saves it: `version` is the stored `updatedAt` it was changed from, or null for a new record. */
  send(record: T, version: string | null): Promise<T>;
  /** Deletes the stored record. */
  sendDelete(id: string): Promise<unknown>;
  /** The stored copy, once no newer change of the page is waiting to be sent. */
  saved(record: T): void;
  failed(error: unknown): void;
}

/**
 * Sends the page's changes to the API one request at a time per record. The page shows a change at once; a change
 * made while the record is being saved goes in the next request, sent with the version the previous one returned,
 * so quick edits (ticking several to-dos) do not trip the API's check for someone else's change (409 CONFLICT).
 * A delete waits for the saves before it, so a record deleted right after it was added is not left behind.
 */
export class RecordSync<T extends Versioned> {
  private readonly versions = new Map<string, string>();
  private readonly waiting = new Set<string>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly options: RecordSyncOptions<T>) {}

  /** The records just loaded are the stored versions. */
  loaded(records: T[]): void {
    this.versions.clear();
    for (const r of records) this.versions.set(r.id, r.updatedAt);
  }

  /** Saves the record as `current` has it then (a new one, if it has never been saved). */
  save(id: string): void {
    if (this.waiting.has(id)) return; // the queued save will send the latest copy
    this.waiting.add(id);
    this.enqueue(id, () => this.send(id));
  }

  /** Deletes the record, after the saves already queued for it. */
  delete(id: string): void {
    this.waiting.delete(id);
    this.enqueue(id, async () => {
      if (!this.versions.has(id)) return; // never stored
      await this.options.sendDelete(id);
      this.versions.delete(id);
    });
  }

  /** Resolves once everything queued so far has been sent (for tests and sign-out). */
  async settled(): Promise<void> {
    while (this.queues.size) await Promise.all(this.queues.values());
  }

  private async send(id: string): Promise<void> {
    if (!this.waiting.delete(id)) return;
    const record = this.options.current(id);
    if (!record) return;
    const saved = await this.options.send(record, this.versions.get(id) ?? null);
    this.versions.set(id, saved.updatedAt);
    if (!this.waiting.has(id) && this.options.current(id)) this.options.saved(saved);
  }

  private enqueue(id: string, task: () => Promise<void>): void {
    const next = (this.queues.get(id) ?? Promise.resolve()).then(task).catch((error) => {
      this.waiting.delete(id);
      this.options.failed(error);
    });
    this.queues.set(id, next);
    void next.then(() => {
      if (this.queues.get(id) === next) this.queues.delete(id);
    });
  }
}
