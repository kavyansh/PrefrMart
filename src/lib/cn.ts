/**
 * Minimal class-name joiner.
 *
 * Deliberately not `clsx` + `tailwind-merge`: those add ~6KB gzipped to the client
 * bundle, and the components here are written so later classes simply win, which is
 * all we need.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  let result = '';
  for (const value of values) {
    if (!value) continue;
    result = result ? `${result} ${value}` : value;
  }
  return result;
}
