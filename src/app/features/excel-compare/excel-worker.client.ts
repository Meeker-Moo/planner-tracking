import { Injectable, OnDestroy } from '@angular/core';
import type { ExcelSession, SessionMethod, WorkerRequest, WorkerResponse } from './excel-session';

/** The worker stopped, most likely because the browser ran out of memory; whatever it held is gone. */
export class WorkerCrashedError extends Error {
  constructor() {
    super('ไฟล์ใหญ่เกินกว่าที่เบราว์เซอร์จะประมวลผลได้ ลองบันทึกเฉพาะ Sheet ที่ใช้เป็นไฟล์ใหม่ หรือบันทึกเป็น .csv แล้วนำเข้าอีกครั้ง');
  }
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/**
 * Runs ExcelSession methods in a Web Worker, so reading, comparing and exporting large files never
 * freezes the page. Provide it on the page component: the worker and its memory go with the page.
 */
@Injectable()
export class ExcelWorkerClient implements OnDestroy {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  /** Rejects with `signal.reason` once the signal aborts; the worker still finishes the request, unseen. */
  call<M extends SessionMethod>(method: M, args: Parameters<ExcelSession[M]>, signal?: AbortSignal): Promise<Awaited<ReturnType<ExcelSession[M]>>> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const id = this.nextId++;
      const onAbort = () => {
        this.pending.delete(id);
        reject(signal!.reason);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      const settle =
        <T>(fn: (v: T) => void) =>
        (v: T) => {
          signal?.removeEventListener('abort', onAbort);
          fn(v);
        };
      this.pending.set(id, {
        resolve: settle(resolve as (v: unknown) => void),
        reject: settle(reject),
      });
      const request: WorkerRequest<M> = { id, method, args };
      this.ensureWorker().postMessage(request);
    });
  }

  ngOnDestroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./excel.worker', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      const p = this.pending.get(data.id);
      if (!p) return;
      this.pending.delete(data.id);
      if (data.ok) p.resolve(data.value);
      else p.reject(new Error(data.error));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      this.crash();
    };
    worker.onmessageerror = () => this.crash();
    this.worker = worker;
    return worker;
  }

  /** Every request in flight fails; the next call starts a fresh, empty worker. */
  private crash(): void {
    this.worker?.terminate();
    this.worker = null;
    const pending = [...this.pending.values()];
    this.pending.clear();
    pending.forEach((p) => p.reject(new WorkerCrashedError()));
  }
}
