import { test, expect } from "@playwright/test";
import { startReview } from "../helpers/review-server.mjs";

let cleanups;
test.beforeEach(() => {
  cleanups = [];
});
test.afterEach(async () => {
  for (const fn of cleanups.reverse()) await fn();
});

/* A fresh install runs the service and opens the browser, but nobody has
   published a model yet. That empty space used to be a spinner and a sentence
   about waiting for an Agent, which is the wrong first instruction for a tool
   whose job is making the model. It now offers the generator instead, so the
   offer has to open the real pane rather than sit there as a dead button. */
test("a first-run install offers the generator from the empty review space", async ({
  page,
}) => {
  const f = await startReview(
    {
      after(fn) {
        cleanups.push(fn);
      },
    },
    {},
  );
  await page.goto(f.url);

  const cta = page.locator("#loading-generate");
  await expect(cta).toBeVisible();
  await expect(cta).toHaveText(/Generate the first model/);
  await expect(page.locator("#loading .spinner")).toBeHidden();
  // Opening the generator is the reader's choice, so the dock stays closed
  // until they take it and the review space keeps its full width.
  await expect(page.locator("#ai-dock")).toBeHidden();

  await cta.click();
  await expect(page.locator("#ai-dock")).toBeVisible();
  await expect(page.locator('[data-ai-tab="gen"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("#gen-prompt")).toBeVisible();
  await expect(page.locator("#loading")).toBeHidden();
});
