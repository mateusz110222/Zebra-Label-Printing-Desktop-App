import GetJulianDate from "./GetJulianDate";
import GetCmcJulianDate from "./GetCmcJulianDate";
import { calculateSerial, calculateSerialCounter, fillZplTemplate, parseSerialValue } from "./LabelProcessor";
import { getDatabase } from "../DatabaseConfig";
import { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import GetBmsDate from "./GetBmsDate";
import { getTemplatesPath, normalizeTemplateFileName } from "../TemplatePaths";
import { createHash } from "node:crypto";

interface Part {
  Part_Number: string;
  Serial_Prefix: string;
  Label_Format: string;
  Part_Description: string;
}

interface FamilyRow extends RowDataPacket {
  pk: number;
  maxId: string | number;
  next: string | number;
  type_name: string;
}

interface EngineRow extends RowDataPacket {
  ENGINE: string | null;
}

export interface GeneratedLabelMetadata {
  serialNumber: string;
  julianDate: string;
  bmsDate: string;
  zplSha256: string;
}

interface GenerateZPLResult {
  status: boolean;
  message: string;
  data?: string;
  labels?: GeneratedLabelMetadata[];
  rawError?: string;
}

const hashZpl = (zpl: string): string =>
  createHash("sha256").update(zpl, "utf8").digest("hex");

const isValidIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

const invalidDataResult = (
  message: string,
  rawError?: string,
): GenerateZPLResult => ({
  status: false,
  message,
  rawError,
});

export async function getZplTemplate(
  formatName: string,
): Promise<GenerateZPLResult> {
  let rawTemplate: string;
  try {
    const fileName = normalizeTemplateFileName(formatName);
    if (!fileName) {
      return {
        status: false,
        message: "backend.labels.INVALID_TEMPLATE_NAME",
      };
    }

    const fullPath = path.join(getTemplatesPath(), fileName);
    rawTemplate = await readFile(fullPath, "utf-8");
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      status: false,
      message: "backend.print.template_not_found",
      rawError: `${formatName} (${errMsg})`,
    };
  }
  return { status: true, message: "OK", data: rawTemplate };
}

function getDbPool(): Pool {
  const pool = getDatabase();
  if (!pool) {
    throw new Error("backend.db.not_initialized");
  }
  return pool;
}

export async function SaveZplTemplate(
  formatName: string,
  data: string,
): Promise<GenerateZPLResult> {
  try {
    const fileName = normalizeTemplateFileName(formatName);
    if (!fileName) {
      return {
        status: false,
        message: "backend.labels.INVALID_TEMPLATE_NAME",
      };
    }

    const fullPath = path.join(getTemplatesPath(), fileName);

    await writeFile(fullPath, data);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      status: false,
      message: "backend.print.template_not_found",
      rawError: `${formatName} (${errMsg})`,
    };
  }
  return { status: true, message: "OK" };
}

