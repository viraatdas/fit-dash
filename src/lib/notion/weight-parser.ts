/**
 * Parses weight from various formats:
 * - "100" → 100 lbs
 * - "40 + 40" → 80 lbs (per-side notation)
 * - "40+40" → 80 lbs
 * - "2x40" → 80 lbs
 * - "bodyweight" → 0 (or could be handled specially)
 */
export function parseWeight(weightStr: string): number {
  const cleaned = weightStr.toLowerCase().trim();

  // Handle bodyweight or no weight
  if (cleaned === 'bodyweight' || cleaned === 'bw' || cleaned === '') {
    return 0;
  }

  // Handle "X + X" format (per-side notation)
  const plusMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)$/);
  if (plusMatch) {
    return parseFloat(plusMatch[1]) + parseFloat(plusMatch[2]);
  }

  // Handle "2xX" or "2 x X" format
  const multiplierMatch = cleaned.match(/^(\d+)\s*x\s*(\d+(?:\.\d+)?)$/);
  if (multiplierMatch) {
    return parseInt(multiplierMatch[1]) * parseFloat(multiplierMatch[2]);
  }

  // Simple number
  const simpleMatch = cleaned.match(/^(\d+(?:\.\d+)?)$/);
  if (simpleMatch) {
    return parseFloat(simpleMatch[1]);
  }

  // Try to extract any number
  const anyNumber = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (anyNumber) {
    return parseFloat(anyNumber[1]);
  }

  return 0;
}

/**
 * Parses reps from various formats:
 * - "10" → 10
 * - "8-10" → 9 (takes average)
 * - "AMRAP" → 0 (could be handled specially)
 */
export function parseReps(repsStr: string): number {
  const cleaned = repsStr.toLowerCase().trim();

  // Handle AMRAP or failure
  if (cleaned === 'amrap' || cleaned === 'failure' || cleaned === 'f') {
    return 0;
  }

  // Handle range "8-10" → take higher number
  const rangeMatch = cleaned.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    return parseInt(rangeMatch[2]);
  }

  // Simple number
  const simpleMatch = cleaned.match(/^(\d+)$/);
  if (simpleMatch) {
    return parseInt(simpleMatch[1]);
  }

  return 0;
}
