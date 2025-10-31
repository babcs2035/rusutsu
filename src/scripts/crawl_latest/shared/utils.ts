import type { Locator, Page } from "playwright";
import type {
  Course,
  FieldConfig,
  Lift,
  WeatherData,
  WeatherValidationConfig,
} from "./type";

export function toHalfWidth(str: string): string {
  return str.replace(/[\uFF01-\uFF5E]/g, s =>
    String.fromCharCode(s.charCodeAt(0) - 0xfee0),
  );
}

export async function trimElem(element: Locator): Promise<string> {
  return ((await element.allInnerTexts())[0] ?? "").trim();
}

export async function trimAndToHalfWidth(element: Locator): Promise<string> {
  return toHalfWidth(await trimElem(element));
}

export async function navigateSafely(
  page: Page,
  url: string,
  selector: string,
  gotoTimeout: number = 30000,
  selectorTimeout: number = 15000,
): Promise<boolean> {
  try {
    await page.goto(url, { timeout: gotoTimeout });
    await page.waitForSelector(selector, {
      state: "attached",
      timeout: selectorTimeout,
    });
    return true;
  } catch (e) {
    console.error(
      `❌ Error navigating to ${url}: ${e instanceof Error ? e.message.split("\n")[0] : e}`,
    );
    return false;
  }
}

export async function clickSafely(
  page: Page,
  clickTarget: Locator | string,
  postSelector: string,
  clickTimeout: number = 30000,
  waitTimeout: number = 15000,
): Promise<boolean> {
  const locator: Locator =
    typeof clickTarget === "string" ? page.locator(clickTarget) : clickTarget;
  try {
    await locator.click({ timeout: clickTimeout });
    // クリック後に、次の画面/部分が「DOM にアタッチされる」まで待機
    await page.waitForSelector(postSelector, {
      state: "attached",
      timeout: waitTimeout,
    });
    return true;
  } catch (e) {
    console.error(
      `❌ Error clicking ${clickTarget}: ${e instanceof Error ? e.message.split("\n")[0] : e}`,
    );
    return false;
  }
}

export async function safeGetAttribute(
  page: Page,
  selector: string,
  attr: string,
): Promise<string | null> {
  const locator = page.locator(selector);
  if ((await locator.count()) > 0) {
    return await locator.first().getAttribute(attr);
  }
  return null;
}

export async function safeInnerHTML(
  page: Page,
  selector: string,
): Promise<string | null> {
  return page.evaluate(sel => {
    const el = document.querySelector<HTMLElement>(sel);
    return el ? el.innerHTML.trim() : null;
  }, selector);
}

export function getFormattedTime(now: string): string {
  const [datePart, timePart] = now.split(" ");
  const [year, month, day] = datePart.split("/").map(s => s.padStart(2, "0"));
  const [hour, minute, second] = timePart
    .split(":")
    .map(s => s.padStart(2, "0"));
  return `${year}_${month}${day}_${hour}${minute}${second}`;
}

function buildConfig(
  defaultConfig: Record<keyof WeatherData, FieldConfig>,
  overrides: WeatherValidationConfig = {},
): Record<keyof WeatherData, FieldConfig> {
  return Object.fromEntries(
    (Object.keys(defaultConfig) as (keyof WeatherData)[]).map(key => [
      key,
      { ...defaultConfig[key], ...overrides[key] }, // ← FieldConfig 単位で上書き
    ]),
  ) as Record<keyof WeatherData, FieldConfig>;
}

const defaultValidationConfig: Record<keyof WeatherData, FieldConfig> = {
  update: { type: "string", disabled: false },
  weather: { type: "string", disabled: false },
  temperature: { type: "number", min: -45, max: 45, disabled: false },
  snowDepth: { type: "number", disabled: false },
  snowfall: { type: "number", min: -0.1, max: 130, disabled: false },
  condition: { type: "string", disabled: false },
  windSpeed: { type: "number", disabled: false },
};

/**
 * 単一地点のWeatherDataを検証する
 * @param resortName - リゾート名
 * @param point      - 地点名
 * @param data       - 検証対象のデータオブジェクト
 * @param overrides  - リゾートごとの設定オーバーライド
 */
