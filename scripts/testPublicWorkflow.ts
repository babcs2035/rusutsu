// 未ログインの公開投稿・情報修正と，合成管理者による審査をブラウザーで確認する．
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { encode } from "next-auth/jwt";
import { chromium } from "playwright";

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

/** Prevent mutations unless the runner explicitly marks its database disposable. */
function assertDisposableDatabase(): void {
  if (process.env.RUSUTSU_BROWSER_DISPOSABLE_DB !== "true")
    throw new Error(
      "Set RUSUTSU_BROWSER_DISPOSABLE_DB=true before browser workflow mutations.",
    );
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

  const result = anonymousPage.waitForResponse(
    response =>
      response.url().endsWith("/api/resorts/ticket-plans") && response.ok(),
  );
  await anonymousPage.getByRole("tab", { name: "料金", exact: true }).click();
  const plans = await (await result).json();
  assert.equal(plans[0]?.tiers[0]?.view.total, 4310);
  await anonymousPage.getByText(/4,310/u).first().waitFor();
  await firstTab.click();
  await anonymousContext.setOffline(true);
  await anonymousPage.getByRole("tab", { name: "料金", exact: true }).click();
  await anonymousPage.getByText(/4,310/u).first().waitFor();
  await anonymousContext.setOffline(false);

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
