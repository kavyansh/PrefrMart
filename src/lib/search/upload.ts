/**
 * Upload validation for image search.
 *
 * This part is real, and matters regardless of what the search behind it does. An endpoint that
 * accepts arbitrary bytes because "it is only a demo" is exactly how a demo becomes a liability.
 *
 * Three checks, in order of how much they can be trusted:
 *
 *  1. Size — bounded before anything is read into memory.
 *  2. Declared MIME type — a hint from the client, and nothing more.
 *  3. Magic bytes — the actual file signature. This is the only one that cannot be lied about by
 *     renaming a file or setting a header, so it is the one that decides.
 */

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4MB

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

export type ImageKind = 'jpeg' | 'png' | 'webp' | 'avif';

export type UploadCheck = { ok: true; kind: ImageKind } | { ok: false; reason: string };

/** File signatures. Checked against the leading bytes of the actual upload. */
function detectImageKind(bytes: Uint8Array): ImageKind | null {
  // JPEG: FF D8 FF
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length > 8 && pngSignature.every((byte, index) => bytes[index] === byte)) {
    return 'png';
  }

  // WebP and AVIF are both container formats: RIFF....WEBP and ....ftypavif respectively.
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...Array.from(bytes.slice(start, start + length)));

  if (bytes.length > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'webp';
  if (bytes.length > 12 && ascii(4, 4) === 'ftyp' && ascii(8, 4).startsWith('avif')) return 'avif';

  return null;
}

export function checkUpload({
  bytes,
  declaredType,
}: {
  bytes: Uint8Array;
  declaredType: string | null;
}): UploadCheck {
  if (bytes.length === 0) return { ok: false, reason: 'That file is empty.' };

  if (bytes.length > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: 'Images must be under 4MB.' };
  }

  // The declared type is a hint; reject an obviously wrong one early for a clearer message.
  if (declaredType !== null && !ALLOWED_MIME_TYPES.includes(declaredType as never)) {
    return { ok: false, reason: 'Use a JPEG, PNG, WebP or AVIF image.' };
  }

  const kind = detectImageKind(bytes);
  if (kind === null) {
    // Reached when the extension or header claims an image and the bytes disagree.
    return { ok: false, reason: 'That does not look like an image file.' };
  }

  return { ok: true, kind };
}
