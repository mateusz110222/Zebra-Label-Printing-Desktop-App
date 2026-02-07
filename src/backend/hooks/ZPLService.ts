import GetJulianDate from "./GetJulianDate";
import { calculateSerial, fillZplTemplate } from "./LabelProcessor";
import { getDatabase } from "../DatabaseConfig";
import { Pool, RowDataPacket } from "mysql2/promise";
import { app } from "electron";
import path from "node:path";
import { readFile } from "node:fs/promises";

interface Part {
  Part_Number: string;
  Serial_Prefix: string;
  Label_Format: string;
  Part_Description: string;
}

interface GenerateZPLResult {
  status: boolean;
  message: string;
  data?: string;
  rawError?: string;
}

async function getZplTemplate(formatName: string): Promise<GenerateZPLResult> {
  let templatesPath: string, rawTemplate: string;
  try {
    if (app.isPackaged) {
      templatesPath = path.join(process.resourcesPath, "zpl_templates");
    } else {
      templatesPath = path.join(app.getAppPath(), "zpl_templates");
    }
    const fullPath = path.join(templatesPath, `${formatName}.zpl`);
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

export async function generatePrintZPL(
  part: Part,
  quantity: number = 1,
): Promise<GenerateZPLResult> {
  try {
    const templateResult = await getZplTemplate(part.Label_Format);
    if (!templateResult.status) {
      return templateResult;
    }
    const rawTemplate = templateResult.data!;
    const pool = getDbPool();

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT f.maxId, f.next, st.name as type_name
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

    const { maxId, next, type_name } = rows[0];

    if (next + quantity - 1 > maxId) {
      return {
        status: false,
        message: "backend.print.serial_range_exceeded",
        rawError: `Remaining: ${maxId - next + 1}`,
      };
    }

    let fullBatchZpl = "";

    for (let i = 0; i < quantity; i++) {
      const currentSerial = calculateSerial(next, i, type_name);
      const printData = {
        PARTNUM: part.Part_Number,
        SERIALPREFIX: part.Serial_Prefix,
        SERIALNUM1: currentSerial,
        JDATE: GetJulianDate(""),
        NUMCOPIES: 1,
        DESCRIPTION: part.Part_Description,
        ID_LABEL: Math.random().toString(36).substring(2, 7).toUpperCase(),
      };
      fullBatchZpl += fillZplTemplate(rawTemplate, printData);
    }

    const nextValueForDb = calculateSerial(next, quantity, type_name);
    await pool.query("UPDATE family SET next = ? WHERE name = ?", [
      nextValueForDb,
      part.Part_Number,
    ]);

    return {
      status: true,
      message: "backend.print.print_success",
      data: fullBatchZpl,
    };
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
  try {
    const templateResult = await getZplTemplate(part.Label_Format);
    if (!templateResult.status) {
      return templateResult;
    }
    const rawTemplate = templateResult.data!;
    const pool = getDbPool();

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT st.name as type_name, f.next
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

    const { type_name, next } = rows[0];
    let fullBatchZpl = "";

    // If serialNumber is "0" (placeholder), use next serial from DB instead
    const baseSerial = serialNumber === "0" ? String(next) : serialNumber;

    for (let i = 0; i < quantity; i++) {
      const currentSerial = calculateSerial(baseSerial, i, type_name);
      const printData = {
        PARTNUM: part.Part_Number,
        SERIALPREFIX: part.Serial_Prefix,
        SERIALNUM1: currentSerial,
        JDATE: GetJulianDate(date),
        NUMCOPIES: 1,
        DESCRIPTION: part.Part_Description,
        ID_LABEL: Math.random().toString(36).substring(2, 7).toUpperCase(),
      };
      fullBatchZpl += fillZplTemplate(rawTemplate, printData);
    }

    return {
      status: true,
      message: "backend.print.reprint_success",
      data: fullBatchZpl,
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
): Promise<GenerateZPLResult> {
  try {
    const templateResult = await getZplTemplate(part.Label_Format);
    if (!templateResult.status) {
      return templateResult;
    }
    const rawTemplate = templateResult.data!;
    const pool = getDbPool();

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT f.next FROM family f WHERE f.name = ?`,
      [part.Part_Number],
    );

    if (!rows || rows.length === 0) {
      return {
        status: false,
        message: "backend.db.part_not_found",
        rawError: part.Part_Number,
      };
    }

    const { next } = rows[0];

    const printData = {
      PARTNUM: part.Part_Number,
      SERIALPREFIX: part.Serial_Prefix,
      SERIALNUM1: next,
      JDATE: GetJulianDate(""),
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
