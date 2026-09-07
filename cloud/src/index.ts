import { verifyToken } from "@clerk/backend";
import { z } from "zod";
import { publicConfigSchema, sessionSchema } from "../shared/contracts.ts";

const configurationSchema = z
  .object({
    CLERK_PUBLISHABLE_KEY: publicConfigSchema.unwrap().shape.publishableKey,
    CLERK_JWT_KEY: z.string().startsWith("-----BEGIN PUBLIC KEY-----"),
    APP_ORIGIN: z.url().refine((value) => {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && url.origin === value;
    }),
  })
  .readonly();

const claimsSchema = z
  .object({
    sub: z.string().startsWith("user_"),
    sid: z.string().startsWith("sess_"),
    sts: z.enum(["active", "pending"]).optional(),
    o: z
      .object({ id: z.string().startsWith("org_") })
      .readonly()
      .optional(),
  })
  .readonly();

function json(
  body: unknown,
  status = 200,
  headers?: Readonly<Record<string, string>>,
): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function unauthenticated(): Response {
  return json(
    { error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } },
    401,
  );
}

export default {
  async fetch(request: Request, bindings: unknown): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path !== "/api/config" && path !== "/api/session") {
      return json({ error: { code: "NOT_FOUND", message: "Not found." } }, 404);
    }
    if (request.method !== "GET") {
      return json(
        {
          error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." },
        },
        405,
        { Allow: "GET" },
      );
    }

    const configuration = configurationSchema.safeParse(bindings);
    if (path === "/api/config") {
      if (!configuration.success) {
        return json(
          {
            error: {
              code: "AUTH_UNAVAILABLE",
              message: "Sign-in is temporarily unavailable.",
            },
          },
          503,
        );
      }
      return json({ publishableKey: configuration.data.CLERK_PUBLISHABLE_KEY });
    }
    const token = request.headers
      .get("Authorization")
      ?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (token === undefined) {
      return unauthenticated();
    }
    if (!configuration.success) {
      return json(
        {
          error: {
            code: "AUTH_UNAVAILABLE",
            message: "Sign-in is temporarily unavailable.",
          },
        },
        503,
      );
    }

    request.signal.throwIfAborted();
    let verified: unknown;
    try {
      verified = await verifyToken(token, {
        jwtKey: configuration.data.CLERK_JWT_KEY,
        authorizedParties: [configuration.data.APP_ORIGIN],
      });
    } catch {
      return unauthenticated();
    }
    request.signal.throwIfAborted();
    const claims = claimsSchema.safeParse(verified);
    if (!claims.success || claims.data.sts === "pending") {
      return unauthenticated();
    }
    return json(
      sessionSchema.parse({
        userId: claims.data.sub,
        sessionId: claims.data.sid,
        organizationId: claims.data.o?.id ?? null,
      }),
    );
  },
} satisfies ExportedHandler;
