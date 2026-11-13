import assert from "node:assert/strict";
import test from "node:test";
import type { ResortLinkGroupView } from "@/features/resort-links/model";
import { linkTableRows } from "./linkTableRows";

const group = (id: string, label: string): ResortLinkGroupView => ({
  id,
  label,
  types: [
    {
      type: "parking",
      label: "駐車場",
      owners: ["officialSkill"],
      links: [
        {
          type: "parking",
          source: "official",
          category: null,
          label: null,
          url: "https://example.com/parking",
          note: null,
          sortOrder: 0,
        },
      ],
    },
  ],
});

test("どこかにリンクがあるグループだけを固定順で行にし、無いスキー場のマスは空にする", () => {
  const car = group("car", "車");
  const basic = group("basic", "基本");
  const rows = linkTableRows([[car], [basic, car], []]);
  assert.deepEqual(
    rows.map(row => row.id),
    ["basic", "car"],
  );
  assert.deepEqual(rows[0].cells, [null, basic, null]);
  assert.deepEqual(rows[1].cells, [car, car, null]);
});

test("どのスキー場にもリンクが無ければ行は無い", () => {
  assert.deepEqual(linkTableRows([[], []]), []);
});
