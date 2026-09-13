import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { clientNetworkKey } from "@/lib/client-key";
import { isSameOriginRequest } from "@/lib/origin";
import { abortErrorLog, streamAbortKind } from "@/lib/stream-abort";
import { createRateLimiter } from "@/lib/throttle";

const cookieName = "kimi_session";

// Backlog M3 (app-level portion): minting a session row needs no
// authentication, so cookieless floods can create unbounded rows. Bounding
// NEW-session creation per network blunts that surface; requests that
// already carry a valid cookie never touch this limiter. The key derivation
// (src/lib/client-key.ts) prefers cf-connecting-ip, then the rightmost
// x-forwarded-for value — both positions the trusted ingress controls — and
// rejects non-IP shapes, so spoofed headers cannot mint fresh buckets or
// retain oversized key strings. Direct connections share a single "direct"
// bucket. Ingress-level limits remain the documented public-service defense
// — this is process-local defense-in-depth.
const sessionMintLimiter = createRateLimiter({ windowMs: 10_000, max: 60 });

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function sessionId() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new ApiError(
      401,
      "Your session expired. Reload the page to start a new session.",
    );
  return createHash("sha256").update(token).digest("hex");
}

export async function ensureSession(req: NextRequest) {
  if (req.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(403, "Cross-site requests are not permitted.");
  let token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    if (
      !sessionMintLimiter.allow(
        clientNetworkKey(
          req.headers.get("cf-connecting-ip"),
          req.headers.get("x-forwarded-for"),
        ),
      )
    )
      throw new ApiError(
        429,
        "Too many new sessions from this network. Wait a moment and reload the page.",
      );
    token = randomBytes(32).toString("hex");
  }
  const owner = createHash("sha256").update(token).digest("hex");
  await db.insert(sessions).values({ id: owner }).onConflictDoNothing();
  return { owner, token };
}

export function setSession(
  response: NextResponse,
  token: string,
  req: NextRequest,
) {
  response.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure:
      req.nextUrl.protocol === "https:" ||
      req.headers.get("x-forwarded-proto") === "https",
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function assertOrigin(req: NextRequest) {
  const headers = req.headers;
  if (
    !isSameOriginRequest(
      headers.get("origin"),
      headers.get("host"),
      headers.get("x-forwarded-host"),
      headers.get("sec-fetch-site"),
    )
  ) {
    throw new ApiError(
      403,
      "This action must be made from your chat workspace.",
    );
  }
}

export async function readJson(
  req: NextRequest,
  maxBytes = 3_000_000,
): Promise<unknown> {
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(415, "Send a JSON request.");
  if (!req.body) throw new ApiError(400, "A request body is required.");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiError(
          413,
          "The attachment is too large. Use an image up to 2 MB.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new ApiError(400, "The request contains invalid JSON.");
  }
}

export function errorResponse(error: unknown, operation: string) {
  if (error instanceof ApiError)
    return NextResponse.json(
      { error: error.message },
      {
        status: error.status,
        // Error bodies must never be cached by intermediaries — same
        // no-store contract as every success path in the app.
        headers: { "Cache-Control": "no-store" },
      },
    );
  const requestId = crypto.randomUUID();
  const errorType = error instanceof Error ? error.name : "UnknownError";
  const abortBy = streamAbortKind(error);
  if (abortBy) {
    // The client went away before the action finished (e.g. a disconnect while
    // an attachment body was still uploading). Expected teardown, not a
    // server failure — warn keeps it separable from genuine errors.
    console.warn(
      abortErrorLog({ operation, requestId, abortBy, errorType }).line,
    );
  } else {
    console.error(
      JSON.stringify({
        operation,
        requestId,
        errorType,
      }),
    );
  }
  return NextResponse.json(
    {
      error: "The workspace could not complete this action. Please try again.",
      requestId,
    },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export async function requireSession() {
  const owner = await sessionId();
  const [session] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.id, owner));
  if (!session)
    throw new ApiError(401, "Your session expired. Reload the page.");
  return owner;
}
