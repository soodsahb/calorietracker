export interface Env {
  GEMINI_API_KEY: string;
  TOKEN_HMAC_SECRET: string;
  KILL_SWITCH?: string;
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
