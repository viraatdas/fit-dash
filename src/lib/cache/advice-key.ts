/** Shared cache key for the pre-generated exercise-advice blob (written by
 * the warm-cache cron, read by /api/advice). Kept in its own tiny module so
 * both sides can't drift apart. */
export const ADVICE_KEY = 'advice:latest';
