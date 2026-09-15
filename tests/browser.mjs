import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || "chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const url = process.env.DEMO_URL || "http://127.0.0.1:4173";
const click = async (name) =>
  page.getByRole("button", { name, exact: true }).click();
const contains = async (text) =>
  assert.ok(
    await page.getByText(text, { exact: false }).first().isVisible(),
    text,
  );
try {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/welcome-desktop.png",
    fullPage: true,
  });
  await click("Start an application");
  await click("Fill sample details");
  await click("Send verification code");
  await page.getByLabel("Verification code").fill("000000");
  await click("Verify and continue");
  await contains("That code did not work");
  await click("Use demo code");
  await click("Verify and continue");
  await contains("DEMO-7K4P-92");
  await click("Continue to application");
  for (let n = 0; n < 3; n++) {
    await click("Fill sample details");
    await click("Continue");
  }
  await contains("Check your answers");
  await click("Edit details");
  await page.getByLabel("City", { exact: true }).fill("Sample mailing city");
  await click("Continue");
  await click("Edit screening");
  assert.equal(
    await page.getByLabel("City of residence").inputValue(),
    "Philadelphia",
  );
  await click("Continue");
  await click("Continue");
  await click("Save and exit");
  await click("Return to my application");
  await page.reload();
  await contains("Return to your application");
  await click("Load exception example");
  await contains("Outside PCDC");
  await click("Return to main walkthrough");
  await contains("Return to your application");
  await click("Fill sample details");
  await click("Send verification code");
  await click("Use demo code");
  await click("Verify and continue");
  await contains("Check your answers");
  await page.getByLabel("I have checked my answers").check();
  await click("Submit application");
  await contains("Application received");
  await click("Volunteer view");
  await click("Simulate intake checks");
  await click("Claim case");
  await click("Request a document");
  await click("Send request");
  await click("Client view");
  await contains("Action needed");
  await page.screenshot({
    path: "artifacts/client-action-desktop.png",
    fullPage: true,
  });
  await click("Add document");
  await click("Use sample document");
  await page.getByLabel("Simulate an upload failure").check();
  await click("Submit document");
  await contains("The sample upload failed");
  await page.getByLabel("Simulate an upload failure").uncheck();
  await click("Submit document");
  await contains("waiting for a volunteer to check it");
  await click("Volunteer view");
  await contains("Awaiting verification");
  await page.screenshot({
    path: "artifacts/volunteer-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await contains("Awaiting verification");
  await click("Reset demo");
  await click("Reset everything");
  await click("Load exception example");
  await contains("Outside PCDC");
  assert.ok(
    !(await page
      .getByRole("button", { name: "Submit application", exact: true })
      .count()),
  );
  await click("Reset demo");
  await click("Reset everything");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#toast.visible").waitFor({ state: "hidden" });
  await page.screenshot({
    path: "artifacts/welcome-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "No mobile horizontal overflow",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: complete client/volunteer handoff, save/retrieve, errors, persistence, exception, reset, desktop and mobile.",
  );
} finally {
  await browser.close();
}
