import { afterEach, beforeEach, expect, test, vi } from "vitest";
import worker from "../cloud/src/index.ts";
import {
  APP_ORIGIN,
  AUTH_TIME,
  IdentityProvider,
} from "./support/identity-provider.ts";

const issuer = new IdentityProvider();
const configuration = {
  CLERK_PUBLISHABLE_KEY: issuer.publishableKey,
  CLERK_JWT_KEY: issuer.publicKey,
  APP_ORIGIN,
  CLERK_SECRET_KEY: "sk_test_do_not_disclose",
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AUTH_TIME);
});

afterEach(() => vi.useRealTimers());

function accountRequest(token: string): Request {
  return new Request(`${APP_ORIGIN}/api/session`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

test("Given a visitor without a session, When they request their account, Then access is denied", async () => {
  const response = await worker.fetch(
    new Request(`${APP_ORIGIN}/api/session`),
    {},
  );
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({
    error: { code: "UNAUTHENTICATED", message: "Sign in to continue." },
  });
});

test("Given configured sign-in, When a visitor loads public configuration, Then only the publishable key is disclosed", async () => {
  const response = await worker.fetch(
    new Request(`${APP_ORIGIN}/api/config`),
    configuration,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    publishableKey: issuer.publishableKey,
  });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

test("Given an active signed session, When the user requests their account, Then their verified identity is returned without being cached", async () => {
  const response = await worker.fetch(
    accountRequest(
      issuer.createSession("user_alice", APP_ORIGIN, "active", "org_team"),
    ),
    configuration,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    userId: "user_alice",
    sessionId: expect.stringMatching(/^sess_/),
    organizationId: "org_team",
  });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

test("Given a user without an active organization, When they request their account, Then their identity does not imply workspace membership", async () => {
  const response = await worker.fetch(
    accountRequest(issuer.createSession("user_personal")),
    configuration,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    userId: "user_personal",
    organizationId: null,
  });
});

test("Given a token signed by an untrusted issuer, When it is used to request an account, Then access is denied", async () => {
  const otherIssuer = new IdentityProvider();
  const response = await worker.fetch(
    accountRequest(otherIssuer.createSession("user_forged")),
    configuration,
  );
  expect(response.status).toBe(401);
});

test("Given a session issued for another origin, When it is used to request an account, Then access is denied", async () => {
  const response = await worker.fetch(
    accountRequest(
      issuer.createSession("user_alice", "https://untrusted.example"),
    ),
    configuration,
  );
  expect(response.status).toBe(401);
});

test("Given an expired session, When the user requests their account, Then access is denied", async () => {
  const token = issuer.createSession("user_alice");
  vi.setSystemTime(new Date("2026-09-07T00:02:00.000Z"));
  const response = await worker.fetch(accountRequest(token), configuration);
  expect(response.status).toBe(401);
});

test("Given a session awaiting completion, When the user requests their account, Then access is denied", async () => {
  const response = await worker.fetch(
    accountRequest(issuer.createSession("user_alice", APP_ORIGIN, "pending")),
    configuration,
  );
  expect(response.status).toBe(401);
});

test("Given missing sign-in configuration, When a visitor opens sign-in, Then a safe availability error is returned", async () => {
  const response = await worker.fetch(
    new Request(`${APP_ORIGIN}/api/config`),
    {},
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: {
      code: "AUTH_UNAVAILABLE",
      message: "Sign-in is temporarily unavailable.",
    },
  });
});

test("Given an unknown API route, When a visitor requests it, Then a JSON not-found response is returned", async () => {
  const response = await worker.fetch(
    new Request(`${APP_ORIGIN}/api/unknown`),
    configuration,
  );
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});
