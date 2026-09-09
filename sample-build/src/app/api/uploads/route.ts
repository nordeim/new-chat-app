import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  isAllowedImageType,
} from "@/lib/uploads-config";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
};

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(`upload:${getClientKey(request)}`, 30, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many uploads. Please slow down." }, { status: 429 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field." }, { status: 400 });
  }

  if (!isAllowedImageType(file.type)) {
    return NextResponse.json(
      { error: `Unsupported image type. Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return NextResponse.json(
      { error: `Image too large. Max size is ${Math.floor(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))}MB.` },
      { status: 400 },
    );
  }

  const extension = EXTENSION_BY_MIME[file.type];
  const filename = `${crypto.randomUUID()}.${extension}`;
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadsDir, filename), buffer);

  return NextResponse.json({
    url: `/uploads/${filename}`,
    name: file.name.slice(0, 200),
    mimeType: file.type,
    size: file.size,
  });
}
