import { StylesConfig } from "react-select";

interface PartOption {
  value: string;
  label: string;
}

const isDarkMode = (): boolean => {
  if (typeof document !== "undefined") {
    return document.documentElement.classList.contains("dark");
  }
  return false;
};

export const selectStyles: StylesConfig<PartOption, false> = {
  control: (base, state) => ({
    ...base,
    borderRadius: "0.5rem",
    borderColor: state.isFocused
      ? "#6366f1"
      : isDarkMode()
        ? "#475569"
        : "#e2e8f0",
    boxShadow: state.isFocused ? "0 0 0 1px #6366f1" : "none",
    padding: "0.25rem",
    backgroundColor: isDarkMode() ? "#1e293b" : "white",
    "&:hover": { borderColor: "#6366f1" },
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "#6366f1"
      : state.isFocused
        ? isDarkMode()
          ? "#334155"
          : "#e0e7ff"
        : isDarkMode()
          ? "#1e293b"
          : "white",
    color: state.isSelected ? "white" : isDarkMode() ? "#f1f5f9" : "#1e293b",
    cursor: "pointer",
  }),
  singleValue: (base) => ({
    ...base,
    color: isDarkMode() ? "#f1f5f9" : "#1e293b",
  }),
  placeholder: (base) => ({
    ...base,
    color: isDarkMode() ? "#64748b" : "#94a3b8",
  }),
  menu: (base) => ({
    ...base,
    borderRadius: "0.5rem",
    backgroundColor: isDarkMode() ? "#1e293b" : "white",
    border: isDarkMode() ? "1px solid #475569" : "none",
    boxShadow:
      "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  }),
  input: (base) => ({
    ...base,
    color: isDarkMode() ? "#f1f5f9" : "#1e293b",
  }),
};
