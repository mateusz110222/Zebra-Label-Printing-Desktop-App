import { forwardRef, type InputHTMLAttributes, useCallback, useImperativeHandle, useRef } from "react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import { computeNextStepperValue } from "@renderer/utils/numberInputUtils";

export interface NumberInputProps extends InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
  stepperClassName?: string;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput(
    {
      containerClassName = "relative w-full",
      stepperClassName,
      className = "",
      disabled,
      readOnly,
      step,
      min,
      max,
      ...props
    },
    forwardedRef,
  ) {
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(
      forwardedRef,
      () => inputRef.current as HTMLInputElement,
    );

    const changeValue = useCallback((delta: number) => {
      const input = inputRef.current;
      if (!input || input.disabled || input.readOnly) return;

      const nextVal = computeNextStepperValue({
        currentValue: input.value,
        delta,
        step: input.step !== "" ? Number(input.step) : 1,
        min: input.min !== "" ? Number(input.min) : -Infinity,
        max: input.max !== "" ? Number(input.max) : Infinity,
      });

      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      nativeSetter?.call(input, String(nextVal));

      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, []);

    const isActionDisabled = Boolean(disabled || readOnly);

    return (
      <div className={containerClassName}>
        <input
          {...props}
          ref={inputRef}
          type="number"
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          readOnly={readOnly}
          className={`${className} pr-9`}
        />
        <div
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 shadow-sm select-none pointer-events-auto h-[calc(100%-6px)] max-h-8.5 ${
            stepperClassName ?? ""
          }`}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label="Zwiększ"
            disabled={isActionDisabled}
            onClick={() => changeValue(1)}
            className="flex-1 w-6 flex items-center justify-center rounded text-slate-600 dark:text-slate-200 hover:bg-indigo-500/20 hover:text-indigo-600 dark:hover:text-indigo-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <LuChevronUp size={13} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Zmniejsz"
            disabled={isActionDisabled}
            onClick={() => changeValue(-1)}
            className="flex-1 w-6 flex items-center justify-center rounded text-slate-600 dark:text-slate-200 hover:bg-indigo-500/20 hover:text-indigo-600 dark:hover:text-indigo-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <LuChevronDown size={13} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    );
  },
);

NumberInput.displayName = "NumberInput";

export default NumberInput;
