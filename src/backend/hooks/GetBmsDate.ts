export default function GetBmsDate(date: string | undefined): string {
  const now = date && date.trim() !== "" ? new Date(date) : new Date();

  if (isNaN(now.getTime())) {
    return GetBmsDate(undefined);
  }

  const monthCodes = "ABCDEFGHIJKL";

  const day = now.getDate().toString().padStart(2, "0");
  const month = monthCodes[now.getMonth()];
  const year = now.getFullYear().toString().slice(-1);

  return `${day}${month}${year}`;
}
