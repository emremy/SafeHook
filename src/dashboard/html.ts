import type { StoredWebhook } from "../types.js";

export interface DashboardHtmlOptions<TEvent = unknown> {
  title?: string;
  records: StoredWebhook<TEvent>[];
}

export function createDashboardHtml<TEvent = unknown>(options: DashboardHtmlOptions<TEvent>): string {
  const title = escapeHtml(options.title ?? "SafeHook Events");
  const rows = options.records
    .map((record) => {
      const failure = record.failure ? escapeHtml(record.failure.message) : "";
      return `<tr>
  <td>${escapeHtml(record.key)}</td>
  <td>${escapeHtml(record.provider)}</td>
  <td>${escapeHtml(record.eventType)}</td>
  <td><span data-status="${escapeHtml(record.status)}">${escapeHtml(record.status)}</span></td>
  <td>${record.attempts}</td>
  <td>${escapeHtml(record.updatedAt)}</td>
  <td>${failure}</td>
</tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; color: #1f2937; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #e5e7eb; padding: .625rem; text-align: left; font-size: .875rem; }
    th { color: #374151; background: #f9fafb; }
    [data-status="failed"] { color: #b91c1c; font-weight: 700; }
    [data-status="succeeded"] { color: #047857; font-weight: 700; }
    [data-status="processing"] { color: #92400e; font-weight: 700; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <table>
    <thead>
      <tr>
        <th>Key</th>
        <th>Provider</th>
        <th>Type</th>
        <th>Status</th>
        <th>Attempts</th>
        <th>Updated</th>
        <th>Failure</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
