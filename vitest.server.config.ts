import { defineConfig } from 'vitest/config';

// The Worker's pure rules (server/*.spec.ts); `ng test` runs the app's specs.
export default defineConfig({
  test: {
    include: ['server/**/*.spec.ts'],
    environment: 'node',
  },
});
