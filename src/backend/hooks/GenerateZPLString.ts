import GetJulianDate from "./GetJulianDate";
import { calculateSerial, fillZplTemplate } from "./LabelProcessor";
import { getDatabase } from "../utils/DatabaseConfig";

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

export default async function (
  part: Part,
  quantity: number = 1,
  mode: "print" | "preview",
): Promise<GenerateZPLResult> {
  const formatName = part.Label_Format;
  let rawTemplate = "";

  try {
    const module = await import(
      `../../renderer/src/zpl_templates/${formatName}.ts`
    );
    rawTemplate = module.default || Object.values(module)[0];

    if (!rawTemplate) {
      return { status: false, message: "backend.print.template_empty" };
    }
  } catch (error) {
    const errMsg =
      error instanceof Error
        ? error.message
        : String(error) || "backend.config.save_fail";
    return {
      status: false,
      message: "backend.print.template_not_found",
      rawError: `${formatName} (${errMsg})`,
    };
  }

  const pool = getDatabase();
  if (!pool) {
    return { status: false, message: "backend.db.not_initialized" };
  }

  try {
    const [rows] = await pool.query(
      `SELECT f.maxId, f.next, st.name as type_name
       FROM family f
              LEFT JOIN type st ON f.type_fk = st.pk
       WHERE f.name = ?`,
      [part.Part_Number],
    );

    if (!rows || (rows as []).length === 0) {
      return {
        status: false,
        message: "backend.db.part_not_found",
        rawError: part.Part_Number,
      };
    }

    const { maxId, next, type_name } = rows[0];

    if (mode === "preview") {
      const printData = {
        PARTNUM: part.Part_Number,
        SERIALPREFIX: part.Serial_Prefix,
        SERIALNUM1: next,
        JDATE: GetJulianDate(),
        NUMCOPIES: 1,
        DESCRIPTION: part.Part_Description,
      };
      return {
        status: true,
        message: "backend.print.preview_success",
        data: fillZplTemplate(rawTemplate, printData),
      };
    }

    if (mode === "print") {
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
          JDATE: GetJulianDate(),
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
    }

    return {
      status: false,
      message: "backend.print.unknown_mode",
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (errorMsg.startsWith("backend.")) {
      return {
        status: false,
        message: errorMsg,
      };
    }

    return {
      status: false,
      message: "backend.db.error",
      rawError: errorMsg,
    };
  }
}
