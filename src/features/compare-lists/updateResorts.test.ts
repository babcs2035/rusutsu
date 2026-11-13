import assert from "node:assert/strict";
import { test } from "node:test";
import type { Prisma } from "@prisma/client";
import { CompareListError, updateResorts } from "./updateResorts";

function fakeTx({
  count = 1,
  current = [] as { skiResortId: string; position: number }[],
  active = [] as string[],
}: {
  count?: number;
  current?: { skiResortId: string; position: number }[];
  active?: string[];
} = {}) {
  const calls: {
    updateWhere?: unknown;
    currentWhere?: unknown;
    resortWhere?: unknown;
    deletedWhere?: unknown;
    created?: unknown;
    touched: string[];
  } = { touched: [] };
  const tx = {
    compareList: {
      updateMany: async (args: { where: unknown }) => {
        calls.touched.push("updateMany");
        calls.updateWhere = args.where;
        return { count };
      },
    },
    compareListItem: {
      findMany: async (args: { where: unknown }) => {
        calls.touched.push("findMany");
        calls.currentWhere = args.where;
        return current;
      },
      deleteMany: async (args: { where: unknown }) => {
        calls.touched.push("deleteMany");
        calls.deletedWhere = args.where;
        return { count: 1 };
      },
      createMany: async (args: { data: unknown }) => {
        calls.touched.push("createMany");
        calls.created = args.data;
        return { count: 1 };
      },
    },
    skiResort: {
      findMany: async (args: { where: unknown }) => {
        calls.touched.push("resortFindMany");
        calls.resortWhere = args.where;
        return active.map(id => ({ id }));
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, calls };
}

test("updates only the requested owner's list and locks through updateMany", async () => {
  const { tx, calls } = fakeTx();
  await updateResorts(tx, "user-1", "list-1", ["resort-1"], "remove");
  assert.deepEqual(calls.updateWhere, { id: "list-1", userId: "user-1" });
  assert.deepEqual(calls.touched, ["updateMany", "deleteMany"]);
});

test("does not touch items when the owner-scoped update finds no list", async () => {
  const { tx, calls } = fakeTx({ count: 0 });
  await assert.rejects(
    updateResorts(tx, "user-1", "list-1", ["resort-1"], "remove"),
    CompareListError,
  );
  assert.deepEqual(calls.touched, ["updateMany"]);
});

test("adds only non-duplicate resorts after the current maximum position", async () => {
  const { tx, calls } = fakeTx({
    current: [
      { skiResortId: "old", position: 2 },
      { skiResortId: "already", position: 8 },
    ],
    active: ["already", "new-1", "new-2"],
  });
  await updateResorts(
    tx,
    "user-1",
    "list-1",
    ["already", "new-1", "new-2"],
    "add",
  );
  assert.deepEqual(calls.created, [
    { listId: "list-1", skiResortId: "new-1", position: 9 },
    { listId: "list-1", skiResortId: "new-2", position: 10 },
  ]);
});

test("does not add inactive resorts", async () => {
  const { tx, calls } = fakeTx({ active: ["active"] });
  await updateResorts(tx, "user-1", "list-1", ["active", "inactive"], "add");
  assert.deepEqual(calls.resortWhere, {
    id: { in: ["active", "inactive"] },
    isActive: true,
  });
  assert.deepEqual(calls.created, [
    { listId: "list-1", skiResortId: "active", position: 0 },
  ]);
});

test("rejects more than 100 total items without creating rows", async () => {
  const current = Array.from({ length: 100 }, (_, index) => ({
    skiResortId: `existing-${index}`,
    position: index,
  }));
  const { tx, calls } = fakeTx({ current, active: ["new"] });
  await assert.rejects(
    updateResorts(tx, "user-1", "list-1", ["new"], "add"),
    CompareListError,
  );
  assert.equal(calls.touched.includes("createMany"), false);
});

test("removing the final item deletes only the item, not the list", async () => {
  const { tx, calls } = fakeTx();
  await updateResorts(tx, "user-1", "list-1", ["last"], "remove");
  assert.deepEqual(calls.deletedWhere, {
    listId: "list-1",
    skiResortId: { in: ["last"] },
  });
  assert.equal(calls.touched.includes("createMany"), false);
});

test("does not create rows when every requested resort is already present", async () => {
  const { tx, calls } = fakeTx({
    current: [{ skiResortId: "already", position: 4 }],
    active: ["already"],
  });
  await updateResorts(tx, "user-1", "list-1", ["already"], "add");
  assert.equal(calls.touched.includes("createMany"), false);
});
