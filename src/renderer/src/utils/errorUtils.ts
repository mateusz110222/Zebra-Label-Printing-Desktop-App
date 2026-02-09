export const extractError = (
  err: unknown,
): { message: string; details?: string } => {
  const message = err instanceof Error ? err.message : String(err);
  const details =
    typeof err === "object" && err !== null && "rawError" in err
      ? (err as { rawError: string }).rawError
      : undefined;
  return { message, details };
};
