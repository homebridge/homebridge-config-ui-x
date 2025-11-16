/**
 * Normalize a value for comparison (handles undefined/null/empty string equivalence)
 * @param value - The value to normalize
 * @returns The normalized value (null for empty/undefined values)
 */
export function normalizeValue(value: any): any {
  // Treat undefined, null, and empty string as equivalent
  if (value === undefined || value === null || value === '') {
    return null
  }
  // For strings, trim whitespace
  if (typeof value === 'string') {
    return value.trim() || null
  }
  return value
}

/**
 * Check if two values are equal after normalization
 * @param value1 - First value to compare
 * @param value2 - Second value to compare
 * @returns true if values are equal after normalization, false otherwise
 */
export function valuesAreEqual(value1: any, value2: any): boolean {
  const normalized1 = normalizeValue(value1)
  const normalized2 = normalizeValue(value2)

  // Handle array comparison
  if (Array.isArray(normalized1) && Array.isArray(normalized2)) {
    if (normalized1.length !== normalized2.length) {
      return false
    }
    // Sort both arrays for comparison (order doesn't matter for most settings)
    // Convert to strings to ensure consistent sorting behavior across all types
    const sorted1 = [...normalized1].map(String).sort()
    const sorted2 = [...normalized2].map(String).sort()
    return sorted1.every((val, index) => val === sorted2[index])
  }

  return normalized1 === normalized2
}
