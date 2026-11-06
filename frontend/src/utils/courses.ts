/**
 * Course level from the first digit of the course number, the same rule as the backend:
 * "CS 6301" → 6000, "CS 8V02" → 8000. Null when the code has no number.
 */
export function courseLevel(code: string): number | null {
  const digit = code.match(/\s(\d)/)?.[1]
  return digit ? Number(digit) * 1000 : null
}

/** Graduate courses are 5000-level and up. */
export const isGraduateCode = (code: string) => (courseLevel(code) ?? 0) >= 5000
