/**
 * Tiny class-name joiner. Avoids pulling in `clsx` for one function.
 * Falsy values are dropped so callers can use conditional expressions inline.
 */
export type ClassValue = string | number | false | null | undefined

export function cn(...values: ClassValue[]): string {
  let out = ''
  for (const value of values) {
    if (!value) continue
    out = out ? `${out} ${value}` : String(value)
  }
  return out
}
