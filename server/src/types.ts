export interface Env {
  GEMINI_API_KEY: string;
  TOKEN_HMAC_SECRET: string;
  KILL_SWITCH?: string;
  /** Max analyses per UTC day across all clients; unset/0 disables. Exceeding it returns 503. */
  GLOBAL_DAILY_CAP?: string;
  RATE_LIMITER?: DurableObjectNamespace;
  RATE_LIMIT_KV?: KVNamespace;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface LogEntry {
  requestId: string;
  route: string;
  status: number;
  latencyMs: number;
  tokenPrefix?: string;
  imageBytes?: number;
  itemCount?: number;
}

export interface Logger {
  log(entry: LogEntry): void;
}

export type Vars = {
  requestId: string;
  tokenPrefix?: string;
  tokenId?: string;
  imageBytes?: number;
  itemCount?: number;
};
