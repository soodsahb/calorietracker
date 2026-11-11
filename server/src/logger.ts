import type { Logger } from './types';

/** Only whitelisted, PII-free fields can be logged (see LogEntry). */
export const consoleLogger: Logger = {
  log(e) {
    console.log(
      JSON.stringify({
        requestId: e.requestId,
        route: e.route,
        status: e.status,
        latencyMs: e.latencyMs,
        tokenPrefix: e.tokenPrefix,
        imageBytes: e.imageBytes,
        itemCount: e.itemCount,
      }),
    );
  },
};
