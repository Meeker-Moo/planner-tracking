/** Which build this is. `ng build` (production) uses this file; `ng serve` swaps in environment.development.ts. */
export const environment: { env: 'production' | 'develop' } = {
  env: 'production',
};
