import { beforeEach, describe, expect, it, vi } from "vitest";
import { findPrinterForLabelFormat } from "../printer/PrinterConfigs";

const mocks = vi.hoisted(() => ({
  storeGet: vi.fn(),
}));

vi.mock("../utils/store", () => ({
  store: { get: mocks.storeGet },
}));

const defaultPrinter = {
  name: "LINE_A",
  type: "IP",
  ip: "10.0.0.10",
  port: 9100,
};

const secondPrinter = {
  name: "LINE_B",
  type: "COM",
  comPort: "COM8",
  baudRate: 115200,
};

describe("printer format routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the active printer for every format in single mode", () => {
    mocks.storeGet.mockImplementation((key: string) =>
      key === "printerRouting"
        ? { mode: "single", formatAssignments: {} }
        : defaultPrinter,
    );

    expect(findPrinterForLabelFormat("16x13")).toEqual({
      status: true,
      printer: defaultPrinter,
    });
  });

  it("resolves a format assignment case-insensitively in multiple mode", () => {
    mocks.storeGet.mockImplementation((key: string) => {
      if (key === "printerRouting") {
        return {
          mode: "multiple",
          formatAssignments: { "16X13": "LINE_B" },
        };
      }
      if (key === "printers") return [defaultPrinter, secondPrinter];
      return defaultPrinter;
    });

    expect(findPrinterForLabelFormat("16x13")).toEqual({
      status: true,
      printer: secondPrinter,
    });
  });

  it("blocks an unassigned format in multiple mode", () => {
    mocks.storeGet.mockImplementation((key: string) =>
      key === "printerRouting"
        ? { mode: "multiple", formatAssignments: {} }
        : defaultPrinter,
    );

    expect(findPrinterForLabelFormat("9x57")).toEqual({
      status: false,
      message: "backend.printer.format_not_assigned",
      rawError: "9x57",
    });
  });
});
