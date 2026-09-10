/** Shared between client and server; matches NVIDIA NIM vision model support (GIF, JPG, JPEG, PNG). */
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif"] as const;
export const MAX_UPLOAD_SIZE_BYTES = 4 * 1024 * 1024; // 4MB
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export function isAllowedImageType(mimeType: string): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mimeType);
}
