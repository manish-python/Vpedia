/* ========================================================================
   Client-side screenshot check.

   This is a convenience, not a gate. The server is the only authority:
   `validate_image_upload` in `apps/core/models.py` ignores the client-supplied
   Content-Type entirely and decodes the real bytes with Pillow, rejecting
   truncated and corrupt payloads too.

   So this module exists purely so the submit button can be honest about why it
   is disabled *before* a round trip, and so the student sees the problem next to
   the file input. A file that passes here can still be refused by the server,
   and that answer is shown as-is.
   =================================================================== */

/** Mirrors `ALLOWED_IMAGE_FORMATS` in `apps/core/models.py`. */
export const SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

/** Mirrors `MAX_UPLOAD_SIZE_MB`, whose default is 5. */
export const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024

const EXTENSIONS = /\.(png|jpe?g|webp)$/i

/**
 * Why this file cannot be uploaded, or `null` when it looks acceptable.
 *
 * Type and extension are both checked because browsers report inconsistent MIME
 * types across platforms — a `.jpg` is sometimes `image/jpg`, which is not a
 * type any real server accepts.
 */
export function screenshotProblem(file: File | null): string | null {
  if (!file) return null

  const type = (file.type || '').toLowerCase()
  const typeLooksRight =
    (SCREENSHOT_TYPES as readonly string[]).includes(type) || type === 'image/jpg'
  const nameLooksRight = EXTENSIONS.test(file.name)

  if (!typeLooksRight && !nameLooksRight) {
    return 'That file is not a JPG, PNG or WebP image.'
  }
  if (file.size > SCREENSHOT_MAX_BYTES) {
    return `That image is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The maximum is 5 MB.`
  }
  if (file.size === 0) {
    return 'That file is empty.'
  }
  return null
}

/**
 * True when the submit button should be enabled.
 *
 * Declared as a type predicate so a caller that guards on this also gets
 * `screenshot` narrowed to `File` — there is no way to reach the upload
 * without one.
 */
export function canSubmitProof(
  screenshot: File | null,
  utr: string,
): screenshot is File {
  return (
    screenshot !== null && screenshotProblem(screenshot) === null && utr.trim().length > 0
  )
}
