export const fillZplTemplate = (
  template: string,
  data: Record<string, string | number>,
): string => {
  if (!template) return "";
  let zpl = template;
  Object.keys(data).forEach((key) => {
    zpl = zpl.replaceAll(`*${key}*`, String(data[key]));
  });
  return zpl;
};

export const BASE34_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export const parseSerialValue = (value: string, typeName: string): bigint => {
  const normalized = value.trim().toUpperCase();
  const normalizedType = typeName.trim().toLowerCase();

  if (normalizedType === "decimal") {
    if (!/^\d+$/.test(normalized)) {
      throw new Error("backend.print.invalid_decimal");
    }
    return BigInt(normalized);
  }

  if (normalizedType === "base34") {
    if (!normalized) throw new Error("backend.print.invalid_base34");
    let result = 0n;
    for (const character of normalized) {
      const digit = BASE34_ALPHABET.indexOf(character);
      if (digit < 0) throw new Error("backend.print.invalid_base34");
      result = result * 34n + BigInt(digit);
    }
    return result;
  }

  throw new Error("backend.print.unsupported_type");
};

const encodeBase34 = (value: bigint): string => {
  if (value === 0n) return "0";
  let remaining = value;
  let result = "";
  while (remaining > 0n) {
    result = BASE34_ALPHABET[Number(remaining % 34n)] + result;
    remaining /= 34n;
  }
  return result;
};

export const calculateSerialCounter = (
  startValue: string,
  increment: number,
  typeName: string,
): string => {
  const targetLength = startValue.length;
  const normalizedType = typeName.trim().toLowerCase();
  if (!Number.isInteger(increment) || increment < 0) {
    throw new Error("backend.print.invalid_increment");
  }

  const calculated = parseSerialValue(startValue, typeName) + BigInt(increment);
  let result: string;

  if (normalizedType === "decimal") {
    result = calculated.toString();
  } else if (normalizedType === "base34") {
    result = encodeBase34(calculated);
  } else {
    throw new Error("backend.print.unsupported_type");
  }

  return result.padStart(targetLength, "0");
};

export const calculateSerial = (
  startValue: string,
  increment: number,
  typeName: string,
): string => {
  const result = calculateSerialCounter(startValue, increment, typeName);
  if (result.length > startValue.length) {
    throw new Error("backend.print.serial_range_exceeded");
  }
  return result;
};
