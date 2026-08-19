import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiEdit2, FiPlus, FiServer, FiTrash2 } from "react-icons/fi";
import { LocalPart } from "@renderer/types";

interface Props {
  source: "server" | "local";
  operation: string;
  parts: LocalPart[];
  isProcessing: boolean;
  canEdit: boolean;
  onSave: (
    source: "server" | "local",
    operation: string,
    parts: LocalPart[],
  ) => Promise<void>;
  onCancel: () => void;
}

const emptyPart = (): LocalPart => ({
  Operation: "",
  Part_Number: "",
  Part_Description: "",
  Serial_Prefix: "",
  Label_Format: "",
});

export default function PartsSourceConfigCard({
  source,
  operation,
  parts,
  isProcessing,
  canEdit,
  onSave,
  onCancel,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [selectedSource, setSelectedSource] = useState(source);
  const [selectedOperation, setSelectedOperation] = useState(operation);
  const [items, setItems] = useState(parts);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [draft, setDraft] = useState<LocalPart>(emptyPart());
  const [query, setQuery] = useState("");

  const visibleItems = useMemo(
    () =>
      items
        .map((part, index) => ({ part, index }))
        .filter(({ part }) =>
          Object.values(part).some((value) =>
            value.toLowerCase().includes(query.toLowerCase()),
          ),
        ),
    [items, query],
  );

  const updateDraft = (key: keyof LocalPart, value: string): void =>
    setDraft((current) => ({ ...current, [key]: value }));
  const resetEditor = (): void => {
    setEditingIndex(null);
    setDraft(emptyPart());
    setIsEditorOpen(false);
  };
  const canSaveRecord = Object.values(draft).every(
    (value) => value.trim().length > 0,
  );
  const saveRecord = (): void => {
    if (!canEdit || !canSaveRecord) return;
    setItems((current) =>
      editingIndex === null
        ? [...current, draft]
        : current.map((item, index) => (index === editingIndex ? draft : item)),
    );
    resetEditor();
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
      <div className="p-6 sm:p-8 space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-3">
            <FiServer className="text-indigo-500" />
            {t("parts_config.title")}
          </h3>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {t("parts_config.subtitle")}
          </p>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
            {t("parts_config.operation")}
          </label>
          <input
            value={selectedOperation}
            onChange={(event) => setSelectedOperation(event.target.value)}
            disabled={!canEdit}
            placeholder={t("parts_config.operation_placeholder")}
            className="w-full sm:max-w-md px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 disabled:bg-slate-100 disabled:text-slate-500 dark:disabled:bg-slate-900"
          />
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {t("parts_config.operation_hint")}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(["server", "local"] as const).map((value) => (
            <button
              type="button"
              key={value}
              onClick={() => setSelectedSource(value)}
              disabled={!canEdit}
              className={`rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-80 ${selectedSource === value ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30" : "border-slate-200 dark:border-slate-600"}`}
            >
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                {t(`parts_config.source_${value}_title`)}
              </div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {value === "server"
                  ? t("parts_config.source_server_description")
                  : t("parts_config.source_local_description")}
              </div>
            </button>
          ))}
        </div>

        {selectedSource === "local" && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("parts_config.search_placeholder")}
                className="w-full sm:max-w-md px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700"
              />
              <button
                type="button"
                onClick={() => {
                  if (!canEdit) return;
                  setEditingIndex(null);
                  setDraft(emptyPart());
                  setIsEditorOpen(true);
                }}
                disabled={!canEdit}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-400 text-white font-semibold"
              >
                <FiPlus />
                {t("parts_config.add_record")}
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700 text-left">
                  <tr>
                    {[
                      t("parts_config.operation"),
                      t("parts_config.part_number"),
                      t("parts_config.description"),
                      t("parts_config.serial_prefix"),
                      t("parts_config.label_format"),
                      "",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="px-3 py-3 font-semibold whitespace-nowrap"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map(({ part, index }) => (
                    <tr
                      key={`${part.Part_Number}-${index}`}
                      className="border-t border-slate-100 dark:border-slate-700"
                    >
                      <td className="px-3 py-3">{part.Operation}</td>
                      <td className="px-3 py-3 font-mono">
                        {part.Part_Number}
                      </td>
                      <td className="px-3 py-3">{part.Part_Description}</td>
                      <td className="px-3 py-3 font-mono">
                        {part.Serial_Prefix}
                      </td>
                      <td className="px-3 py-3">{part.Label_Format}</td>
                      <td className="px-3 py-3 flex gap-2">
                        <button
                          type="button"
                          aria-label={t("parts_config.edit_record")}
                          onClick={() => {
                            if (!canEdit) return;
                            setEditingIndex(index);
                            setDraft(part);
                            setIsEditorOpen(true);
                          }}
                          disabled={!canEdit}
                          className="rounded-md p-1.5 text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 active:scale-95 disabled:text-slate-400 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                        >
                          <FiEdit2 />
                        </button>
                        <button
                          type="button"
                          aria-label={t("parts_config.delete_record")}
                          onClick={() =>
                            canEdit &&
                            setItems((current) =>
                              current.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                          disabled={!canEdit}
                          className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 active:scale-95 disabled:text-slate-400 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                        >
                          <FiTrash2 />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {visibleItems.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-8 text-center text-slate-500"
                      >
                        {t("parts_config.no_records")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <div className="p-8 pt-0">
        <div className="pt-6 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            {t("config_view.cancel")}
          </button>

          <button
            type="button"
            onClick={() =>
              void onSave(selectedSource, selectedOperation, items)
            }
            disabled={!canEdit || isProcessing}
            className={`inline-flex items-center justify-center rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all ${
              canEdit && !isProcessing
                ? "bg-indigo-600 hover:bg-indigo-500 active:scale-95"
                : "bg-slate-300 dark:bg-slate-600 cursor-not-allowed"
            }`}
          >
            {isProcessing ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                {t("config_view.saving")}
              </>
            ) : (
              t("config_view.save")
            )}
          </button>
        </div>
      </div>
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
            <h4 className="mb-5 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {editingIndex === null
                ? t("parts_config.add_record")
                : t("parts_config.edit_record")}
            </h4>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {(Object.keys(draft) as Array<keyof LocalPart>).map((key) => (
                <label key={key} className="text-sm font-medium">
                  {t(`parts_config.field_${key}`)}
                  <input
                    value={draft[key]}
                    onChange={(event) => updateDraft(key, event.target.value)}
                    disabled={!canEdit}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
                  />
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={resetEditor}
                className="rounded-lg px-4 py-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 active:scale-[0.98] dark:hover:bg-slate-700 dark:hover:text-slate-100"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={saveRecord}
                disabled={!canEdit || !canSaveRecord}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-white shadow-sm transition hover:bg-indigo-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 active:scale-[0.98] disabled:bg-slate-300 disabled:shadow-none disabled:hover:bg-slate-300 disabled:active:scale-100"
              >
                {t("parts_config.save_record")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
