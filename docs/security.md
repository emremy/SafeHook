# SafeHook Security Guide

## Raw Body Requirement

Provider signatures must be verified against the exact raw request body. Do not verify a re-serialized JSON object.

SafeHook expects the application/framework adapter to pass that exact raw body through. SafeHook does not rewrite or normalize the body before verification.

Built-in stores do not persist `rawBody` or normalized `headers` unless the application explicitly enables those options.

## Timestamp Tolerance

Providers that sign timestamps should reject old deliveries. Stripe defaults to a 300 second tolerance.

## Replay Attack Prevention

Signature verification prevents forged requests. Idempotency and atomic claims prevent valid retries from executing business logic more than once.

## Secret Handling

Load provider secrets from environment or a secret manager. Do not persist secrets in SafeHook store records.

## Duplicate Pitfalls

Use stable provider event IDs where possible. If a business object ID is used as the idempotency key, multiple legitimate event types for that object may collapse into one record.
