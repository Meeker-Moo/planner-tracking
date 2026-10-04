/// <reference lib="webworker" />

import { ExcelSession, WorkerRequest, WorkerResponse } from './excel-session';

const session = new ExcelSession();

// One request at a time: a request that waits on reading a file must not let a later one see the old state.
let queue: Promise<void> = Promise.resolve();

addEventListener('message', ({ data }: MessageEvent<WorkerRequest>) => {
  queue = queue.then(async () => {
    let response: WorkerResponse;
    try {
      const method = session[data.method] as (...args: unknown[]) => unknown;
      response = { id: data.id, ok: true, value: await method.apply(session, data.args) };
    } catch (err) {
      response = {
        id: data.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    postMessage(response);
  });
});
