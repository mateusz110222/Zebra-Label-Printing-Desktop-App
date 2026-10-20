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

export const getSelectStyles = (
  dark = isDarkMode(),
): StylesConfig<PartOption, false> => ({
  control: (base, state) => ({
    ...base,
    borderRadius: "0.5rem",
    borderColor: state.isFocused ? "#6366f1" : dark ? "#475569" : "#e2e8f0",
    boxShadow: state.isFocused ? "0 0 0 1px #6366f1" : "none",
    padding: "0.25rem",
    backgroundColor: dark ? "#1e293b" : "white",
    "&:hover": { borderColor: "#6366f1" },
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "#6366f1"
      : state.isFocused
        ? dark
          ? "#334155"
          : "#e0e7ff"
        : dark
          ? "#1e293b"
          : "white",
    color: state.isSelected ? "white" : dark ? "#f1f5f9" : "#1e293b",
    cursor: "pointer",
  }),
  singleValue: (base) => ({
    ...base,
    color: dark ? "#f1f5f9" : "#1e293b",
  }),
  placeholder: (base) => ({
    ...base,
    color: dark ? "#64748b" : "#94a3b8",
  }),
  menu: (base) => ({
    ...base,
    borderRadius: "0.5rem",
    backgroundColor: dark ? "#1e293b" : "white",
    border: dark ? "1px solid #475569" : "none",
    boxShadow:
      "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 50,
  }),
  input: (base) => ({
    ...base,
    color: dark ? "#f1f5f9" : "#1e293b",
  }),
});

export const selectStyles: StylesConfig<PartOption, false> = getSelectStyles();
