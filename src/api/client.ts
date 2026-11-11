import { Analysis, NOTE_MAX, type AnalysisT, type ItemT } from '@shared/schema';

export type ApiErrorCode =
  | 'config'
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'rate_limited'
  | 'unauthorized'
  | 'payload_too_large'
  | 'unsupported_media'
  | 'bad_request'
  | 'service_unavailable'
  | 'server'
  | 'invalid_response';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly retryAfterSeconds?: number;
  constructor(code: ApiErrorCode, message: string, extra: { status?: number; retryAfterSeconds?: number } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = extra.status;
    this.retryAfterSeconds = extra.retryAfterSeconds;
  }
  /** Worth offering "try again" / saving as a draft. */
  get retryable(): boolean {
    return ['network', 'timeout', 'server', 'service_unavailable', 'rate_limited'].includes(this.code);
  }
}

export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

export interface ApiClientOptions {
  baseUrl: string | undefined;
  tokenStore: TokenStore;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** extra attempts for network errors and 502/504 */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface AnalyzeInput {
  imageUri: string;
  note?: string;
  previousItems?: ItemT[];
  signal?: AbortSignal;
}

export const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_SLEEP = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const MESSAGES: Record<ApiErrorCode, string> = {
  config: 'The app is not configured with a server address.',
  network: 'No connection. Check your internet and try again.',
  timeout: 'The analysis took too long. Please try again.',
  cancelled: 'Cancelled.',
  rate_limited: 'Too many requests. Please wait a bit and try again.',
  unauthorized: 'Could not authenticate this install. Please try again.',
  payload_too_large: 'The photo is too large to analyze.',
  unsupported_media: 'That image format is not supported.',
  bad_request: 'The request was not accepted. Please try a different photo or note.',
  service_unavailable: 'Analysis is temporarily unavailable. Please try later.',
  server: 'Something went wrong on our side. Please try again.',
  invalid_response: 'We got an unexpected answer. Please try again.',
};
export const errorMessage = (code: ApiErrorCode): string => MESSAGES[code];

function mapStatus(status: number, res: Response): ApiError {
  if (status === 429) {
    const ra = Number(res.headers.get('Retry-After'));
    return new ApiError('rate_limited', MESSAGES.rate_limited, {
      status,
      retryAfterSeconds: Number.isFinite(ra) && ra > 0 ? ra : undefined,
    });
  }
  if (status === 401 || status === 403) return new ApiError('unauthorized', MESSAGES.unauthorized, { status });
  if (status === 413) return new ApiError('payload_too_large', MESSAGES.payload_too_large, { status });
  if (status === 415) return new ApiError('unsupported_media', MESSAGES.unsupported_media, { status });
  if (status === 503) return new ApiError('service_unavailable', MESSAGES.service_unavailable, { status });
  if (status === 504) return new ApiError('timeout', MESSAGES.timeout, { status });
  if (status >= 400 && status < 500) return new ApiError('bad_request', MESSAGES.bad_request, { status });
  return new ApiError('server', MESSAGES.server, { status });
}

export function buildAnalyzeForm(input: AnalyzeInput): FormData {
  const form = new FormData();
  // React Native's FormData accepts {uri,name,type} file descriptors.
  form.append('image', { uri: input.imageUri, name: 'meal.jpg', type: 'image/jpeg' } as unknown as Blob);
  const note = input.note?.trim();
  if (note) form.append('note', note.slice(0, NOTE_MAX));
  if (input.previousItems?.length) form.append('previousItems', JSON.stringify(input.previousItems));
  return form;
}

export function createApiClient(opts: ApiClientOptions) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = opts.retries ?? 1;
  const sleep = opts.sleep ?? DEFAULT_SLEEP;

  const base = (): string => {
    const b = opts.baseUrl?.trim().replace(/\/+$/, '');
    if (!b) throw new ApiError('config', MESSAGES.config);
    return b;
  };

  async function send(path: string, init: RequestInit, external?: AbortSignal): Promise<Response> {
    const url = `${base()}${path}`;
    if (external?.aborted) throw new ApiError('cancelled', MESSAGES.cancelled);
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, timeoutMs);
    const onAbort = () => ctrl.abort();
    external?.addEventListener('abort', onAbort);
    try {
      return await fetchImpl(url, { ...init, signal: ctrl.signal });
    } catch {
      if (timedOut) throw new ApiError('timeout', MESSAGES.timeout);
      if (external?.aborted) throw new ApiError('cancelled', MESSAGES.cancelled);
      throw new ApiError('network', MESSAGES.network);
    } finally {
      clearTimeout(timer);
      external?.removeEventListener('abort', onAbort);
    }
  }

  async function register(signal?: AbortSignal): Promise<string> {
    const res = await send('/v1/register', { method: 'POST' }, signal);
    if (!res.ok) throw mapStatus(res.status, res);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new ApiError('invalid_response', MESSAGES.invalid_response, { status: res.status });
    }
    const b = body as { token?: unknown; installToken?: unknown };
    const token = typeof b?.token === 'string' ? b.token : typeof b?.installToken === 'string' ? b.installToken : null;
    if (!token) throw new ApiError('invalid_response', MESSAGES.invalid_response, { status: res.status });
    await opts.tokenStore.set(token);
    return token;
  }

  // Single-flight registration: concurrent first requests must not mint several tokens
  // (each burns the per-IP register budget and the last write wins in SecureStore).
  let registering: Promise<string> | null = null;
  function registerOnce(signal?: AbortSignal): Promise<string> {
    registering ??= register(signal).finally(() => {
      registering = null;
    });
    return registering;
  }

  async function ensureToken(signal?: AbortSignal): Promise<string> {
    return (await opts.tokenStore.get()) ?? (await registerOnce(signal));
  }

  async function postAnalyze(token: string, input: AnalyzeInput): Promise<Response> {
    let attempt = 0;
    for (;;) {
      try {
        const res = await send(
          '/v1/analyze',
          { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, body: buildAnalyzeForm(input) },
          input.signal,
        );
        if ((res.status === 500 || res.status === 502) && attempt < retries) {
          attempt++;
          await sleep(500 * 2 ** (attempt - 1));
          continue;
        }
        return res;
      } catch (e) {
        if (e instanceof ApiError && e.code === 'network' && attempt < retries) {
          attempt++;
          await sleep(500 * 2 ** (attempt - 1));
          continue;
        }
        throw e;
      }
    }
  }

  async function analyze(input: AnalyzeInput): Promise<AnalysisT> {
    let token = await ensureToken(input.signal);
    let res = await postAnalyze(token, input);
    if (res.status === 401) {
      // stale/invalid install token: re-register once
      await opts.tokenStore.clear();
      token = await registerOnce(input.signal);
      res = await postAnalyze(token, input);
    }
    if (!res.ok) throw mapStatus(res.status, res);
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new ApiError('invalid_response', MESSAGES.invalid_response, { status: res.status });
    }
    const parsed = Analysis.safeParse(json);
    if (!parsed.success) throw new ApiError('invalid_response', MESSAGES.invalid_response, { status: res.status });
    return parsed.data;
  }

  return { analyze, register };
}

export type ApiClient = ReturnType<typeof createApiClient>;
