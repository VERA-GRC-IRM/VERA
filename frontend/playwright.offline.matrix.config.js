import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.offline.config.js";

export default defineConfig(base, {
  workers: 2,
  timeout: 60000,
  retries: 0,
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "desktop-firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "tablet-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true } },
    { name: "google-chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "microsoft-edge", use: { ...devices["Desktop Edge"], channel: "msedge" } }
  ]
});
