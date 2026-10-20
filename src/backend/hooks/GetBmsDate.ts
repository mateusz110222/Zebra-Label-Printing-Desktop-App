export default function GetBmsDate(date: string | undefined): string {
  let now: Date;
  const normalizedDate = date?.trim();

  if (normalizedDate && /^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    const [year, month, day] = normalizedDate.split("-").map(Number);
    now = new Date(year, month - 1, day, 12);
    if (
      now.getFullYear() !== year ||
      now.getMonth() !== month - 1 ||
      now.getDate() !== day
    ) {
      now = new Date();
    }
  } else {
    now = normalizedDate ? new Date(normalizedDate) : new Date();
  }

  if (isNaN(now.getTime())) {
    return GetBmsDate(undefined);
  }

  const monthCodes = "ABCDEFGHIJKL";

  const day = now.getDate().toString().padStart(2, "0");
  const month = monthCodes[now.getMonth()];
  const year = now.getFullYear().toString().slice(-1);

  return `${day}${month}${year}`;
}
