import { expect, test, type Page } from "@playwright/test";

const OWNER = { username: process.env.SEED_OWNER_USERNAME ?? "owner", password: process.env.SEED_OWNER_PASSWORD ?? "Sunrise@2026" };
const MANAGER = {
  username: process.env.SEED_MANAGER_USERNAME ?? "manager",
  password: process.env.SEED_MANAGER_PASSWORD ?? "Site@2026",
};

async function login(page: Page, who: { username: string; password: string }) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Login name" }).fill(who.username);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(who.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("signed-out visitors are sent to the login page", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login\?next=%2Fprojects/);
});

test("wrong password shows a plain message", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Login name" }).fill(OWNER.username);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("definitely-wrong");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Wrong login name or password" })).toBeVisible();
});

test("owner sees the company at a glance, creates a project and plans its work", async ({ page }) => {
  await login(page, OWNER);

  // Dashboard: headline numbers and the attention list from the demo data.
  await expect(page.getByText("Things that need your attention")).toBeVisible();
  await expect(page.getByText(/Client payment of ₹4,50,000\.00 overdue/)).toBeVisible();
  await expect(page.getByText(/Slab \(Structure\) work delayed by 3 days/)).toBeVisible();
  await expect(page.getByText("Labour present", { exact: true }).first()).toBeVisible();

  // Create a project.
  const name = `E2E Duplex ${Date.now()}`;
  await page.getByRole("link", { name: "New project" }).first().click();
  await page.getByRole("textbox", { name: "Project name" }).fill(name);
  await page.getByRole("combobox", { name: "Client" }).selectOption({ label: "Dr. Meera Nair (Madurai)" });
  await page.getByRole("combobox", { name: "Status" }).selectOption("ACTIVE");
  await page.getByRole("textbox", { name: "Final contract amount" }).fill("45,00,000");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // Plan the work with the standard stages, then mark one item delayed.
  await page.getByRole("navigation", { name: "Project sections" }).getByRole("link", { name: "Work" }).click();
  await page.getByRole("button", { name: "Add standard stages" }).first().click();
  await page.getByRole("button", { name: "Add stages" }).click();
  await expect(page.getByRole("heading", { name: "Foundation" })).toBeVisible();

  const excavation = page.locator("li", { hasText: "Excavation" }).first();
  await excavation.getByRole("button", { name: "Update" }).click();
  await page.getByRole("combobox", { name: "Status" }).last().selectOption("DELAYED");
  await page.getByRole("textbox", { name: "Reason pending (optional)" }).fill("Rock found at 4 feet");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(excavation.getByText("Delayed")).toBeVisible();

  // It shows up on Pending work with its reason.
  await page.goto("/work/pending");
  await expect(page.getByText("Rock found at 4 feet")).toBeVisible();
});

test("manager cannot open owner-only pages, even by typing the address", async ({ page }) => {
  await login(page, MANAGER);
  await expect(page.getByRole("link", { name: "Users & permissions" })).toHaveCount(0);
  await page.goto("/settings/users");
  await expect(page.getByText("Only the owner can manage users.")).toBeVisible();
  await page.goto("/audit");
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
  // Money is hidden from a Site Manager.
  await page.goto("/dashboard");
  await expect(page.getByText("Financial summary")).toHaveCount(0);
});

test("dashboard works on a phone @mobile", async ({ page }) => {
  await login(page, OWNER);
  await expect(page.getByText("Things that need your attention")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
