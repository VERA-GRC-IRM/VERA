import { defineConfig, devices } from "@playwright/test";

const projects = [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
  {
    name: "tablet-chromium",
    use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true }
  }
];

if (process.env.PLAYWRIGHT_BRANDED_BROWSERS === "1") {
  projects.push(
    { name: "Google Chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "Microsoft Edge", use: { ...devices["Desktop Edge"], channel: "msedge" } }
  );
}

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "offline-shell.spec.js", // production build and service worker use playwright.offline.config.js
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 2,
  globalTimeout: process.env.CI ? 15 * 60 * 1000 : 10 * 60 * 1000,
  reporter: process.env.CI
    ? [["github"], ["html", { outputFolder: "playwright-report", open: "never" }], ["json", { outputFile: "playwright-report/results.json" }]]
    : "list",
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects,
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    env: { VITE_VERA_DIRECT_REGISTRATION_ENABLED: "true" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
