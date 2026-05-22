import { createHmac, timingSafeEqual } from "node:crypto";
import type { WebhookProvider } from "../types.js";
import { getHeader, rawBodyToString } from "../utils.js";
import { parseJsonBody } from "./json.js";

export interface GitHubUser {
  id?: number;
  login?: string;
  type?: string;
  [key: string]: unknown;
}

export interface GitHubRepository {
  id?: number;
  name?: string;
  full_name?: string;
  private?: boolean;
  default_branch?: string;
  [key: string]: unknown;
}

export interface GitHubInstallation {
  id?: number;
  [key: string]: unknown;
}

export interface GitHubOrganization {
  id?: number;
  login?: string;
  [key: string]: unknown;
}

export interface GitHubIssue {
  id?: number;
  number?: number;
  title?: string;
  state?: string;
  [key: string]: unknown;
}

export interface GitHubPullRequest {
  id?: number;
  number?: number;
  state?: string;
  merged?: boolean;
  [key: string]: unknown;
}

export interface GitHubCommit {
  id?: string;
  message?: string;
  timestamp?: string;
  url?: string;
  [key: string]: unknown;
}

export interface GitHubEvent {
  action?: string;
  sender?: GitHubUser;
  repository?: GitHubRepository;
  installation?: GitHubInstallation;
  organization?: GitHubOrganization;
  [key: string]: unknown;
}

export interface GitHubIssuesEvent extends GitHubEvent {
  action?: string;
  issue: GitHubIssue;
}

export interface GitHubPullRequestEvent extends GitHubEvent {
  action?: string;
  number?: number;
  pull_request: GitHubPullRequest;
}

export interface GitHubPushEvent extends GitHubEvent {
  ref?: string;
  before?: string;
  after?: string;
  created?: boolean;
  deleted?: boolean;
  forced?: boolean;
  base_ref?: string | null;
  compare?: string;
  head_commit?: GitHubCommit | null;
  commits?: GitHubCommit[];
}

export interface GitHubProviderOptions {
  secret: string;
}

export function github<TEvent extends GitHubEvent = GitHubEvent>(
  options: GitHubProviderOptions,
): WebhookProvider<TEvent> {
  return {
    name: "github",
    verify(input) {
      const signature = getHeader(input.headers, "x-hub-signature-256");
      if (!signature?.startsWith("sha256=")) return false;
      const expected =
        "sha256=" + createHmac("sha256", options.secret).update(rawBodyToString(input.rawBody)).digest("hex");
      return safeEqual(signature, expected);
    },
    parse(input) {
      return parseJsonBody(input.rawBody) as TEvent;
    },
    getEventId(_event, input) {
      return getHeader(input.headers, "x-github-delivery");
    },
    getEventType(_event, input) {
      return getHeader(input.headers, "x-github-event") ?? "unknown";
    },
    getDefaultIdempotencyKey(_event, input) {
      return getHeader(input.headers, "x-github-delivery");
    },
    getMetadata(_event, input) {
      return {
        delivery: getHeader(input.headers, "x-github-delivery"),
        event: getHeader(input.headers, "x-github-event"),
      };
    },
  };
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
