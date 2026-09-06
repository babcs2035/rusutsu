import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeInternalDataApiBaseUrl } from "./internalDataApiBaseUrl";

test("accepts HTTPS and removes trailing slashes", () => {
  assert.equal(
    normalizeInternalDataApiBaseUrl(" https://data.example/rusutsu/// "),
    "https://data.example/rusutsu",
  );
});

test("allows HTTP only for the supported loopback hosts", () => {
  assert.equal(
    normalizeInternalDataApiBaseUrl("http://localhost:3000/rusutsu/"),
    "http://localhost:3000/rusutsu",
  );
  assert.equal(
    normalizeInternalDataApiBaseUrl("http://127.0.0.1:3000/rusutsu"),
    "http://127.0.0.1:3000/rusutsu",
  );
  assert.equal(
    normalizeInternalDataApiBaseUrl("http://[::1]:3000/rusutsu"),
    "http://[::1]:3000/rusutsu",
  );
});

test("rejects plain HTTP for non-loopback hosts", () => {
  for (const baseUrl of [
    "http://data.example/rusutsu",
    "http://192.168.1.20:3000/rusutsu",
    "http://0.0.0.0:3000/rusutsu",
    "http://localhost.example/rusutsu",
  ]) {
    assert.throws(
      () => normalizeInternalDataApiBaseUrl(baseUrl),
      /must use HTTPS/,
    );
  }
});

test("rejects credentials, query strings, fragments, and invalid URLs", () => {
  for (const baseUrl of [
    "https://user:password@data.example/rusutsu",
    "https://data.example/rusutsu?token=value",
    "https://data.example/rusutsu#fragment",
    "not-a-url",
  ]) {
    assert.throws(
      () => normalizeInternalDataApiBaseUrl(baseUrl),
      /must use HTTPS/,
    );
  }
});