export async function generatePrintZPL(
  part: Part,
  quantity: number = 1,
): Promise<GenerateZPLResult> {
  try {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return {
        status: false,
        message: "backend.print.invalid_data",
        rawError: `Invalid quantity: ${quantity}`,
      };
    }

    const templateResult = await getZplTemplate(part.Label_Format);
    if (!templateResult.status) {
      return templateResult;
    }
    const rawTemplate = templateResult.data!;
    const pool = getDbPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [[engine]] = await connection.query<EngineRow[]>(
        `SELECT ENGINE
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'family'`,
      );

      if (engine?.ENGINE?.toUpperCase() !== "INNODB") {
        await connection.rollback();
        return {
          status: false,
          message: "backend.db.error",
          rawError: "The family table must use the InnoDB engine",
        };
      }

      const [rows] = await connection.query<FamilyRow[]>(
        `SELECT f.pk, f.maxId, f.next, st.name as type_name
         FROM family f
                LEFT JOIN type st ON f.type_fk = st.pk
         WHERE f.name = ?
           FOR UPDATE`,
        [part.Part_Number],
      );

      if (!rows || rows.length === 0) {
        await connection.rollback();
        return {
          status: false,
          message: "backend.db.part_not_found",
          rawError: part.Part_Number,
        };
      }

      if (rows.length !== 1) {
        await connection.rollback();
        return {
          status: false,
          message: "backend.db.error",
          rawError: `Multiple family rows found for ${part.Part_Number}`,
        };
      }

      const { pk, maxId, next, type_name } = rows[0];
      const currentNext = String(next);
      const serialType = String(type_name);
      const numNext = parseSerialValue(currentNext, serialType);
      const numMaxId = parseSerialValue(String(maxId), serialType);

      if (numNext + BigInt(quantity) - 1n > numMaxId) {
        await connection.rollback();
        const remaining = numNext > numMaxId ? 0n : numMaxId - numNext + 1n;
        return {
          status: false,
          message: "backend.print.serial_range_exceeded",
          rawError: `Remaining: ${remaining}`,
        };
      }

      let fullBatchZpl = "";
      const labels: GeneratedLabelMetadata[] = [];

      for (let i = 0; i < quantity; i++) {
        const currentSerial = calculateSerial(currentNext, i, serialType);
        const julianDate = GetJulianDate("");
        const bmsDate = GetBmsDate("");
        const labelId = Math.random()
          .toString(36)
          .substring(2, 7)
          .toUpperCase();
        const printData = {
          PARTNUM: part.Part_Number,
          SERIALPREFIX: part.Serial_Prefix,
          SERIALNUM1: currentSerial,
          JDATE: julianDate,
          CMCJDATE: GetCmcJulianDate(julianDate),
          BMSCSTDATEF: bmsDate,
          NUMCOPIES: 1,
          DESCRIPTION: part.Part_Description,
          ID_LABEL: labelId,
        };
        const labelZpl = fillZplTemplate(rawTemplate, printData);
        fullBatchZpl += labelZpl;
        labels.push({
          serialNumber: currentSerial,
          julianDate,
          bmsDate,
          zplSha256: hashZpl(labelZpl),
        });
      }

      const nextValueForDb = calculateSerialCounter(
        currentNext,
        quantity,
        serialType,
      );
      const [updateResult] = await connection.query<ResultSetHeader>(
        "UPDATE family SET next = ? WHERE pk = ?",
        [nextValueForDb, pk],
      );

      if (updateResult.affectedRows !== 1) {
        throw new Error(
          `Serial counter update affected ${updateResult.affectedRows} rows for ${part.Part_Number}`,
        );
      }

      await connection.commit();

      return {
        status: true,
        message: "backend.print.print_success",
        data: fullBatchZpl,
        labels,
      };
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Serial reservation rollback failed:", rollbackError);
      }
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.startsWith("backend.")) {
      return { status: false, message: errorMsg };
    }
    return { status: false, message: "backend.db.error", rawError: errorMsg };
  }
}

export async function generateReprintZPL(
  part: Part,
  date: string,
  serialNumber: string,
  quantity: number = 1,
): Promise<GenerateZPLResult> {
  return generateReprintZPLInternal(part, date, serialNumber, quantity, false);
}

export async function generateReprintPreviewZPL(
  part: Part,
  date: string,
  serialNumber: string,
): Promise<GenerateZPLResult> {
  return generateReprintZPLInternal(
    part,
    date,
    typeof serialNumber === "string" ? serialNumber.trim() || "0" : "",
    1,
    true,
  );
}

