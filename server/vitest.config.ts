import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    env: {
      NODE_ENV: "test",
      MONGODB_URI: "mongodb://127.0.0.1:1/warrior_fitness_unit_tests",
      JWT_SECRET: "synthetic-unit-test-signing-key-never-use-outside-tests",
      CLIENT_URL: "http://frontend.example.test",
      PORT: "5001",
    },
  },
});
