import { test, expect } from "@playwright/test";
import { stubDashboard, useSession } from "./fixtures.js";

test("el enlace global permanece visible sin tapar la búsqueda en escritorio y móvil", async ({ page }) => {
  await useSession(page, "DIRECTOR", 2);
  await stubDashboard(page, "DIRECTOR");
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/dashboard");
    const search = page.getByRole("button", { name: "Buscar secciones, acciones y registros" });
    const share = page.getByRole("button", { name: "Copiar esta vista" });
    await expect(search).toBeVisible();
    await expect(share).toBeVisible();
    const searchBox = await search.boundingBox();
    const shareBox = await share.boundingBox();
    expect(searchBox.x + searchBox.width).toBeLessThan(shareBox.x);
    expect(shareBox.x + shareBox.width).toBeLessThanOrEqual(width);
  }
});
