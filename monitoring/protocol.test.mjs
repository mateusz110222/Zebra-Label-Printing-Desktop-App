import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { authorize, serials, validEvent, validHeartbeat } from "./protocol.mjs";

test("tokens authenticate only their own station", () => {
  const token = "x".repeat(48);
  const registry = {
    test: { sha256: createHash("sha256").update(token).digest("hex") },
  };
  assert.equal(authorize(registry, "test", "Bearer " + token), registry.test);
  assert.equal(authorize(registry, "other", "Bearer " + token), null);
  assert.equal(authorize(registry, "test", "Bearer " + "y".repeat(48)), null);
  assert.equal(authorize(registry, "constructor", "Bearer " + token), null);
});

test("serial index separates sent and unsent labels in the same batch", () => {
  const event = {
    id: "example",
    timestamp: "2026-11-04T00:00:00Z",
    category: "print",
    action: "BATCH_PRINT",
    status: "failure",
    details: {
      labels: [
        { fullSerialNumber: "ONE", deliveryState: "sent" },
        { fullSerialNumber: "TWO", deliveryState: "failed" },
        { fullSerialNumber: "ONE", deliveryState: "failed" },
      ],
    },
  };
  assert.ok(validEvent(event));
  assert.deepEqual(serials(event), [
    ["ONE", true],
    ["TWO", false],
  ]);
  assert.ok(!validEvent({ ...event, timestamp: "invalid" }));
});

test("heartbeat distinguishes unavailable printer status", () => {
  const heartbeat = {
    name: "Station",
    version: "1.4.7",
    checkedAt: null,
    printer: null,
    syncState: "pending",
  };
  assert.ok(validHeartbeat(heartbeat));
  assert.ok(
    !validHeartbeat({
      ...heartbeat,
      printer: {
        reachable: true,
        ready: true,
        total: 2147483648,
        readyCount: 1,
      },
    }),
  );
  assert.ok(
    !validHeartbeat({
      ...heartbeat,
      printer: { reachable: true, ready: true, total: 1, readyCount: 2 },
    }),
  );
});
