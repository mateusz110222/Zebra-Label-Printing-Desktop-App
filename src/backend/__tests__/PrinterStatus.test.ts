import { describe, expect, it } from "vitest";
import { parseHostStatus } from "../utils/parseHostStatus";

const createFirstBlock = (
  overrides: Partial<Record<number, string>> = {},
): string[] => {
  const values = Array.from({ length: 12 }, () => "0");

  for (const [index, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      values[Number(index)] = value;
    }
  }

  return values;
};

const createSecondBlock = (
  overrides: Partial<Record<number, string>> = {},
): string[] => {
  const values = Array.from({ length: 8 }, () => "0");

  for (const [index, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      values[Number(index)] = value;
    }
  }

  return values;
};

const hostStatus = (
  first: string[],
  second: string[],
): string =>
  `\x02${first.join(",")}\x03` +
  `\x02${second.join(",")}\x03` +
  `\x02PASS\x03`;

describe("parseHostStatus", () => {
  it("recognizes a ready printer and queue counters", () => {
    const first = createFirstBlock({
      4: "2",
    });

    const second = createSecondBlock({
      7: "4",
    });

    const result = parseHostStatus(
      hostStatus(first, second),
    );

    expect(result).toEqual({
      status: true,
      reachable: true,
      ready: true,
      detailsAvailable: true,
      message: "backend.printer.ready",

      data: {
        paperOut: false,
        paused: false,
        bufferFull: false,
        underTemperature: false,
        overTemperature: false,
        headOpen: false,
        ribbonOut: false,
        formatsInBuffer: 2,
        labelsRemaining: 4,
      },
    });
  });

  it("reports paper-out as a not-ready device", () => {
    const first = createFirstBlock({
      1: "1",
    });

    const result = parseHostStatus(
      hostStatus(
        first,
        createSecondBlock(),
      ),
    );

    expect(result).toMatchObject({
      status: false,
      reachable: true,
      ready: false,
      detailsAvailable: true,
      message: "backend.printer.paper_out",
    });

    expect(result.data?.paperOut).toBe(true);
  });

  it("reports an open print head", () => {
    const second = createSecondBlock({
      2: "1",
    });

    const result = parseHostStatus(
      hostStatus(
        createFirstBlock(),
        second,
      ),
    );

    expect(result).toMatchObject({
      status: false,
      reachable: true,
      ready: false,
      message: "backend.printer.head_open",
    });

    expect(result.data?.headOpen).toBe(true);
  });

  it("reports ribbon-out", () => {
    const second = createSecondBlock({
      3: "1",
    });

    const result = parseHostStatus(
      hostStatus(
        createFirstBlock(),
        second,
      ),
    );

    expect(result).toMatchObject({
      status: false,
      ready: false,
      message: "backend.printer.ribbon_out",
    });

    expect(result.data?.ribbonOut).toBe(true);
  });

  it("reports a paused printer", () => {
    const first = createFirstBlock({
      2: "1",
    });

    const result = parseHostStatus(
      hostStatus(
        first,
        createSecondBlock(),
      ),
    );

    expect(result).toMatchObject({
      status: false,
      ready: false,
      message: "backend.printer.paused",
    });

    expect(result.data?.paused).toBe(true);
  });

  it("reports a full buffer", () => {
    const first = createFirstBlock({
      5: "1",
    });

    const result = parseHostStatus(
      hostStatus(
        first,
        createSecondBlock(),
      ),
    );

    expect(result).toMatchObject({
      status: false,
      ready: false,
      message: "backend.printer.buffer_full",
    });

    expect(result.data?.bufferFull).toBe(true);
  });

  it("reports over-temperature", () => {
    const first = createFirstBlock({
      11: "1",
    });

    const result = parseHostStatus(
      hostStatus(
        first,
        createSecondBlock(),
      ),
    );

    expect(result).toMatchObject({
      status: false,
      ready: false,
      message:
        "backend.printer.over_temperature",
    });

    expect(
      result.data?.overTemperature,
    ).toBe(true);
  });

  it("reports under-temperature", () => {
    const first = createFirstBlock({
      10: "1",
    });

    const result = parseHostStatus(
      hostStatus(
        first,
        createSecondBlock(),
      ),
    );

    expect(result).toMatchObject({
      status: false,
      ready: false,
      message:
        "backend.printer.under_temperature",
    });

    expect(
      result.data?.underTemperature,
    ).toBe(true);
  });

  it("marks the printer not ready when multiple fault flags are active", () => {
    const first = createFirstBlock({
      1: "1",
      2: "1",
      5: "1",
      10: "1",
      11: "1",
    });

    const second = createSecondBlock({
      2: "1",
      3: "1",
    });

    const result = parseHostStatus(
      hostStatus(first, second),
    );

    expect(result.status).toBe(false);
    expect(result.ready).toBe(false);

    expect(result.data).toMatchObject({
      paperOut: true,
      paused: true,
      bufferFull: true,
      underTemperature: true,
      overTemperature: true,
      headOpen: true,
      ribbonOut: true,
    });
  });

  it("uses paper-out as the highest priority message when several faults are active", () => {
    const first = createFirstBlock({
      1: "1",
      2: "1",
      5: "1",
      11: "1",
    });

    const second = createSecondBlock({
      2: "1",
      3: "1",
    });

    const result = parseHostStatus(
      hostStatus(first, second),
    );

    expect(result.message).toBe(
      "backend.printer.paper_out",
    );
  });

  it("uses head-open before ribbon-out, paused and buffer-full", () => {
    const first = createFirstBlock({
      2: "1",
      5: "1",
    });

    const second = createSecondBlock({
      2: "1",
      3: "1",
    });

    const result = parseHostStatus(
      hostStatus(first, second),
    );

    expect(result.message).toBe(
      "backend.printer.head_open",
    );
  });

  it("uses ribbon-out before paused and buffer-full", () => {
    const first = createFirstBlock({
      2: "1",
      5: "1",
    });

    const second = createSecondBlock({
      3: "1",
    });

    const result = parseHostStatus(
      hostStatus(first, second),
    );

    expect(result.message).toBe(
      "backend.printer.ribbon_out",
    );
  });

  it("uses paused before buffer-full", () => {
    const first = createFirstBlock({
      2: "1",
      5: "1",
    });

    const result = parseHostStatus(
      hostStatus(
        first,
        createSecondBlock(),
      ),
    );

    expect(result.message).toBe(
      "backend.printer.paused",
    );
  });

  it("uses over-temperature before under-temperature", () => {
    const first = createFirstBlock({
      10: "1",
      11: "1",
    });

    const result = parseHostStatus(
      hostStatus(
        first,
        createSecondBlock(),
      ),
    );

    expect(result.message).toBe(
      "backend.printer.over_temperature",
    );
  });

  it("parses formatsInBuffer and labelsRemaining as numbers", () => {
    const first = createFirstBlock({
      4: "123",
    });

    const second = createSecondBlock({
      7: "456",
    });

    const result = parseHostStatus(
      hostStatus(first, second),
    );

    expect(
      result.data?.formatsInBuffer,
    ).toBe(123);

    expect(
      result.data?.labelsRemaining,
    ).toBe(456);
  });

  it("uses zero when queue counter values are invalid", () => {
    const first = createFirstBlock({
      4: "invalid",
    });

    const second = createSecondBlock({
      7: "invalid",
    });

    const result = parseHostStatus(
      hostStatus(first, second),
    );

    expect(
      result.data?.formatsInBuffer,
    ).toBe(0);

    expect(
      result.data?.labelsRemaining,
    ).toBe(0);

    expect(result.ready).toBe(true);
  });

  it("does not treat queue counters greater than zero as printer errors", () => {
    const first = createFirstBlock({
      4: "100",
    });

    const second = createSecondBlock({
      7: "50",
    });

    const result = parseHostStatus(
      hostStatus(first, second),
    );

    expect(result.status).toBe(true);
    expect(result.ready).toBe(true);

    expect(result.message).toBe(
      "backend.printer.ready",
    );
  });

  it("only treats flag value 1 as active", () => {
    const first = createFirstBlock({
      1: "2",
      2: "true",
      5: "-1",
      10: "yes",
      11: "01",
    });

    const second = createSecondBlock({
      2: "false",
      3: "2",
    });

    const result = parseHostStatus(
      hostStatus(first, second),
    );

    expect(result.data).toMatchObject({
      paperOut: false,
      paused: false,
      bufferFull: false,
      underTemperature: false,
      overTemperature: false,
      headOpen: false,
      ribbonOut: false,
    });

    expect(result.ready).toBe(true);
  });

  it("trims whitespace around flag values", () => {
    const first = createFirstBlock({
      1: " 1 ",
    });

    const result = parseHostStatus(
      hostStatus(
        first,
        createSecondBlock(),
      ),
    );

    expect(result.data?.paperOut).toBe(true);
    expect(result.ready).toBe(false);
  });

  it("removes STX, CR and LF characters from the response", () => {
    const first = createFirstBlock({
      4: "2",
    });

    const second = createSecondBlock({
      7: "4",
    });

    const rawStatus =
      `\x02\r\n${first.join(",")}\r\n\x03` +
      `\x02\r\n${second.join(",")}\r\n\x03` +
      `\x02PASS\x03`;

    const result = parseHostStatus(rawStatus);

    expect(result.status).toBe(true);
    expect(result.ready).toBe(true);

    expect(
      result.data?.formatsInBuffer,
    ).toBe(2);

    expect(
      result.data?.labelsRemaining,
    ).toBe(4);
  });

  it("does not require the PASS block when both status blocks are present", () => {
    const first = createFirstBlock();
    const second = createSecondBlock();

    const rawStatus =
      `\x02${first.join(",")}\x03` +
      `\x02${second.join(",")}\x03`;

    const result = parseHostStatus(rawStatus);

    expect(result).toMatchObject({
      status: true,
      reachable: true,
      ready: true,
      detailsAvailable: true,
      message: "backend.printer.ready",
    });
  });

  it("does not claim readiness for an incomplete response", () => {
    const result = parseHostStatus(
      "unexpected response",
    );

    expect(result).toEqual({
      status: false,
      reachable: true,
      ready: false,
      detailsAvailable: false,
      message:
        "backend.printer.status_unavailable",
      rawError: "unexpected response",
    });
  });

  it("returns status unavailable for an empty response", () => {
    const result = parseHostStatus("");

    expect(result).toEqual({
      status: false,
      reachable: true,
      ready: false,
      detailsAvailable: false,
      message:
        "backend.printer.status_unavailable",
      rawError: "",
    });
  });

  it("limits rawError to 500 characters for an incomplete response", () => {
    const rawStatus = "X".repeat(1000);

    const result = parseHostStatus(rawStatus);

    expect(result.status).toBe(false);

    expect(result.message).toBe(
      "backend.printer.status_unavailable",
    );

    expect(result.rawError).toHaveLength(500);

    expect(result.rawError).toBe(
      "X".repeat(500),
    );
  });
});
