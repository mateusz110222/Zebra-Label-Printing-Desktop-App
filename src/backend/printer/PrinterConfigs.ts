import {
  type PrinterConfig,
  type PrinterRoutingConfig,
  store,
} from "../utils/store";

const normalizeKey = (value: string): string =>
  value.trim().toLocaleUpperCase();

export const getPrinterTarget = (printer: PrinterConfig): string =>
  printer.type === "IP"
    ? `${printer.ip || "?"}:${printer.port || "?"}`
    : printer.type === "COM"
      ? printer.comPort || "?"
      : printer.usbPrinterName || "?";

export const getPrinterName = (printer: PrinterConfig): string =>
  printer.name?.trim() || getPrinterTarget(printer);

const isPrinterConfigured = (printer: PrinterConfig): boolean =>
  printer.type === "IP"
    ? Boolean(printer.ip?.trim() && printer.port)
    : printer.type === "COM"
      ? Boolean(printer.comPort?.trim())
      : Boolean(printer.usbPrinterName?.trim());

export const getConfiguredPrinters = (): PrinterConfig[] => {
  const configured = store.get("printers") as PrinterConfig[] | undefined;

  if (Array.isArray(configured) && configured.length > 0) {
    const validPrinters = configured.filter(isPrinterConfigured);
    if (validPrinters.length > 0) return validPrinters;
  }

  const legacy = store.get("printer") as PrinterConfig | undefined;
  return legacy && isPrinterConfigured(legacy) ? [legacy] : [];
};

export const findPrinterByReference = (
  reference: string | undefined,
): PrinterConfig | undefined => {
  const printers = getConfiguredPrinters();
  const requested = reference?.trim();

  if (!requested) {
    return (store.get("printer") as PrinterConfig | undefined) || printers[0];
  }

  const key = normalizeKey(requested);

  return printers.find((printer) => {
    const aliases = [
      getPrinterName(printer),
      getPrinterTarget(printer),
      printer.ip || "",
      printer.comPort || "",
      printer.usbPrinterName || "",
    ];

    return aliases.some((alias) => alias && normalizeKey(alias) === key);
  });
};

export const getPrinterRoutingConfig = (): PrinterRoutingConfig => {
  const value = store.get("printerRouting") as PrinterRoutingConfig | undefined;

  if (
    !value ||
    (value.mode !== "single" && value.mode !== "multiple") ||
    !value.formatAssignments ||
    typeof value.formatAssignments !== "object" ||
    Array.isArray(value.formatAssignments)
  ) {
    return { mode: "single", formatAssignments: {} };
  }

  return value;
};

export const findPrinterForLabelFormat = (
  labelFormat: string,
):
  | { status: true; printer: PrinterConfig }
  | { status: false; message: string; rawError?: string } => {
  const routing = getPrinterRoutingConfig();

  if (routing.mode === "single") {
    const printer = store.get("printer") as PrinterConfig | undefined;
    return printer && isPrinterConfigured(printer)
      ? { status: true, printer }
      : { status: false, message: "backend.printer.no_config" };
  }

  const normalizedFormat = normalizeKey(labelFormat);
  const assignment = Object.entries(routing.formatAssignments).find(
    ([format]) => normalizeKey(format) === normalizedFormat,
  )?.[1];

  if (!assignment?.trim()) {
    return {
      status: false,
      message: "backend.printer.format_not_assigned",
      rawError: labelFormat,
    };
  }

  const printer = findPrinterByReference(assignment);
  return printer
    ? { status: true, printer }
    : {
        status: false,
        message: "backend.printer.assigned_not_found",
        rawError: assignment,
      };
};

export const upsertPrinter = (
  printers: PrinterConfig[],
  printer: PrinterConfig,
): PrinterConfig[] => {
  const name = getPrinterName(printer);
  const normalized: PrinterConfig = { ...printer, name };
  const key = normalizeKey(name);
  const index = printers.findIndex(
    (candidate) => normalizeKey(getPrinterName(candidate)) === key,
  );

  if (index === -1) return [...printers, normalized];

  return printers.map((candidate, candidateIndex) =>
    candidateIndex === index ? normalized : candidate,
  );
};