export function checkWeatherDataForPoint(
  resortName: string,
  point: string,
  data: WeatherData,
  overrides: WeatherValidationConfig = {},
): WeatherData {
  const cfgMap = buildConfig(defaultValidationConfig, overrides);
  const prefix = `⚠️ [${resortName} (${point})]`;

  for (const key of Object.keys(cfgMap) as (keyof WeatherData)[]) {
    const cfg = cfgMap[key];
    const raw = data[key];
    if (
      (typeof cfg.disabled === "boolean" && cfg.disabled) ||
      (typeof cfg.disabled === "function" &&
        cfg.disabled(raw, data, point, key))
    ) {
      if (cfg.type === "number") {
        const parsed = parseFloat(raw?.toString() || "");
        (data as any)[key] = parsed;
      }
      continue;
    }
    if (cfg.type === "string") {
      if (raw === null || raw === undefined || raw === "") {
        console.warn(`${prefix} ${key} is null or empty`);
      }
    } /* type === 'number' */ else {
      const parsed = parseFloat(raw?.toString() || "");
      // 型エラー回避のため any にキャストして代入
      (data as any)[key] = parsed;

      if (Number.isNaN(parsed)) {
        console.warn(`${prefix} ${key} is null or NaN`);
      } else {
        if (cfg.min !== undefined && parsed < cfg.min) {
          console.warn(`${prefix} ${key} is ${parsed}. Too low!`);
        }
        if (cfg.max !== undefined && parsed > cfg.max) {
          console.warn(`${prefix} ${key} is ${parsed}. Too high!`);
        }
      }
    }
  }
  return data;
}

/**
 * 全地点のデータを一括検証する
 * @param resortName - リゾート名
 * @param weather    - 地点キー → WeatherData オブジェクトのマップ
 * @param overrides  - リゾートごとの設定オーバーライド
 */
export function checkAllWeatherData(
  resortName: string,
  weather: Record<string, WeatherData>,
  overrides?: WeatherValidationConfig,
): Record<string, WeatherData> {
  const result: Record<string, WeatherData> = {};
  for (const point of Object.keys(weather)) {
    result[point] = checkWeatherDataForPoint(
      resortName,
      point,
      weather[point],
      overrides,
    );
  }
  return result;
}

export function checkCourse(
  resortName: string,
  name: string | null,
  status: string | null,
) {
  if (name === null || name.trim() === "") {
    console.warn(`⚠️ [${resortName}] Course name is null or empty`);
  }
  if (status === null || status.trim() === "") {
    console.warn(`⚠️ [${resortName} ${name} Course] Status is null or empty`);
  } else if (
    status !== "○" &&
    status !== "◯" &&
    status !== "△" &&
    status !== "×" &&
    status !== "✕"
  ) {
    console.warn(
      `⚠️ [${resortName} ${name} Course] Status (${status}) is incorrect format`,
    );
  }
}

export function checkLift(
  resortName: string,
  name: string | null,
  status: string | null,
) {
  if (!name) {
    console.warn(`⚠️ [${resortName}] Lift name is null or empty`);
  }
  if (!status) {
    console.warn(`⚠️ [${resortName} ${name} Lift] Status is null or empty`);
  } else if (
    status !== "○" &&
    status !== "◯" &&
    status !== "△" &&
    status !== "×" &&
    status !== "✕"
  ) {
    console.warn(
      `⚠️ [${resortName} ${name} Lift] Status (${status}) is incorrect format`,
    );
  }
}

export function checkCourseLiftCount(
  resortName: string,
  courses?: Course[],
  expectedCourseNum?: number,
  lifts?: Lift[],
  expectedLiftNum?: number,
) {
  if (courses?.length === 0) {
    console.warn(`⚠️ [${resortName}] No course data found`);
  } else if (courses?.length !== expectedCourseNum) {
    console.warn(
      `⚠️ [${resortName}] Course count is ${courses?.length}. Expected ${expectedCourseNum}.`,
    );
  }

  if (lifts?.length === 0) {
    console.warn(`⚠️ [${resortName}] No lift data found`);
  } else if (lifts?.length !== expectedLiftNum) {
    console.warn(
      `⚠️ [${resortName}] Lift count is ${lifts?.length}. Expected ${expectedLiftNum}.`,
    );
  }
}

export function checkUrl(
  resortName: string,
  weatherUrl?: string[],
  commentUrl?: string[],
  courseUrl?: string[],
  liftUrl?: string[],
) {
  if (weatherUrl?.length === 1 && weatherUrl[0] === "") {
    console.warn(`⚠️ [${resortName}] No weather URL found`);
  }
  if (commentUrl?.length === 1 && commentUrl[0] === "") {
    console.warn(`⚠️ [${resortName}] No comment URL found`);
  }
  if (courseUrl?.length === 1 && courseUrl[0] === "") {
    console.warn(`⚠️ [${resortName}] No course URL found`);
  }
  if (liftUrl?.length === 1 && liftUrl[0] === "") {
    console.warn(`⚠️ [${resortName}] No lift URL found`);
  }
}
