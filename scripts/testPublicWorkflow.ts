// 未ログインの公開投稿・情報修正と，合成管理者による審査をブラウザーで確認する．
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { encode } from "next-auth/jwt";
import { chromium, type Page } from "playwright";

const artifactRoot = process.env.RUSUTSU_TEST_ARTIFACT_DIR;
if (!artifactRoot)
  throw new Error("Run this browser test through the test runner.");
const configuredUrl = new URL(
  process.env.OFFLINE_TEST_URL ?? "http://127.0.0.1:3001/rusutsu",
);
if (
  !["127.0.0.1", "localhost", "::1"].includes(configuredUrl.hostname) ||
  configuredUrl.pathname.replace(/\/$/u, "") !== "/rusutsu"
)
  throw new Error(
    "The public workflow browser test requires the isolated app.",
  );
const baseUrl = configuredUrl.toString().replace(/\/$/u, "");
const resortId = process.env.RUSUTSU_BROWSER_RESORT_ID ?? "rusutsu-resort";
const artifactDirectory = path.join(artifactRoot, "public-workflow");
await mkdir(artifactDirectory, { recursive: true });

/** 表示中の自前の文字を調べる．iframe 内の外部サイトは対象外とする． */
async function assertMinimumTextSize(page: Page): Promise<void> {
  const tooSmall = await page.locator("body").evaluate(body =>
    Array.from(body.querySelectorAll("*")).flatMap(element => {
      if (
        element.closest("script, style, title, rt, .sr-only, nextjs-portal") ||
        !element.checkVisibility({
          visibilityProperty: true,
          opacityProperty: true,
        }) ||
        !Array.from(element.childNodes).some(
          node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        )
      ) {
        return [];
      }
      const size = Number.parseFloat(getComputedStyle(element).fontSize);
      return size < 15 ? [{ size, text: element.textContent?.trim() }] : [];
    }),
  );
  assert.deepEqual(tooSmall, [], "visible text must be at least 15px");
}

/** 読み仮名は親文字と重ならず，小さい文字で上に添える． */
async function assertRubyFits(page: Page): Promise<void> {
  const ruby = page
    .locator("h2 .ruby-text rt")
    .filter({ visible: true })
    .first();
  await ruby.waitFor();
  const layout = await ruby.evaluate(element => {
    const parent = element.parentElement;
    return {
      size: Number.parseFloat(getComputedStyle(element).fontSize),
      parentSize:
        parent && Number.parseFloat(getComputedStyle(parent).fontSize),
      weight: Number.parseInt(getComputedStyle(element).fontWeight, 10),
    };
  });
  assert.ok(
    layout.parentSize && layout.size >= 12 && layout.size < layout.parentSize,
  );
  assert.equal(layout.weight, 500);
}

/** 表の外枠とセルの区切りは個別に描画し，狭い枠でも表の内側で収める． */
async function assertPriceTableBorders(page: Page): Promise<void> {
  const table = page
    .locator('[data-slot="table"]')
    .filter({ hasText: "試験用1日券" })
    .first();
  await table.waitFor();
  const layout = await table.evaluate(element => {
    const container = element.closest<HTMLElement>(
      '[data-slot="table-container"]',
    );
    const head = element.querySelector("thead th");
    if (!container || !head)
      throw new Error("Missing table container or heading");
    const outer = getComputedStyle(container);
    const cell = getComputedStyle(head);
    return {
      rounded: Number.parseFloat(outer.borderTopLeftRadius) > 0,
      top: outer.borderTopWidth,
      color: outer.borderTopColor,
      rowBorder: cell.borderBottomWidth,
      columnBorder: cell.borderRightWidth,
      gridColor: cell.borderBottomColor,
      scrollable: outer.overflowX === "auto",
    };
  });
  assert.equal(layout.top, "1px");
  assert.notEqual(layout.color, "rgb(0, 0, 0)");
  assert.equal(layout.gridColor, layout.color);
  assert.equal(layout.rowBorder, "1px");
  assert.equal(layout.columnBorder, "1px");
  assert.ok(layout.rounded && layout.scrollable);
}

