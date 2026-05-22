import type { SafeHookHooks } from "../types.js";

export interface PrometheusMetricSink {
  increment(name: string, labels?: Record<string, string | number>): void;
  observe(name: string, value: number, labels?: Record<string, string | number>): void;
}

export function prometheusHooks<TEvent = unknown>(sink: PrometheusMetricSink): SafeHookHooks<TEvent> {
  return {
    onReceived() {
      sink.increment("safehook_received_total");
    },
    onDuplicate(payload) {
      sink.increment("safehook_duplicate_total", {
        provider: payload.context?.provider ?? "unknown",
        status: payload.result?.status ?? "duplicate",
      });
    },
    onSucceeded(payload) {
      sink.increment("safehook_succeeded_total", {
        provider: payload.context?.provider ?? "unknown",
      });
      if (payload.result && "durationMs" in payload.result) {
        sink.observe("safehook_processing_duration_ms", payload.result.durationMs, {
          provider: payload.context?.provider ?? "unknown",
        });
      }
    },
    onFailed(payload) {
      sink.increment("safehook_failed_total", {
        provider: payload.context?.provider ?? "unknown",
      });
    },
  };
}
