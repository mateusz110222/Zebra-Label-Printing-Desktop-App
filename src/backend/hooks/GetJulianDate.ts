export default function GetJulianDate(date: string | undefined): string {
  const now = date && date.trim() !== "" ? new Date(date) : new Date();

  if (isNaN(now.getTime())) {
    return GetJulianDate(undefined);
  }

  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const day = Math.floor(diff / oneDay);
  const year = now.getFullYear().toString().slice(-2);
  return `${year}${day.toString().padStart(3, "0")}`;
}
