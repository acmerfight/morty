# Development Guide

## Local Development

Use Node.js 24.20.0 (`.nvmrc`) and pnpm 11.25.0 (`packageManager`). Run commands
from the repository root:

```bash
pnpm install
pnpm dev
pnpm check
```

`pnpm dev` serves the React app at `http://localhost:5173` and runs its API in
Cloudflare's local Workers runtime. `pnpm check` generates Worker types, checks
TypeScript, builds the app and Worker, runs Biome and the English-only file
check, runs Vitest coverage, and checks unused code and dependencies with Knip.

### Clerk configuration

Copy `.dev.vars.example` to `.dev.vars`. Set `CLERK_PUBLISHABLE_KEY` to the
Clerk publishable key and `CLERK_JWT_KEY` to the PEM public key from the same
Clerk instance. Encode PEM line breaks as `\n` inside a quoted value. Set
`APP_ORIGIN` to the exact browser origin, without a trailing slash.

The browser reads only the publishable key from `GET /api/config`. It obtains
a session token from Clerk and sends it as a Bearer token to `GET /api/session`.
The Worker verifies the signature, expiry, and authorized party locally using
Clerk's backend SDK, rejects pending sessions, and returns the user ID, session
ID, and active organization ID (or null). This proves identity; future business
endpoints must separately authorize tenant access.

No Clerk secret key is needed by this runtime. Never prefix a secret key with
`VITE_` or commit it. Missing configuration fails closed with HTTP 503; invalid
or missing session tokens receive HTTP 401. Keep the configured JWT public key
in sync when Clerk rotates signing keys. Local verification does not check
server-side revocation on every request; tokens remain valid until expiry.

For the deployed Worker, set `CLERK_PUBLISHABLE_KEY` and `CLERK_JWT_KEY` with
`pnpm exec wrangler secret put NAME --config wrangler.jsonc` and keep
`APP_ORIGIN` in `wrangler.jsonc` aligned with the deployed URL. These two values
are public credentials but are stored as bindings to keep instance settings
out of the source tree. Use a Clerk production instance for a production launch;
development keys are for development and preview use.

Worker types are generated from `wrangler.jsonc` into the ignored
`worker-configuration.d.ts` file. Run `pnpm typegen` after changing bindings or
the compatibility date. Build output and local Worker state are ignored too.

The root toolchain owns `cloud/` and the root development files. Submodules
(`mobius/` and `apps/*`) remain independent and are not installed, linted,
built, or deployed by this project's CI.

## Cloudflare Deployment

The Worker is named `mobius-cloud`. The app uses Workers compute and static assets and
has no D1, KV, Durable Object, or other database bindings.

For local deployment:

```bash
pnpm exec wrangler login
pnpm exec wrangler whoami
pnpm check
pnpm run deploy
```

GitHub Actions runs checks on pull requests and pushes to `main`. After checks
pass on `main`, the deployment job publishes the Worker using the `production`
environment. The workflow can also be dispatched manually from `main`.
Deployment jobs are serialized and are not canceled once running.

Configure the repository before the first automated deployment:

- Secret `CLOUDFLARE_API_TOKEN`: a token created with the Cloudflare **Edit
  Cloudflare Workers** template, scoped to the deployment account.
- Variable `CLOUDFLARE_ACCOUNT_ID`: the account ID shown by `wrangler whoami`.

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo moxt-ai/mobius-cloud
gh variable set CLOUDFLARE_ACCOUNT_ID --repo moxt-ai/mobius-cloud --body YOUR_ACCOUNT_ID
```

Local Wrangler OAuth credentials are separate from the CI token. Keep credentials
in the system credential store or GitHub secrets, never in tracked files.
Clerk bindings are configured separately from the CI deployment credentials.


## Execution Boundary

Mobius Cloud runs its control plane on Cloudflare Workers. The service performing a side effect is the final trusted enforcement point. Local Agent operations remain authorized by the local Mobius process.

Every operation that can affect the local machine must follow the same pipeline:

```text
untrusted input
  -> schema validation
  -> normalization and target resolution
  -> capability and target authorization
  -> execution
  -> audit event
```

Define external boundary contracts with Zod schemas and derive their TypeScript types with `z.infer` instead of duplicating interfaces. Parse incoming values from `unknown`; type assertions are never validation.

Keep validation and authorization distinct. Schema validation establishes that a request is well formed; authorization establishes that the active session may perform that specific operation. Neither result implies the other.

For values whose meaning can change after resolution, check both forms. Examples include symbolic links, relative paths, redirects, hostnames, executable lookup, and command arguments. Authorization must be repeated at the local execution boundary immediately before the side effect.

## Make Illegal States Unrepresentable

Use an abstract state base class with one concrete class per lifecycle state:

```ts
abstract class SessionState {
  abstract readonly kind: string;
}

class ConnectingSessionState extends SessionState {
  readonly kind = "connecting";
}

