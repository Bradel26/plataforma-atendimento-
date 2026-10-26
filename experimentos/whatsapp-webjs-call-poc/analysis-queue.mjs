export class RecordingAnalysisQueue {
  #tail = Promise.resolve();
  #inFlight = new Map();
  #pollIntervalMs;

  constructor({ pollIntervalMs = 500 } = {}) {
    this.#pollIntervalMs = pollIntervalMs;
  }

  run(key, isBlocked, task) {
    const existing = this.#inFlight.get(key);
    if (existing) return existing;

    const previous = this.#tail;
    let release;
    this.#tail = new Promise((resolve) => { release = resolve; });

    let operation;
    operation = (async () => {
      await previous;
      try {
        while (isBlocked()) await new Promise((resolve) => setTimeout(resolve, this.#pollIntervalMs));
        return await task();
      } finally {
        release();
        if (this.#inFlight.get(key) === operation) this.#inFlight.delete(key);
      }
    })();
    this.#inFlight.set(key, operation);
    return operation;
  }
}
