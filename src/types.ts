export type RawBody = string | Buffer | Uint8Array;

export type HeaderValue = string | string[] | number | undefined;
export type HeaderMap = Headers | Record<string, HeaderValue>;

export type WebhookStatus =
  | "received"
  | "processing"
  | "succeeded"
  | "failed"
  | "duplicate"
  | "expired";

export interface VerifyInput {
  rawBody: RawBody;
  headers: HeaderMap;
  now: Date;
}

export interface ParseInput {
  rawBody: RawBody;
  headers: HeaderMap;
}

export interface ProviderMetadata {
  [key: string]: unknown;
}

export interface WebhookProvider<TEvent = unknown> {
  name: string;
  verify(input: VerifyInput): Promise<boolean> | boolean;
  parse(input: ParseInput): Promise<TEvent> | TEvent;
  getEventId(event: TEvent, input: ParseInput): string | undefined;
  getEventType(event: TEvent, input: ParseInput): string | undefined;
  getDefaultIdempotencyKey?(event: TEvent, input: ParseInput): string | undefined;
  getMetadata?(event: TEvent, input: ParseInput): ProviderMetadata | undefined;
}

export type IdempotencyKeyResolver<TEvent = unknown> =
  | string
  | ((event: TEvent) => string | undefined | null);

export interface SafeHookContext {
  provider: string;
  eventId: string;
  eventType: string;
  idempotencyKey: string;
  isDuplicate: boolean;
  startedAt: Date;
  attempt: number;
}

export interface FailureMetadata {
  name: string;
  message: string;
  stack?: string;
  code?: string;
}

export interface StoredWebhook<TEvent = unknown> {
  version: 1;
  key: string;
  provider: string;
  eventId: string;
  eventType: string;
  status: WebhookStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  receivedAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  expiresAt?: string;
  failure?: FailureMetadata;
  providerMetadata?: ProviderMetadata;
  rawBody?: string;
  headers?: Record<string, string>;
  eventPayload?: TEvent;
  history: StoredWebhookHistoryItem[];
}

export interface StoredWebhookHistoryItem {
  status: WebhookStatus;
  at: string;
  note?: string;
}

export interface ClaimInput<TEvent = unknown> {
  key: string;
  ttlMs?: number;
  webhook: StoredWebhook<TEvent>;
}

export type ClaimResult<TEvent = unknown> =
  | { status: "claimed"; stored: StoredWebhook<TEvent> }
  | { status: "duplicate"; stored: StoredWebhook<TEvent> }
  | { status: "in_progress"; stored: StoredWebhook<TEvent> };

export interface CompleteInput {
  key: string;
  completedAt: Date;
}

export interface FailInput {
  key: string;
  failedAt: Date;
  error: FailureMetadata;
}

export interface ReplayClaimInput<TEvent = unknown> {
  key: string;
  ttlMs?: number;
  startedAt: Date;
  stored: StoredWebhook<TEvent>;
}

export interface SafeHookStore<TEvent = unknown> {
  claim(input: ClaimInput<TEvent>): Promise<ClaimResult<TEvent>>;
  complete(input: CompleteInput): Promise<void>;
  fail(input: FailInput): Promise<void>;
  get(key: string): Promise<StoredWebhook<TEvent> | null>;
  beginReplay?(input: ReplayClaimInput<TEvent>): Promise<ClaimResult<TEvent>>;
  listFailures?(): Promise<StoredWebhook<TEvent>[]>;
}

export interface SafeHookHooks<TEvent = unknown> {
  onReceived?(payload: HookPayload<TEvent>): Promise<void> | void;
  onClaimed?(payload: HookPayload<TEvent>): Promise<void> | void;
  onDuplicate?(payload: HookPayload<TEvent>): Promise<void> | void;
  onProcessing?(payload: HookPayload<TEvent>): Promise<void> | void;
  onSucceeded?(payload: HookPayload<TEvent>): Promise<void> | void;
  onFailed?(payload: HookPayload<TEvent>): Promise<void> | void;
}

export interface HookPayload<TEvent = unknown> {
  event?: TEvent;
  stored?: StoredWebhook<TEvent>;
  context?: SafeHookContext;
  result?: SafeHookProcessResult<TEvent> | SafeHookReplayResult<TEvent>;
  error?: FailureMetadata;
  at: Date;
}

export interface SafeHookProcessInput<TEvent = unknown> {
  rawBody: RawBody;
  headers: HeaderMap;
  provider: WebhookProvider<TEvent>;
  store?: SafeHookStore<TEvent>;
  idempotencyKey?: IdempotencyKeyResolver<TEvent>;
  storeRawBody?: boolean;
  storeHeaders?: boolean;
  storeEventPayload?: boolean;
  ttlMs?: number;
  hooks?: SafeHookHooks<TEvent>;
  onEvent(event: TEvent, ctx: SafeHookContext): Promise<void> | void;
}

export type SafeHookProcessResult<TEvent = unknown> =
  | {
      status: "succeeded";
      event: TEvent;
      stored: StoredWebhook<TEvent>;
      context: SafeHookContext;
      durationMs: number;
    }
  | {
      status: "duplicate" | "in_progress";
      event: TEvent;
      stored: StoredWebhook<TEvent>;
      context: SafeHookContext;
      durationMs: number;
    }
  | {
      status: "failed";
      event: TEvent;
      stored: StoredWebhook<TEvent>;
      context: SafeHookContext;
      error: FailureMetadata;
      durationMs: number;
    };

export interface SafeHookOptions<TEvent = unknown> {
  store: SafeHookStore<TEvent>;
  storeRawBody?: boolean;
  storeHeaders?: boolean;
  storeEventPayload?: boolean;
  hooks?: SafeHookHooks<TEvent>;
  ttlMs?: number;
}

export interface SafeHookReplayInput<TEvent = unknown> {
  key: string;
  store?: SafeHookStore<TEvent>;
  hooks?: SafeHookHooks<TEvent>;
  allowSucceeded?: boolean;
  ttlMs?: number;
  onEvent(event: TEvent, ctx: SafeHookContext): Promise<void> | void;
}

export type SafeHookReplayResult<TEvent = unknown> =
  | {
      status: "succeeded";
      event: TEvent;
      stored: StoredWebhook<TEvent>;
      context: SafeHookContext;
      durationMs: number;
    }
  | {
      status: "duplicate" | "in_progress";
      stored: StoredWebhook<TEvent>;
      durationMs: number;
    }
  | {
      status: "failed";
      event: TEvent;
      stored: StoredWebhook<TEvent>;
      context: SafeHookContext;
      error: FailureMetadata;
      durationMs: number;
    };

export interface SafeHook<TEvent = unknown> {
  process(input: SafeHookProcessInput<TEvent>): Promise<SafeHookProcessResult<TEvent>>;
  replay(input: SafeHookReplayInput<TEvent>): Promise<SafeHookReplayResult<TEvent>>;
}