class ActiveSessionState extends SessionState {
  readonly kind = "active";
  readonly capabilities: ReadonlySet<Capability>;
  readonly sessionId: string;

  constructor(sessionId: string, capabilities: ReadonlySet<Capability>) {
    super();
    this.sessionId = sessionId;
    this.capabilities = capabilities;
  }
}

class ClosedSessionState extends SessionState {
  readonly kind = "closed";
  readonly reason: CloseReason;

  constructor(reason: CloseReason) {
    super();
    this.reason = reason;
  }
}
```

Do not model the same concept as unrelated optional fields:

```ts
// Invalid combinations are possible: active without a session ID, or closed with capabilities.
interface SessionState {
  readonly active?: boolean;
  readonly sessionId?: string;
  readonly capabilities?: ReadonlySet<Capability>;
  readonly closeReason?: CloseReason;
}
```

State transitions should accept only valid source-state classes and return a complete destination state. Consumers branch with `instanceof` and must reject unknown state classes explicitly.

Use optional properties only when absence is meaningful within the same state. Use `null` only when an explicit empty value is part of the domain. Reserve `Partial<T>` for update payloads, never for lifecycle or protocol states.

## Protocol, Domain, and Port Contracts

Treat protocol messages, domain values, and ports as contracts. Their properties must be `readonly` so consumers cannot mutate shared state behind the owner's back.

Declare callbacks and port operations with function property syntax:

```ts
interface HarnessPort {
  readonly connect: (
    request: ConnectRequest,
    signal: AbortSignal,
  ) => Promise<Session>;
}
```

Do not use method syntax for these contracts. TypeScript intentionally excludes method parameter positions from `strictFunctionTypes`, while function properties receive the stricter variance check.

This rule applies to protocol, domain, and port contracts. It does not require every short-lived local object or mutable implementation detail to be immutable.

## Function Design

Function signatures must express intent precisely. Prefer purpose-specific functions and domain types over boolean mode flags or broad parameter objects. A function must do only what its name promises.

## Cancellation, Timeouts, and Resource Ownership

Every asynchronous operation that waits on an external system accepts an `AbortSignal`. A finite operation applies an explicit timeout appropriate to its boundary; a long-lived stream applies connection and liveness deadlines so no individual wait is unbounded. Callers propagate the same cancellation intent through runtime and adapter layers instead of creating disconnected cancellation trees.

Cancellation is a distinct outcome. Do not convert it into a generic network or runtime failure, and do not retry it. A retry policy must be bounded, cancellable, and restricted to failures and operations that are safe to repeat. Never retry an operation after its side effects are known to have occurred or when the outcome is indeterminate unless the operation has an explicit idempotency contract.

The code that acquires a resource owns its release unless ownership is explicitly transferred in the type contract. Connections, streams, subprocesses, locks, timers, subscriptions, and concurrency slots must be released on success, failure, and cancellation. Prefer `try`/`finally` or a scoped helper that makes cleanup structurally unavoidable.

## Typed Error Contracts

Errors crossing subsystem, port, or protocol boundaries require a stable machine-readable code and a safe human-readable message. Model outcomes that require different handling separately, including cancellation, timeout, retryable failure, and terminal failure.

Consumers must branch on the error type or code, never by matching message text. Human-readable messages may change without breaking behavior.

Do not catch, ignore, or replace a failure unless the current boundary can fully handle it. Otherwise, propagate it or translate it once into the owning boundary's error contract, preserving the original failure as the cause.

Do not expose secrets, credentials, raw remote payloads, or unnecessary local paths in protocol error messages. Unexpected exceptions must be normalized at the boundary where they leave the process or subsystem.

## Abstraction Discipline

Start with the simplest direct implementation of the current behavior. Keep control flow local and linear when that makes the operation easier to read.

Introduce an abstraction only when at least one of these conditions is true:

- It isolates a real external boundary, such as a transport, harness, clock, or persistent store.
- A second real use case requires interchangeable behavior.
- Current duplication has been demonstrated and the abstraction makes the code simpler.

Do not create layers, factories, generic frameworks, configuration switches, or extension points for hypothetical future requirements. Remove unused indirection. Extract details when they obscure the caller's main control flow, but keep them inline when they are the function's primary job.

## Defensive Code

After the local execution boundary has converted untrusted input into a trusted domain type, rely on that type and its established contract instead of repeating checks or adding fallbacks for states the contract excludes. Apply the boundary pipeline again when new untrusted data enters or resolution changes a value's security meaning.

Add defensive branches, compatibility paths, or fallback behavior only for a documented external failure mode, security requirement, or observed production risk. An invariant violation must fail visibly instead of being converted into an empty value, default result, or alternate behavior.

## Comments

Code should be self-explanatory through names, types, and structure. Implementation comments explain constraints, tradeoffs, compatibility requirements, or why an apparently simpler approach is unsafe; they do not merely restate what the code does. Public contract documentation describes purpose, supported usage, and observable behavior.
