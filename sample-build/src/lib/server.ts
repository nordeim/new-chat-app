import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { isSameOriginRequest } from "@/lib/origin";
import { abortErrorLog, streamAbortKind } from "@/lib/stream-abort";

const cookieName = "kimi_session";
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
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    token = randomBytes(32).toString("hex");
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
      { status: error.status },
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
    { status: 500 },
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