/** 比較の通信失敗では端末の保存分を使い，正常応答から消えた施設は保存分も除く． */
async function assertCompareCacheRevalidation(page: Page): Promise<void> {
  const comparisonUrl = `${baseUrl}/?c=0102`;
  const retained = page.getByRole("heading", { name: /ルスツ/u });
  const removed = page.getByRole("heading", { name: /ニセコ/u });
  const detailPath = (url: URL): boolean =>
    url.pathname === "/rusutsu/api/resorts/details";
  const temporaryFailure = {
    status: 503,
    body: "temporary failure",
  };

  await page.route(detailPath, route => route.fulfill(temporaryFailure));
  await page.goto(comparisonUrl);
  await removed.waitFor();
  await retained.waitFor();

  await page.unroute(detailPath);
  await page.route(detailPath, async route => {
    const response = await route.fetch();
    assert.equal(response.ok(), true);
    const details: Array<{ id: string }> = await response.json();
    assert.ok(details.some(detail => detail.id === "niseko-test"));
    await route.fulfill({
      response,
      json: details.filter(detail => detail.id !== "niseko-test"),
    });
  });
  await page.reload();
  await retained.waitFor();
  assert.equal(await removed.count(), 0);

  await page.unroute(detailPath);
  await page.route(detailPath, route => route.fulfill(temporaryFailure));
  await page.reload();
  await retained.waitFor();
  assert.equal(await removed.count(), 0);
}

/** Prevent mutations unless the runner explicitly marks its database disposable. */
function assertDisposableDatabase(): void {
  if (process.env.RUSUTSU_BROWSER_DISPOSABLE_DB !== "true")
    throw new Error(
      "Set RUSUTSU_BROWSER_DISPOSABLE_DB=true before browser workflow mutations.",
    );
}

