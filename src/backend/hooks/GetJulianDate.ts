export default function GetJulianDate(date: string | undefined): string {
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
    return GetJulianDate(undefined);
  }

  const fullYear = now.getFullYear();
  const calendarDayUtc = Date.UTC(fullYear, now.getMonth(), now.getDate());
  const yearStartUtc = Date.UTC(fullYear, 0, 0);
  const day = Math.floor((calendarDayUtc - yearStartUtc) / 86_400_000);
  const year = fullYear.toString().slice(-2);
  return `${year}${day.toString().padStart(3, "0")}`;
}
