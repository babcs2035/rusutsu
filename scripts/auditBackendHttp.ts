// Run only against a disposable DB seeded with the artificial audit-resort.
import assert from "node:assert/strict";

const base = process.env.AUDIT_BASE_URL;
if (
  !base ||
  !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/rusutsu$/u.test(base)
) {
  throw new Error("AUDIT_BASE_URL must be an explicit loopback /rusutsu URL");
}
if (process.env.AUDIT_DISPOSABLE_DB !== "true") {
  throw new Error(
    "AUDIT_DISPOSABLE_DB=true is required (never use operational data)",
  );
}
const admin = process.env.API_BEARER_TOKEN;
assert.ok(admin);
const secrets = [admin];
const prefix = "/api/admin";
let assertions = 0;
type AuditResort = Record<string, unknown> & {
  id: string;
  updatedAt: string;
};

/** Send one API request and verify that no configured token leaks in its body. */
async function call<T = unknown>(
  path: string,
  status: number,
  token?: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined
      ? {}
      : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    redirect: "manual",
  });
  assert.equal(response.status, status, `${method} ${path}`);
  assertions++;
  const text = await response.text();
  for (const secret of secrets) assert.ok(!text.includes(secret));
  return (text ? JSON.parse(text) : null) as T;
}
await call("/api/ready", 200);
await call(`${prefix}/resorts?view=map`, 401);
await call(`${prefix}/resorts?view=map`, 401, "incorrect-token");
await call(`${prefix}/documents?prefix=`, 401, "incorrect-token");
await call(`${prefix}/crawl/runs`, 400, admin);
await call(`${prefix}/documents?key=..%2Fsecret.json`, 400, admin);
await call(`${prefix}/documents`, 400, admin, "PUT", "{");
await call(`${prefix}/documents`, 422, admin, "PUT", { documents: [] });
await call(
  `${prefix}/resorts/audit-resort`,
  413,
  admin,
  "PATCH",
  "x".repeat(65537),
);
const { resorts } = await call<{ resorts: AuditResort[] }>(
  `${prefix}/resorts?view=admin`,
  200,
  admin,
);
const resort = resorts.find(row => row.id === "audit-resort");
assert.ok(resort, "Disposable DB must contain audit-resort");
const { id: _id, updatedAt, ...data } = resort;
const updates = await Promise.all([
  fetch(`${base}${prefix}/resorts/audit-resort`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${admin}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expectedUpdatedAt: updatedAt,
      data: { ...data, shortName: "監査A", isActive: false },
    }),
  }),
  fetch(`${base}${prefix}/resorts/audit-resort`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${admin}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expectedUpdatedAt: updatedAt,
      data: { ...data, shortName: "監査B", isActive: false },
    }),
  }),
]);
assert.deepEqual(updates.map(response => response.status).sort(), [200, 409]);
assertions++;
const hidden = await call<{ resorts: Array<{ id: string }> }>(
  `${prefix}/resorts?view=map`,
  200,
  admin,
);
assert.ok(!hidden.resorts.some(row => row.id === "audit-resort"));
const current = (
  await call<{ resorts: AuditResort[] }>(
    `${prefix}/resorts?view=admin`,
    200,
    admin,
  )
).resorts.find(row => row.id === "audit-resort");
assert.ok(current);
const { id: _currentId, updatedAt: currentDate, ...currentData } = current;
await call(`${prefix}/resorts/audit-resort`, 200, admin, "PATCH", {
  expectedUpdatedAt: currentDate,
  data: { ...currentData, isActive: true },
});
const key = `reviews/audit-resort/audit-${Date.now()}.json`;
const original = {
  key,
  content: '{"value":0}',
  mediaType: "application/json",
  expectedHash: null,
};
const created = await call<{ documents: Array<{ hash: string }> }>(
  `${prefix}/documents`,
  200,
  admin,
  "PUT",
  { documents: [original] },
);
const concurrent = await Promise.all(
  [1, 2].map(value =>
    fetch(`${base}${prefix}/documents`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${admin}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documents: [
          {
            ...original,
            content: JSON.stringify({ value }),
            expectedHash: created.documents[0].hash,
          },
        ],
      }),
    }),
  ),
);
assert.deepEqual(
  concurrent.map(response => response.status).sort(),
  [200, 409],
);
assertions++;
const winner = await call<{ document: { version: number } }>(
  `${prefix}/documents?key=${encodeURIComponent(key)}`,
  200,
  admin,
);
assert.equal(winner.document.version, 2);
console.log(
  JSON.stringify({
    status: "passed",
    httpChecks: assertions,
    checks: [
      "401",
      "400",
      "413",
      "422",
      "concurrent resort 409",
      "concurrent document 409",
      "inactive hidden and reactivated",
      "response token exclusion",
    ],
  }),
);
