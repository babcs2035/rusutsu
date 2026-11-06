// 仕様書 節C（1日券にナイターが含まれる型）と節N（ナイターが別料金の型）を実装
import { test } from "node:test";
import { DAY, DAY_NIGHT, hours, NIGHT } from "../testing/specResort";
import { resortC, resortN, resortN02 } from "./fixtures/b";
import { check, D } from "./helpers";

const NIGHT_DAY = D.sat; // ナイター営業日
const NO_NIGHT = D.wed;

test("C01 ナイター営業日・1日", () => {
  check(resortC, NIGHT_DAY, DAY, { primary: "1日券 8000" });
});

test("C02 ナイター営業日・1日＋ナイター", () => {
  check(resortC, NIGHT_DAY, DAY_NIGHT, { primary: "1日券 8000" });
});

test("C03 ナイター営業日・ナイター", () => {
  check(resortC, NIGHT_DAY, NIGHT, { primary: "ナイター券 3000" });
});

test("C04 ナイター営業日・4時間", () => {
  check(resortC, NIGHT_DAY, hours(4), {
    primary: "4時間券 5000",
    timeRestricted: ["ナイター券 3000(17:00〜21:00)"],
  });
});

test("C05 ナイター営業日・5時間", () => {
  check(resortC, NIGHT_DAY, hours(5), {
    primary: "1日券 8000",
    shorter: ["4時間券 5000", "ナイター券 3000(17:00〜21:00)"],
  });
});

test("C06 ナイター営業日・6時間", () => {
  check(resortC, NIGHT_DAY, hours(6), { primary: "1日券 8000" });
});

test("C07 ナイターなしの日・4時間", () => {
  check(resortC, NO_NIGHT, hours(4), { primary: "4時間券 5000" });
});

test("C08 ナイターなしの日・9時間", () => {
  check(resortC, NO_NIGHT, hours(9), {
    primary: "1日券 8000",
    notes: ["この日の営業は8.5時間（8:30〜17:00）です"],
  });
});

test("C09 ナイターなしの日・ナイター", () => {
  check(resortC, NO_NIGHT, NIGHT, { primary: null });
});

test("N01 土・1日＋ナイター", () => {
  check(resortN, D.sat, DAY_NIGHT, { primary: "1日券＋＋ナイター券 6500" });
});

test("N02 土・1日＋ナイター（＋ナイター券を削除）", () => {
  check(resortN02, D.sat, DAY_NIGHT, { primary: "1日券＋ナイター券 8000" });
});

test("N03 土・ナイター（＋ナイター券は単独では使えない）", () => {
  check(resortN, D.sat, NIGHT, { primary: "ナイター券 3000" });
});

test("N04 土・9時間（休止の30分は数えない）", () => {
  check(resortN, D.sat, hours(9), {
    primary: "1日券＋＋ナイター券 6500",
    shorter: ["1日券 5000(8時間)"],
  });
});

test("N05 土・6時間", () => {
  check(resortN, D.sat, hours(6), {
    primary: "1日券 5000",
    timeRestricted: ["午後＆ナイター券 4000(13:00〜21:00)"],
  });
});

test("N06 水・1日＋ナイター", () => {
  check(resortN, D.wed, DAY_NIGHT, {
    primary: "1日券 5000",
    notes: ["この日はナイター営業がありません"],
  });
});

test("N07 水・6時間（午後＆ナイター券は売っていない）", () => {
  check(resortN, D.wed, hours(6), { primary: "1日券 5000" });
});
