import { test, expect } from "@playwright/test";
import { startReview } from "../helpers/review-server.mjs";
import http from "node:http";

let cleanups;
test.beforeEach(() => {
  cleanups = [];
});
test.afterEach(async () => {
  for (const fn of cleanups.reverse()) await fn();
});

test("manual model configuration supports chat without a model-list endpoint", async ({
  page,
}) => {
  let received;
  const endpoint = http.createServer((req, res) => {
    if (req.url !== "/v1/chat/completions") {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    req.on("data", (part) => {
      body += part;
    });
    req.on("end", () => {
      received = JSON.parse(body);
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          choices: [{ message: { content: "Fixture model reply" } }],
        }),
      );
    });
  });
  await new Promise((resolve) => endpoint.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise((resolve) => endpoint.close(resolve)));
  const f = await startReview(
    {
      after(fn) {
        cleanups.push(fn);
      },
    },
    {},
  );
  await page.goto(f.url);
  await page.locator("#settings-button").click();
  await page.locator("#settings-add-provider").click();
  await page
    .locator(".provider-base-url")
    .fill(`http://127.0.0.1:${endpoint.address().port}/v1`);
  await page.locator(".provider-model-id").fill("manual-model");
  await page.locator("#settings-save").click();
  await expect(page.locator(".provider-model")).toHaveValue("manual-model");
  await page.locator("#close-settings").click();
  await page.locator("#ai-button").click();
  await page.locator('[data-ai-tab="chat"]').click();
  await page.locator("#chat-channel").selectOption("model");
  await page.locator("#chat-input").fill("What is a normal map?");
  await page.locator("#chat-send").click();
  await expect(page.locator("#chat-messages")).toContainText(
    "Fixture model reply",
  );
  expect(received.model).toBe("manual-model");
  expect(received.messages.at(-1).content).toBe("What is a normal map?");
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
  await expect(page.locator("#loading-text")).toHaveText("Asset Generation");
  // The empty surface is for generation, not for marks that cannot be placed.
  await expect(page.locator(".annotations-panel")).toBeHidden();
  await expect(page.locator(".toolbar")).toBeHidden();
  // Opening the generator is the reader's choice, so the dock stays closed
  // until they take it and the review space keeps its full width.
  await expect(page.locator("#ai-dock")).toBeHidden();

  // The toolbar button opens the generator, not the chat pane that happens to
  // be first in the markup: the tab marked active and the pane shown must
  // agree before anyone has clicked a tab.
  await page.locator("#ai-button").click();
  await expect(page.locator("#ai-dock")).toBeVisible();
  await expect(page.locator('[data-ai-pane="gen"]')).toBeVisible();
  await expect(page.locator('[data-ai-pane="chat"]')).toBeHidden();
  await page.locator("#ai-button").click();
  await expect(page.locator("#ai-dock")).toBeHidden();

  await cta.click();
  await expect(page.locator("#ai-dock")).toBeVisible();
  await expect(page.locator('[data-ai-tab="gen"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("#gen-prompt")).toBeVisible();
  await expect(page.locator("#gen-prompt")).toBeFocused();
  await expect(page.locator("#loading")).toBeHidden();
});
