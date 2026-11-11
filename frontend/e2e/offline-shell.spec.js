import { test, expect } from "@playwright/test";

test("the installed shell opens without network and never serves private API responses from cache", async ({ page, context }) => {
  await page.goto("/acerca");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  await context.setOffline(true);
  await page.goto("/soluciones");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Sin conexión" })).toBeVisible();
  const apiStatus = await page.evaluate(() => fetch("/api/dashboard")
    .then((response) => response.status).catch(() => 0));
  expect(apiStatus).toBe(0);
});
