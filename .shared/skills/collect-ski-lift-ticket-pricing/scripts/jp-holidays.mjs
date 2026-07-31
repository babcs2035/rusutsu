/**
 * jp-holidays.mjs — 日本の国民の祝日の計算（2022年以降の制度に準拠）
 *
 * lookup-price.mjs のカレンダー解決（included_day_types の
 * weekday / public_holiday）で
 * 使う「標準カレンダー」の実装。2021年以前の特例（東京五輪による移動等）は
 * 扱わない。祝日法が改正された場合はこのファイルを更新すること。
 */

function pad(n) {
  return String(n).padStart(2, "0");
}

function ymd(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function dayOfWeek(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=日曜
}

function nthMonday(y, m, nth) {
  const firstDow = dayOfWeek(y, m, 1);
  const firstMonday = 1 + ((8 - firstDow) % 7);
  return firstMonday + (nth - 1) * 7;
}

// 春分・秋分の簡易計算式（1980〜2099年で有効な近似式）
function vernalEquinoxDay(y) {
  return Math.floor(20.8431 + 0.242194 * (y - 1980)) - Math.floor((y - 1980) / 4);
}

function autumnalEquinoxDay(y) {
  return Math.floor(23.2488 + 0.242194 * (y - 1980)) - Math.floor((y - 1980) / 4);
}

function baseHolidays(y) {
  return new Map([
    [ymd(y, 1, 1), "元日"],
    [ymd(y, 1, nthMonday(y, 1, 2)), "成人の日"],
    [ymd(y, 2, 11), "建国記念の日"],
    [ymd(y, 2, 23), "天皇誕生日"],
    [ymd(y, 3, vernalEquinoxDay(y)), "春分の日"],
    [ymd(y, 4, 29), "昭和の日"],
    [ymd(y, 5, 3), "憲法記念日"],
    [ymd(y, 5, 4), "みどりの日"],
    [ymd(y, 5, 5), "こどもの日"],
    [ymd(y, 7, nthMonday(y, 7, 3)), "海の日"],
    [ymd(y, 8, 11), "山の日"],
    [ymd(y, 9, nthMonday(y, 9, 3)), "敬老の日"],
    [ymd(y, 9, autumnalEquinoxDay(y)), "秋分の日"],
    [ymd(y, 10, nthMonday(y, 10, 2)), "スポーツの日"],
    [ymd(y, 11, 3), "文化の日"],
    [ymd(y, 11, 23), "勤労感謝の日"],
  ]);
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** 指定年の祝日 Map<"YYYY-MM-DD", 名称>（振替休日・国民の休日を含む） */
export function holidaysOfYear(y) {
  const holidays = baseHolidays(y);

  // 振替休日: 祝日が日曜の場合、その後の最初の平日（祝日でない日）
  for (const dateStr of [...holidays.keys()]) {
    const [yy, mm, dd] = dateStr.split("-").map(Number);
    if (dayOfWeek(yy, mm, dd) === 0) {
      let next = addDays(dateStr, 1);
      while (holidays.has(next)) next = addDays(next, 1);
      holidays.set(next, "振替休日");
    }
  }

  // 国民の休日: 前後を祝日に挟まれた平日（例: 9月の敬老の日と秋分の日の間）
  for (const dateStr of [...holidays.keys()]) {
    const between = addDays(dateStr, 1);
    const after = addDays(dateStr, 2);
    if (!holidays.has(between) && holidays.has(after)) {
      const [yy, mm, dd] = between.split("-").map(Number);
      if (dayOfWeek(yy, mm, dd) !== 0) {
        holidays.set(between, "国民の休日");
      }
    }
  }

  return holidays;
}

const cache = new Map();

/** 祝日名を返す（祝日でなければ null） */
export function holidayName(dateStr) {
  const y = Number(dateStr.slice(0, 4));
  if (!cache.has(y)) cache.set(y, holidaysOfYear(y));
  return cache.get(y).get(dateStr) ?? null;
}

/**
 * 日付の属性を返す。
 * weekday: 月〜金かつ祝日でない / saturday / sunday / public_holiday
 */
export function dayInfo(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = dayOfWeek(y, m, d);
  const holiday = holidayName(dateStr);
  return {
    date: dateStr,
    day_of_week: ["日", "月", "火", "水", "木", "金", "土"][dow],
    is_saturday: dow === 6,
    is_sunday: dow === 0,
    holiday_name: holiday,
    is_public_holiday: holiday != null,
    is_weekday: dow >= 1 && dow <= 5 && holiday == null,
  };
}
