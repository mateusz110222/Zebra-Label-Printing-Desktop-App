import { StylesConfig } from "react-select";

interface PartOption {
  value: string;
  label: string;
}

export const selectStyles: StylesConfig<PartOption, false> = {
  control: (base, state) => ({
    ...base,
    borderRadius: "0.5rem",
    borderColor: state.isFocused ? "#6366f1" : "#e2e8f0",
    boxShadow: state.isFocused ? "0 0 0 1px #6366f1" : "none",
    padding: "0.25rem",
    "&:hover": { borderColor: "#6366f1" },
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "#6366f1"
      : state.isFocused
        ? "#e0e7ff"
        : "white",
    color: state.isSelected ? "white" : "#1e293b",
    cursor: "pointer",
  }),
  placeholder: (base) => ({ ...base, color: "#94a3b8" }),
  menu: (base) => ({
    ...base,
    borderRadius: "0.5rem",
    boxShadow:
      "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  }),
};
