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
const admin = process.env.INTERNAL_DATA_API_ADMIN_TOKEN;
const crawler = process.env.INTERNAL_DATA_API_CRAWLER_TOKEN;
const diagnostics = process.env.INTERNAL_DATA_API_DIAGNOSTICS_TOKEN;
assert.ok(admin && crawler && diagnostics);
const prefix = "/api/internal/v1";
let assertions = 0;
async function call(path, status, token, method = "GET", body, headers = {}) {
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
  for (const secret of [admin, crawler, diagnostics])
    assert.ok(!text.includes(secret));
  return text ? JSON.parse(text) : null;
}
await call("/api/ready", 200);
await call(`${prefix}/ski-resorts?view=map`, 401);
await call(`${prefix}/ski-resorts?view=map`, 403, crawler);
await call(`${prefix}/data-documents?prefix=`, 403, diagnostics);
await call(`${prefix}/crawl-latest-runs`, 403, admin);
await call(`${prefix}/data-documents?key=..%2Fsecret.json`, 400, admin);
await call(`${prefix}/data-documents`, 400, admin, "PUT", "{");
await call(`${prefix}/data-documents`, 422, admin, "PUT", { documents: [] });
await call(
  `${prefix}/ski-resorts/audit-resort`,
  413,
  admin,
  "PATCH",
  "x".repeat(65537),
);
const { resorts } = await call(`${prefix}/ski-resorts?view=admin`, 200, admin);
const resort = resorts.find(row => row.id === "audit-resort");
assert.ok(resort, "Disposable DB must contain audit-resort");
const { id: _id, updatedAt, ...data } = resort;
const updates = await Promise.all([
  fetch(`${base}${prefix}/ski-resorts/audit-resort`, {
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
  fetch(`${base}${prefix}/ski-resorts/audit-resort`, {
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
const hidden = await call(`${prefix}/ski-resorts?view=map`, 200, admin);
assert.ok(!hidden.resorts.some(row => row.id === "audit-resort"));
const current = (
  await call(`${prefix}/ski-resorts?view=admin`, 200, admin)
).resorts.find(row => row.id === "audit-resort");
const { id: _currentId, updatedAt: currentDate, ...currentData } = current;
await call(`${prefix}/ski-resorts/audit-resort`, 200, admin, "PATCH", {
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
const created = await call(`${prefix}/data-documents`, 200, admin, "PUT", {
  documents: [original],
});
const concurrent = await Promise.all(
  [1, 2].map(value =>
    fetch(`${base}${prefix}/data-documents`, {
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
const winner = await call(
  `${prefix}/data-documents?key=${encodeURIComponent(key)}`,
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
      "403",
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
