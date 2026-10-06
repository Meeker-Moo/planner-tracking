export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** PBKDF2 rounds for new password hashes (wrangler.jsonc `vars`). */
  PASSWORD_ITERATIONS?: string;
}

/** Workers' WebCrypto refuses more than 100000 PBKDF2 rounds. */
const MAX_ITERATIONS = 100_000;

export function passwordIterations(env: Env): number {
  const value = Number(env.PASSWORD_ITERATIONS);
  return Number.isInteger(value) && value >= 10_000 ? Math.min(value, MAX_ITERATIONS) : MAX_ITERATIONS;
}
