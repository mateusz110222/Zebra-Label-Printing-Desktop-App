/** Each label is serialized separately (^PQ1). In cutter mode only the final
 * label may cut; ^XB suppresses cutting/backfeed for the preceding formats. */
export function applyBatchCutting(
  zpl: string,
  position: number,
  quantity: number,
): string {
  if (!/\^MMC(?=[,^~\s]|$)/i.test(zpl)) return zpl;
  // The template's pause/cut count cannot span separate serialized formats.
  // Disable that count and its pause; the batch boundary controls cutting.
  let result = zpl.replace(
    /\^PQ([^\x5e~\r\n]*)/gi,
    (_command, parameters: string) => {
      const values = parameters.trim().split(",");
      values[1] = "0";
      if (!values[2]) values[2] = "0";
      values[3] = "Y";
      return `^PQ${values.join(",")}`;
    },
  );
  result = result.replace(/\^XB/gi, "");
  if (position < quantity - 1) {
    const end = result.toUpperCase().lastIndexOf("^XZ");
    if (end >= 0) result = `${result.slice(0, end)}^XB${result.slice(end)}`;
  }
  return result;
}