async function generateReprintZPLInternal(
  part: Part,
  date: string,
  serialNumber: string,
  quantity: number,
  allowCurrentNextForPreview: boolean,
): Promise<GenerateZPLResult> {
  try {
    if (
      !part ||
      typeof part.Part_Number !== "string" ||
      typeof part.Serial_Prefix !== "string" ||
      typeof part.Label_Format !== "string" ||
      typeof part.Part_Description !== "string"
    ) {
      return invalidDataResult(
        "backend.print.invalid_part_data",
      );
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return invalidDataResult(
        "backend.print.invalid_quantity",
        `Invalid quantity: ${quantity}`,
      );
    }

    if (typeof date !== "string") {
      return invalidDataResult(
        "backend.print.date_required",
      );
    }
    const normalizedDate = date.trim();
    if (!isValidIsoDate(normalizedDate)) {
      return invalidDataResult(
        "backend.print.invalid_date",
        `Invalid date: ${date}`,
      );
    }

    if (typeof serialNumber !== "string") {
      return invalidDataResult(
        "backend.print.serial_required",
      );
    }

    const requestedSerial = serialNumber.trim().toUpperCase();
    if (!requestedSerial) {
      return invalidDataResult(
        "backend.print.serial_required",
      );
    }

    if (requestedSerial === "0" && !allowCurrentNextForPreview) {
      return invalidDataResult(
        "backend.print.serial_zero_reprint_not_allowed",
      );
    }

    const pool = getDbPool();

    const [rows] = await pool.query<FamilyRow[]>(
      `SELECT f.pk, f.maxId, f.next, st.name as type_name
       FROM family f
              LEFT JOIN type st ON f.type_fk = st.pk
       WHERE f.name = ?`,
      [part.Part_Number],
    );

    if (!rows || rows.length === 0) {
      return {
        status: false,
        message: "backend.db.part_not_found",
        rawError: part.Part_Number,
      };
    }

    if (rows.length !== 1) {
      return {
        status: false,
        message: "backend.db.error",
        rawError: `Multiple family rows found for ${part.Part_Number}`,
      };
    }

    const { type_name, next, maxId } = rows[0];
    const maxSerial = String(maxId).trim().toUpperCase();
    const baseSerial =
      requestedSerial === "0"
        ? String(next).trim().toUpperCase()
        : requestedSerial;

    const numericMax = parseSerialValue(maxSerial, type_name);
    const numericNext = parseSerialValue(String(next), type_name);
    if (
      requestedSerial === "0" &&
      parseSerialValue(baseSerial, type_name) > numericMax
    ) {
      return {
        status: false,
        message: "backend.print.serial_range_exceeded",
        rawError: "The serial range is exhausted",
      };
    }

    if (!baseSerial || baseSerial.length !== maxSerial.length) {
      return invalidDataResult(
        "backend.print.invalid_serial_length",
        `Expected length: ${maxSerial.length}`,
      );
    }

    const numericBase = parseSerialValue(baseSerial, type_name);
    if (numericBase + BigInt(quantity) - 1n > numericMax) {
      return {
        status: false,
        message: "backend.print.serial_range_exceeded",
        rawError: "The requested serial range is outside family.maxId",
      };
    }
    if (
      !allowCurrentNextForPreview &&
      numericBase + BigInt(quantity) - 1n >= numericNext
    ) {
      return invalidDataResult(
        "backend.print.reprint_serial_not_reserved",
      );
    }

    const templateResult = await getZplTemplate(part.Label_Format);
    if (!templateResult.status) {
      return templateResult;
    }
    const rawTemplate = templateResult.data!;
    let fullBatchZpl = "";
    const labels: GeneratedLabelMetadata[] = [];

    for (let i = 0; i < quantity; i++) {
      const currentSerial = calculateSerial(baseSerial, i, type_name);
      const julianDate = GetJulianDate(normalizedDate);
      const bmsDate = GetBmsDate(normalizedDate);
      const labelId = Math.random().toString(36).substring(2, 7).toUpperCase();
      const printData = {
        PARTNUM: part.Part_Number,
        SERIALPREFIX: part.Serial_Prefix,
        SERIALNUM1: currentSerial,
        JDATE: julianDate,
        CMCJDATE: GetCmcJulianDate(julianDate),
        BMSCSTDATEF: bmsDate,
        NUMCOPIES: 1,
        DESCRIPTION: part.Part_Description,
        ID_LABEL: labelId,
      };
      const labelZpl = fillZplTemplate(rawTemplate, printData);
      fullBatchZpl += labelZpl;
      labels.push({
        serialNumber: currentSerial,
        julianDate,
        bmsDate,
        zplSha256: hashZpl(labelZpl),
      });
    }

    return {
      status: true,
      message: "backend.print.reprint_success",
      data: fullBatchZpl,
      labels,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.startsWith("backend.")) {
      return { status: false, message: errorMsg };
    }
    return { status: false, message: "backend.db.error", rawError: errorMsg };
  }
}

export async function generatePreviewZPL(
  part: Part,
  templateOverride?: string,
): Promise<GenerateZPLResult> {
  try {
    let rawTemplate: string;
    if (templateOverride?.trim()) {
      rawTemplate = templateOverride;
    } else {
      const templateResult = await getZplTemplate(part.Label_Format);
      if (!templateResult.status) {
        return templateResult;
      }
      rawTemplate = templateResult.data!;
    }
    const pool = getDbPool();

    const [rows] = await pool.query<FamilyRow[]>(
      `SELECT f.pk, f.next, f.maxId, st.name AS type_name
       FROM family f
              LEFT JOIN type st ON f.type_fk = st.pk
       WHERE f.name = ?`,
      [part.Part_Number],
    );

    if (!rows || rows.length === 0) {
      return {
        status: false,
        message: "backend.db.part_not_found",
        rawError: part.Part_Number,
      };
    }

    if (rows.length !== 1) {
      return {
        status: false,
        message: "backend.db.error",
        rawError: `Multiple family rows found for ${part.Part_Number}`,
      };
    }

    const { next, maxId, type_name } = rows[0];
    if (
      parseSerialValue(String(next), type_name) >
      parseSerialValue(String(maxId), type_name)
    ) {
      return {
        status: false,
        message: "backend.print.serial_range_exceeded",
        rawError: "The serial range is exhausted",
      };
    }

    const julianDate = GetJulianDate("");
    const printData = {
      PARTNUM: part.Part_Number,
      SERIALPREFIX: part.Serial_Prefix,
      SERIALNUM1: next,
      JDATE: julianDate,
      CMCJDATE: GetCmcJulianDate(julianDate),
      BMSCSTDATEF: GetBmsDate(""),
      NUMCOPIES: 1,
      DESCRIPTION: part.Part_Description,
    };

    return {
      status: true,
      message: "backend.print.preview_success",
      data: fillZplTemplate(rawTemplate, printData),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.startsWith("backend.")) {
      return { status: false, message: errorMsg };
    }
    return { status: false, message: "backend.db.error", rawError: errorMsg };
  }
}
