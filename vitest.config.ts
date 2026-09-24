import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // .tsx is included so React component behaviour can be tested, not just
    // server code. The "no infinite loading state" requirement is a property of
    // the components, so it has to be asserted against real rendering.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Node by default (most suites boot real HTTP servers); component suites
    // opt into jsdom with a `@vitest-environment jsdom` docblock.
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
