export declare class RecordingAnalysisQueue {
  constructor(options?: { pollIntervalMs?: number });
  run<T>(key: string, isBlocked: () => boolean, task: () => T | Promise<T>): Promise<T>;
}
