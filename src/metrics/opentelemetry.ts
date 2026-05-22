import type { SafeHookHooks } from "../types.js";

export interface OpenTelemetryMetricSink {
  add(name: string, value: number, attributes?: Record<string, string | number | boolean>): void;
  record(name: string, value: number, attributes?: Record<string, string | number | boolean>): void;
}

export function openTelemetryHooks<TEvent = unknown>(
  sink: OpenTelemetryMetricSink,
): SafeHookHooks<TEvent> {
  return {
    onReceived() {
      sink.add("safehook.received", 1);
    },
    onDuplicate(payload) {
      sink.add("safehook.duplicate", 1, {
        provider: payload.context?.provider ?? "unknown",
        status: payload.result?.status ?? "duplicate",
      });
    },
    onSucceeded(payload) {
      sink.add("safehook.succeeded", 1, {
        provider: payload.context?.provider ?? "unknown",
      });
      if (payload.result && "durationMs" in payload.result) {
        sink.record("safehook.processing.duration", payload.result.durationMs, {
          provider: payload.context?.provider ?? "unknown",
        });
      }
    },
    onFailed(payload) {
      sink.add("safehook.failed", 1, {
        provider: payload.context?.provider ?? "unknown",
      });
    },
  };
}