/** Verify the four weather links share one unclipped row and keyboard order. */
async function assertWeatherLinksFit(page: Page): Promise<void> {
  const row = page.locator(".weather-links").first();
  const links = row.locator("a.weather-link");
  await row.waitFor();
  assert.equal(await links.count(), 4, "all four weather sites must be linked");
  const layout = await row.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const items = [...element.querySelectorAll("a.weather-link")].map(item => {
      const rect = item.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        fontSize: Number.parseFloat(getComputedStyle(item).fontSize),
        fitsText: item.scrollWidth <= item.clientWidth + 1,
        accessibleName: item.getAttribute("aria-label"),
        icons: item.querySelectorAll(
          "svg.lucide-external-link[aria-hidden=true]",
        ).length,
        color: getComputedStyle(item).color,
      };
    });
    return {
      left: bounds.left,
      right: bounds.right,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      items,
    };
  });
  assert.ok(
    layout.scrollWidth <= layout.clientWidth + 1,
    "the weather link row must not scroll horizontally",
  );
  assert.ok(
    layout.items.every(
      item => item.left >= layout.left - 1 && item.right <= layout.right + 1,
    ),
    "all weather links must remain inside the row",
  );
  assert.ok(
    layout.items.every(item => Math.abs(item.top - layout.items[0].top) < 1),
    "one link per site must stay on one row",
  );

  const labels = ["Snow Forecast", "tenki.jp", "ウェザーニュース", "Windy"];
  assert.ok(
    layout.items.every(item => item.fontSize >= 15 && item.fitsText),
    "weather link text must fit at 15px or larger",
  );
  assert.deepEqual(
    layout.items.map(item => item.accessibleName),
    labels,
    "compact weather labels must retain each site's full accessible name",
  );
  const primary = await row.evaluate(element => {
    const probe = document.createElement("span");
    probe.style.color = "var(--primary)";
    element.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  assert.ok(
    layout.items.every(item => item.icons === 1 && item.color === primary),
  );
  await links.first().focus();
  for (const [index, label] of labels.entries()) {
    if (index > 0) await page.keyboard.press("Tab");
    assert.equal(
      await links
        .nth(index)
        .evaluate(element => element === document.activeElement),
      true,
      `${label} must be reachable in keyboard order`,
    );
  }
}

const browser = await chromium.launch({
  headless: process.env.OFFLINE_TEST_HEADLESS !== "false",
});
try {
  const anonymousContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const anonymousPage = await anonymousContext.newPage();
  const pageErrors: string[] = [];
  anonymousPage.on("pageerror", error => pageErrors.push(error.message));

  await anonymousPage.goto(`${baseUrl}/admin/corrections`);
  await anonymousPage.waitForURL(/\/rusutsu\/admin\/login(?:\?|$)/u);
  assert.match(anonymousPage.url(), /\/rusutsu\/admin\/login/u);

  await anonymousPage.goto(`${baseUrl}/${resortId}?correct=1`);
  await anonymousPage
    .getByRole("region", { name: "情報の修正パネル" })
    .waitFor();
  await anonymousPage.getByRole("button", { name: "その他の修正" }).click();
  const correctionInput = anonymousPage.getByLabel("誤っている内容");
  const submitCorrectionButton = anonymousPage.getByRole("button", {
    name: "送信する",
  });
  const inputCursor = await correctionInput.evaluate(
    element => getComputedStyle(element).cursor,
  );
  assert.ok(inputCursor === "text" || inputCursor === "auto");
  await correctionInput.fill("   ");
  assert.equal(
    await submitCorrectionButton.isDisabled(),
    true,
    "blank correction text must not be submittable",
  );
  assert.notEqual(
    await submitCorrectionButton.evaluate(
      element => getComputedStyle(element).cursor,
    ),
    "pointer",
  );
  const proposal = `ブラウザー試験 ${Date.now()} の確認用修正提案`;
  await correctionInput.fill(proposal);
  assert.equal(await submitCorrectionButton.isDisabled(), false);
  assert.equal(
    await submitCorrectionButton.evaluate(
      element => getComputedStyle(element).cursor,
    ),
    "pointer",
  );
  assertDisposableDatabase();
  await submitCorrectionButton.click();
  await anonymousPage
    .getByText("ありがとうございます", { exact: true })
    .waitFor();
  await anonymousPage.screenshot({
    path: path.join(artifactDirectory, "correction-submitted.png"),
  });

  await anonymousPage.goto(`${baseUrl}/${resortId}?compose=1`);
  await anonymousPage
    .getByText("現地レポートを投稿するにはログインが必要です", {
      exact: true,
    })
    .waitFor();

  // 320px では比較タブが横に溢れるため，両端まで戻れることを確認する．
  await anonymousPage.setViewportSize({ width: 320, height: 780 });
  await anonymousPage.goto(`${baseUrl}/?c=0102`);
  await anonymousPage
    .getByRole("tab", { name: "アクセス", exact: true })
    .click();
  const firstTab = anonymousPage.getByRole("tab", {
    name: "概要",
    exact: true,
  });
  await firstTab.click();
  assert.equal(await firstTab.getAttribute("aria-selected"), "true");
  assert.equal(
    await firstTab.evaluate(element => getComputedStyle(element).cursor),
    "pointer",
  );
  await anonymousPage
    .getByRole("button", { name: "この比較をリストに保存" })
    .click();
  const saveDialog = anonymousPage.getByRole("dialog", {
    name: "比較リストに保存",
  });
  await saveDialog.getByRole("button", { name: "ログインして保存" }).waitFor();
  await assertMinimumTextSize(anonymousPage);
  const bounds = await saveDialog.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320);
  await anonymousPage.screenshot({
    path: path.join(artifactDirectory, "comparison-save-320.png"),
  });
  await anonymousPage.keyboard.press("Escape");
  await saveDialog.waitFor({ state: "hidden" });
  assert.equal(
    await anonymousPage
      .getByRole("button", { name: "ログインして保存" })
      .count(),
    0,
  );

  let ticketPlanRequestCount = 0;
  let firstTicketPlanBody: string | null = null;
  await anonymousPage.route(
    url => url.pathname === "/rusutsu/api/resorts/ticket-plans",
    async route => {
      ticketPlanRequestCount++;
      const body = route.request().postData();
      if (ticketPlanRequestCount === 1) {
        firstTicketPlanBody = body;
        await route.fulfill({ status: 503, body: "temporary failure" });
        return;
      }
      assert.equal(body, firstTicketPlanBody);
      await route.continue();
    },
  );
  await anonymousPage.getByRole("tab", { name: "料金", exact: true }).click();
  await anonymousPage.getByText(/4,310/u).first().waitFor();
  assert.equal(ticketPlanRequestCount, 1);
  await anonymousContext.setOffline(true);
  const retry = anonymousPage.waitForResponse(
    response =>
      response.url().endsWith("/api/resorts/ticket-plans") && response.ok(),
  );
  await anonymousContext.setOffline(false);
  const plans = await (await retry).json();
  assert.equal(ticketPlanRequestCount, 2);
  await anonymousPage.unrouteAll();
  assert.equal(plans[0]?.tiers[0]?.view.total, 4310);
  await anonymousPage.getByText(/4,310/u).first().waitFor();
  await firstTab.click();
  await anonymousContext.setOffline(true);
  await anonymousPage.getByRole("tab", { name: "料金", exact: true }).click();
  await anonymousPage.getByText(/4,310/u).first().waitFor();
  await anonymousContext.setOffline(false);

  const comparisonPage = await anonymousContext.newPage();
  comparisonPage.on("pageerror", error => pageErrors.push(error.message));
  await assertCompareCacheRevalidation(comparisonPage);
  await comparisonPage.close();

  const listPage = await anonymousContext.newPage();
  listPage.on("pageerror", error => pageErrors.push(error.message));
  let listRequestCount = 0;
  let firstListInput: string | null = null;
  const listPricePath = "/rusutsu/api/resorts/prices";
  await listPage.route(
    url => url.pathname === listPricePath,
    async route => {
      listRequestCount++;
      const input = route.request().postData();
      if (listRequestCount === 1) {
        firstListInput = input;
        await route.fulfill({ status: 503, body: "temporary failure" });
        return;
      }
      assert.equal(input, firstListInput);
      await route.continue();
    },
  );
  const failedListRequest = listPage.waitForResponse(
    response =>
      response.url().endsWith(listPricePath) && response.status() === 503,
  );
  await listPage.goto(baseUrl);
  await (await failedListRequest).finished();
  await assertMinimumTextSize(listPage);
  await anonymousContext.setOffline(true);
  const listRetry = listPage.waitForResponse(
    response => response.url().endsWith(listPricePath) && response.ok(),
  );
  await anonymousContext.setOffline(false);
  const listPrices = await (await listRetry).json();
  assert.equal(listRequestCount, 2);
  assert.deepEqual(listPrices[resortId], {
    kind: "price",
    total: 4310,
    rentalMissing: false,
  });
  await listPage.close();

  const weatherPage = await anonymousContext.newPage();
  weatherPage.on("pageerror", error => pageErrors.push(error.message));
  const detailUrl = `${baseUrl}/?resort=${resortId}`;
  await weatherPage.setViewportSize({ width: 320, height: 812 });
  await weatherPage.goto(detailUrl);
  await assertRubyFits(weatherPage);
  await weatherPage.getByRole("tab", { name: "料金", exact: true }).click();
  await assertPriceTableBorders(weatherPage);
  await weatherPage.getByRole("tab", { name: "天気", exact: true }).click();
  await assertWeatherLinksFit(weatherPage);
  await assertMinimumTextSize(weatherPage);
  await weatherPage.screenshot({
    path: path.join(artifactDirectory, "weather-links-320.png"),
  });

  await weatherPage.setViewportSize({ width: 375, height: 812 });
  await weatherPage.goto(detailUrl);
  await weatherPage.getByRole("tab", { name: "天気", exact: true }).click();
  await assertWeatherLinksFit(weatherPage);
  await weatherPage.screenshot({
    path: path.join(artifactDirectory, "weather-links-375.png"),
  });

  await weatherPage.setViewportSize({ width: 1280, height: 900 });
  for (const panelWidth of [346, 500]) {
    await weatherPage.goto(detailUrl);
    await weatherPage.addStyleTag({
      content: `:root { --desktop-detail-panel-width: ${panelWidth}px; }`,
    });
    const detailPanel = weatherPage.locator(
      '[data-ski-resort-detail-panel="true"] > div',
    );
    await detailPanel.waitFor();
    assert.equal(
      await detailPanel.evaluate(element =>
        Math.round(element.getBoundingClientRect().width),
      ),
      panelWidth,
    );
    await weatherPage.getByRole("tab", { name: "天気", exact: true }).click();
    await assertWeatherLinksFit(weatherPage);
    await assertMinimumTextSize(weatherPage);
    await assertRubyFits(weatherPage);
    await weatherPage.screenshot({
      path: path.join(
        artifactDirectory,
        `weather-links-panel-${panelWidth}.png`,
      ),
    });
  }
  await weatherPage.close();

  const authSecret = process.env.RUSUTSU_BROWSER_AUTH_SECRET;
  const adminId = process.env.RUSUTSU_BROWSER_ADMIN_ID;
  if (Boolean(authSecret) !== Boolean(adminId))
    throw new Error(
      "Set both RUSUTSU_BROWSER_AUTH_SECRET and RUSUTSU_BROWSER_ADMIN_ID to enable the management workflow.",
    );
  if (authSecret && adminId) {
    const adminContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const sessionToken = await encode({
      secret: authSecret,
      salt: "authjs.session-token",
      token: { id: adminId, sub: adminId },
    });
    await adminContext.addCookies([
      {
        name: "authjs.session-token",
        value: sessionToken,
        url: configuredUrl.origin,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const adminPage = await adminContext.newPage();
    adminPage.on("pageerror", error => pageErrors.push(error.message));
    await adminPage.goto(`${baseUrl}/admin/corrections`);
    await adminPage
      .getByRole("heading", { name: "情報修正の確認", exact: true })
      .waitFor();
    const submittedCorrection = adminPage
      .getByRole("link", {
        name: new RegExp(`${resortId}.*PENDING.*匿名`, "s"),
      })
      .first();
    await submittedCorrection.waitFor();
    await submittedCorrection.click();
    await adminPage
      .getByText(`投稿された提案: ${proposal}`, { exact: true })
      .waitFor();
    assertDisposableDatabase();
    await adminPage.getByRole("button", { name: "手動で確認済み" }).click();
    await adminPage
      .getByRole("status")
      .getByText("手動で確認済みにしました。", { exact: true })
      .waitFor();
    await adminPage.screenshot({
      path: path.join(artifactDirectory, "correction-reviewed.png"),
    });

    let accountQueries = 0;
    adminPage.on("request", request => {
      if (request.url().endsWith("/api/community/queries")) accountQueries++;
    });
    await adminPage.goto(`${baseUrl}/account/community`);
    await adminPage.getByRole("heading", { name: "公開名" }).waitFor();
    await adminPage.goto(`${baseUrl}/account/posts`);
    await adminPage
      .getByText("試験用の現地レポート本文", { exact: true })
      .waitFor();
    assert.equal(
      accountQueries,
      0,
      "standalone account pages should use server data",
    );

    await adminPage.goto(`${baseUrl}/?c=0102`);
    await adminPage
      .getByRole("button", { name: "この比較をリストに保存" })
      .click();
    const compareName = adminPage.getByRole("textbox", {
      name: "新しいリストの名前",
    });
    await compareName.fill("保存前のリスト名");
    await adminPage.route(
      url => url.pathname === "/rusutsu/" || url.pathname === "/rusutsu",
      async route => {
        if (!route.request().headers()["next-action"]) return route.continue();
        await route.fulfill({
          status: 404,
          headers: { "x-nextjs-action-not-found": "1" },
        });
      },
    );
    await adminPage.getByRole("button", { name: "作成して保存" }).click();
    await adminPage.getByText(/アプリが更新されました/u).waitFor();
    assert.equal(await compareName.inputValue(), "保存前のリスト名");
    await adminPage.screenshot({
      path: path.join(artifactDirectory, "comparison-stale-action.png"),
    });
    await adminContext.close();
  } else {
    console.log(
      "Synthetic admin workflow skipped; anonymous posting and authorization checks completed.",
    );
  }

  assert.deepEqual(pageErrors, []);
  await anonymousContext.close();
  console.log(
    "anonymous correction validation, community login gate, admin authorization and review OK",
  );
} finally {
  await browser.close();
}
