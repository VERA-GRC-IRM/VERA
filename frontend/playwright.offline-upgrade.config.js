import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /offline-two-releases\.spec\.js/,
  reporter: "list",
  use: { ...devices["Desktop Chrome"] }
});
