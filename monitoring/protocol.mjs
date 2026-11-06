import { createHash, timingSafeEqual } from "node:crypto";

export function authorize(registry, station, authorization) {
  const configured = Object.hasOwn(registry, station ?? "")
    ? registry[station]
    : null;
  const token = /^Bearer ([a-zA-Z0-9_-]{32,256})$/.exec(
    authorization ?? "",
  )?.[1];
  if (!token || !/^[a-f0-9]{64}$/.test(configured?.sha256 ?? "")) return null;
  const digest = createHash("sha256").update(token).digest();
  return timingSafeEqual(digest, Buffer.from(configured.sha256, "hex"))
    ? configured
    : null;
}

export function serials(event) {
  const details = event.details;
  const labels = Array.isArray(details.labels) ? details.labels : [details];
  const results = new Map();
  for (const label of labels) {
    const serial = label?.fullSerialNumber;
    if (
      typeof serial === "string" &&
      serial.length > 0 &&
      serial.length <= 256
    ) {
      results.set(
        serial,
        results.get(serial) === true || label.deliveryState === "sent",
      );
    }
  }
  return [...results];
}

const timestamp = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const string = (value, max) =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const number = (value, limit) =>
  Number.isSafeInteger(value) && Math.abs(value) <= limit;
const nullableNumber = (value, limit) => value == null || number(value, limit);

export function validEvent(event) {
  return (
    object(event) &&
    string(event.id, 256) &&
    timestamp(event.timestamp) &&
    ["print", "auth", "config", "template", "system"].includes(
      event.category,
    ) &&
    string(event.action, 256) &&
    ["success", "failure"].includes(event.status) &&
    object(event.details) &&
    nullableNumber(event.details.sentCount, 2147483647) &&
    nullableNumber(
      event.details.printerDiagnostics?.delta,
      Number.MAX_SAFE_INTEGER,
    ) &&
    nullableNumber(
      event.details.printerDiagnostics?.differenceFromSent,
      Number.MAX_SAFE_INTEGER,
    )
  );
}

export function validHeartbeat(body) {
  return (
    object(body) &&
    string(body.name, 255) &&
    string(body.version, 64) &&
    ["current", "pending", "error", "synthetic"].includes(body.syncState) &&
    (body.checkedAt === null || timestamp(body.checkedAt)) &&
    (body.printer === null ||
      (object(body.printer) &&
        typeof body.printer.reachable === "boolean" &&
        typeof body.printer.ready === "boolean" &&
        number(body.printer.total, 2147483647) &&
        number(body.printer.readyCount, 2147483647) &&
        body.printer.readyCount >= 0 &&
        body.printer.readyCount <= body.printer.total))
  );
}
