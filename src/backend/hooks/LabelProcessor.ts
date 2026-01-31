export const fillZplTemplate = (template: string, data: Record<string, string | number>) => {
  if (!template) return "";
  let zpl = template;
  Object.keys(data).forEach((key) => {
    zpl = zpl.replaceAll(`*${key}*`, String(data[key]));
  });
  return zpl;
};

export const calculateSerial = (
  startValue: string,
  increment: number,
  typeName: string
): string => {
  const targetLength = startValue.length;
  if (typeName === "decimal") {
    const num = parseInt(startValue, 10);

    if (isNaN(num)) throw new Error(`Wartość '${startValue}' nie jest liczbą, a typ to decimal!`);

    const calculated = num + increment;
    return calculated.toString().padStart(targetLength, "0");
  } else if (typeName === "base34") {
    const num = parseInt(startValue, 36);

    const calculated = num + increment;
    return calculated.toString(36).toUpperCase().padStart(targetLength, "0");
  }

  throw new Error(`Nieobsługiwany typ numeracji: ${typeName}`);
};
