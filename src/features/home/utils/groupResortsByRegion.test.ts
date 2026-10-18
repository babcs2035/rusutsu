import assert from "node:assert/strict";
import test from "node:test";
import { groupResortsByRegion } from "./groupResortsByRegion";

const resorts = [
  { id: "nagano-a", prefecture: "長野県" },
  { id: "hokkaido", prefecture: "北海道" },
  { id: "niigata", prefecture: "新潟県" },
  { id: "nagano-b", prefecture: "長野県" },
  { id: "gunma", prefecture: "群馬県" },
];

test("地方・都道府県でまとめ、県内のスキー場の順序を保つ", () => {
  const grouped = groupResortsByRegion(resorts);
  assert.deepEqual(
    grouped.map(region => region.name),
    ["北海道・東北", "関東", "中部"],
  );
  const central = grouped.find(region => region.name === "中部");
  assert.equal(central?.count, 3);
  assert.deepEqual(
    central?.prefectures.map(prefecture => [
      prefecture.name,
      prefecture.resorts.length,
    ]),
    [
      ["新潟県", 1],
      ["長野県", 2],
    ],
  );
  assert.deepEqual(
    central?.prefectures
      .find(prefecture => prefecture.name === "長野県")
      ?.resorts.map(resort => resort.id),
    ["nagano-a", "nagano-b"],
  );
  assert.equal(resorts[0].id, "nagano-a");
});

test("都道府県の件数は、渡された検索結果だけを数える", () => {
  const grouped = groupResortsByRegion(
    resorts.filter(resort => resort.id === "nagano-b"),
  );
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].name, "中部");
  assert.equal(grouped[0].count, 1);
  assert.equal(grouped[0].prefectures.length, 1);
  assert.equal(grouped[0].prefectures[0].name, "長野県");
  assert.equal(grouped[0].prefectures[0].resorts.length, 1);
});

test("所在地が不明な検索結果も落とさずに表示する", () => {
  const input = [
    ...resorts,
    { id: "blank", prefecture: "  " },
    { id: "unknown", prefecture: "地域未登録" },
  ];
  const grouped = groupResortsByRegion(input);
  const others = grouped.find(region => region.name === "その他");
  assert.equal(others?.count, 2);
  assert.deepEqual(
    others?.prefectures.map(prefecture => prefecture.name),
    ["所在地不明", "地域未登録"],
  );
  const ids = grouped.flatMap(region =>
    region.prefectures.flatMap(prefecture =>
      prefecture.resorts.map(resort => resort.id),
    ),
  );
  assert.equal(ids.length, input.length);
  assert.equal(new Set(ids).size, input.length);
});

test("検索結果が空なら地方・都道府県の行も表示しない", () => {
  assert.deepEqual(groupResortsByRegion([]), []);
});
