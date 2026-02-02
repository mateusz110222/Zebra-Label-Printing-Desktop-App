import React from "react";

interface PrintViewInput extends React.InputHTMLAttributes<HTMLInputElement> {
  text: string;
}

export default function PrintViewInput({
  text,
  className,
  ...props
}: PrintViewInput): React.JSX.Element {
  const defaultClasses =
    "block w-full rounded-md border-0 p-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 bg-white focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6";
  return (
    <div>
      <label className="block text-sm font-medium leading-6 text-slate-600 mb-1">
        {text}
      </label>
      <input {...props} className={`${defaultClasses} ${className || ""}`} />
    </div>
  );
}
