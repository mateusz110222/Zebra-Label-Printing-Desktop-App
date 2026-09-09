export function computeNextStepperValue({
  currentValue,
  delta,
  step = 1,
  min = -Infinity,
  max = Infinity,
}: {
  currentValue: string | number;
  delta: number;
  step?: number;
  min?: number;
  max?: number;
}): number {
  const currentVal = currentValue === "" ? 0 : Number(currentValue);
  const stepNum = Number(step) || 1;
  const minNum = Number.isFinite(min) ? min : -Infinity;
  const maxNum = Number.isFinite(max) ? max : Infinity;

  let nextVal = Number.isNaN(currentVal)
    ? minNum !== -Infinity
      ? minNum
      : 0
    : currentVal + delta * stepNum;

  if (nextVal < minNum) nextVal = minNum;
  if (nextVal > maxNum) nextVal = maxNum;

  return nextVal;
}
