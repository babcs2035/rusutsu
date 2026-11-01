import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getLiftDistance,
  rideTimeFromSpeed,
  speedFromRideTime,
} from "./liftRideTime";

test("uses positive canonical distance, then positive slope distance", () => {
  assert.equal(getLiftDistance(1200, 1300), 1200);
  assert.equal(getLiftDistance(null, 1300), 1300);
  assert.equal(getLiftDistance(0, 1300), 1300);
  assert.equal(getLiftDistance(-10, 0), null);
});

test("converts lift speed and ride time while displaying whole seconds", () => {
  assert.deepEqual(rideTimeFromSpeed(1200, 4), ["5", "0"]);
  assert.equal(speedFromRideTime(1200, 300), 4);
  assert.deepEqual(rideTimeFromSpeed(1000, 3), ["5", "33"]);
});

test("preserves the unrounded speed derived from ride time", () => {
  const speed = speedFromRideTime(1000, 333);
  assert.ok(speed != null && Math.abs(speed - 1000 / 333) < 1e-12);
  assert.deepEqual(rideTimeFromSpeed(1000, speed), ["5", "33"]);
});
