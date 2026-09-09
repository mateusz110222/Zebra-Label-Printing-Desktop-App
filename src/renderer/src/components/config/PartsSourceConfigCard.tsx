import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiEdit2, FiPlus, FiServer, FiTrash2 } from "react-icons/fi";
import type { LocalPart } from "@renderer/types";

type PartsSource = "server" | "local";

interface Props {
  source: PartsSource;
  operation: string;
  server: string;
  configPath: string;
  parts: LocalPart[];

  isProcessing: boolean;
  canEdit: boolean;

  onSave: (
    source: PartsSource,
    operation: string,
    server: string,
    configPath: string,
    parts: LocalPart[],
  ) => Promise<void>;

  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

const emptyPart = (): LocalPart => ({
  Operation: "",
  Part_Number: "",
  Part_Description: "",
  Serial_Prefix: "",
  Label_Format: "",
});

const normalizePart = (part: LocalPart): LocalPart => ({
  Operation: part.Operation.trim(),

  Part_Number: part.Part_Number.trim(),

  Part_Description: part.Part_Description.trim(),

  Serial_Prefix: part.Serial_Prefix.trim(),

  Label_Format: part.Label_Format.trim(),
});

export default function PartsSourceConfigCard({
  source,
  operation,
  server,
  configPath,
  parts,
  isProcessing,
  canEdit,
  onSave,
  onCancel,
  onDirtyChange,
}: Props): React.JSX.Element {
  const { t } = useTranslation();

  const [selectedSource, setSelectedSource] = useState<PartsSource>(source);

  const [selectedOperation, setSelectedOperation] = useState(operation);
  const [selectedServer, setSelectedServer] = useState(server);
  const [selectedConfigPath, setSelectedConfigPath] = useState(configPath);

  const [items, setItems] = useState<LocalPart[]>(parts);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const [draft, setDraft] = useState<LocalPart>(emptyPart());

  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const [initialSignature] = useState(() =>
    JSON.stringify({ source, operation, server, configPath, parts }),
  );
  const isDirty =
    JSON.stringify({
      source: selectedSource,
      operation: selectedOperation,
      server: selectedServer,
      configPath: selectedConfigPath,
      parts: items,
    }) !== initialSignature;

  React.useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  React.useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const visibleItems = useMemo(
    () =>
      items
        .map((part, index) => ({
          part,
          index,
        }))
        .filter(({ part }) => {
          if (!normalizedQuery) {
            return true;
          }

          return Object.values(part).some((value) =>
            (value || "").toLowerCase().includes(normalizedQuery),
          );
        }),
    [items, normalizedQuery],
  );

  const updateDraft = (key: keyof LocalPart, value: string): void => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const resetEditor = (): void => {
    setEditingIndex(null);

    setDraft(emptyPart());

    setIsEditorOpen(false);
  };

  const canSaveRecord = Object.values(draft).every(
    (value) => (value || "").trim().length > 0,
  );

  const canSaveConfig =
    selectedSource === "server"
      ? selectedServer.trim().length > 0 && selectedConfigPath.trim().length > 0
      : items.length > 0;
  const validationClass =
    "mt-2 block text-xs font-medium text-red-600 dark:text-red-400";

  const openNewRecord = (): void => {
    if (!canEdit) {
      return;
    }

    setEditingIndex(null);

    setDraft(emptyPart());

    setIsEditorOpen(true);
  };

  const openEditRecord = (part: LocalPart, index: number): void => {
    if (!canEdit) {
      return;
    }

    setEditingIndex(index);

    setDraft({
      ...emptyPart(),
      ...part,
    });

    setIsEditorOpen(true);
  };

  const saveRecord = (): void => {
    if (!canEdit || !canSaveRecord) {
      return;
    }

    const normalized = normalizePart(draft);

    setItems((current) => {
      if (editingIndex === null) {
        return [...current, normalized];
      }

      return current.map((item, index) =>
        index === editingIndex ? normalized : item,
      );
    });

    resetEditor();
  };

  const deleteRecord = (index: number): void => {
    if (!canEdit) {
      return;
    }

    setItems((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  };

  const handleSave = async (): Promise<void> => {
    if (!canEdit || isProcessing || !canSaveConfig) {
      return;
    }

    await onSave(
      selectedSource,
      selectedOperation.trim(),
      selectedServer.trim(),
      selectedConfigPath.trim(),
      items,
    );
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
              className={`rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-80 ${
                selectedSource === value
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                  : "border-slate-200 dark:border-slate-600"
              }`}
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

        {selectedSource === "server" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              {t("parts_config.server")}
              <input
                aria-invalid={!selectedServer.trim()}
                value={selectedServer}
                onChange={(event) => setSelectedServer(event.target.value)}
                disabled={!canEdit}
                placeholder={t("parts_config.server_placeholder")}
                className="mt-2 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 font-mono disabled:bg-slate-100 dark:disabled:bg-slate-900"
              />
              <span className="mt-2 block text-xs font-normal text-slate-500 dark:text-slate-400">
                {t("parts_config.server_hint")}
              </span>
              {!selectedServer.trim() && (
                <span className={validationClass}>
                  {t("parts_config.validation_required")}
                </span>
              )}
            </label>

            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              {t("parts_config.config_path")}
              <input
                aria-invalid={!selectedConfigPath.trim()}
                value={selectedConfigPath}
                onChange={(event) => setSelectedConfigPath(event.target.value)}
                disabled={!canEdit}
                placeholder="/fis/mantis/custom/config/cgi/lps.json"
                className="mt-2 w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 font-mono disabled:bg-slate-100 dark:disabled:bg-slate-900"
              />
              <span className="mt-2 block text-xs font-normal text-slate-500 dark:text-slate-400">
                {t("parts_config.config_path_hint")}
              </span>
              {!selectedConfigPath.trim() && (
                <span className={validationClass}>
                  {t("parts_config.validation_required")}
                </span>
              )}
            </label>
          </div>
        )}

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
                onClick={openNewRecord}
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
                    <th className="px-3 py-3 font-semibold whitespace-nowrap">
                      {t("parts_config.operation")}
                    </th>

                    <th className="px-3 py-3 font-semibold whitespace-nowrap">
                      {t("parts_config.part_number")}
                    </th>

                    <th className="px-3 py-3 font-semibold whitespace-nowrap">
                      {t("parts_config.description")}
                    </th>

                    <th className="px-3 py-3 font-semibold whitespace-nowrap">
                      {t("parts_config.serial_prefix")}
                    </th>

                    <th className="px-3 py-3 font-semibold whitespace-nowrap">
                      {t("parts_config.label_format")}
                    </th>

                    <th className="px-3 py-3" />
                  </tr>
                </thead>

                <tbody>
                  {visibleItems.map(({ part, index }) => (
                    <tr
                      key={`${part.Operation}-${part.Part_Number}-${index}`}
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

                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            aria-label={t("parts_config.edit_record")}
                            onClick={() => openEditRecord(part, index)}
                            disabled={!canEdit}
                            className="rounded-md p-1.5 text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 active:scale-95 disabled:text-slate-400 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                          >
                            <FiEdit2 />
                          </button>

                          <button
                            type="button"
                            aria-label={t("parts_config.delete_record")}
                            onClick={() => deleteRecord(index)}
                            disabled={!canEdit}
                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 active:scale-95 disabled:text-slate-400 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                          >
                            <FiTrash2 />
                          </button>
                        </div>
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
            {items.length === 0 && (
              <p className={validationClass}>
                {t("parts_config.validation_local_parts")}
              </p>
            )}
          </>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur dark:border-slate-700 dark:bg-slate-800/95 sm:px-8">
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {t("config_view.cancel")}
          </button>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canEdit || isProcessing || !canSaveConfig}
            className={`inline-flex items-center justify-center rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all ${
              canEdit && !isProcessing && canSaveConfig
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
                    aria-invalid={!(draft[key] || "").trim()}
                    value={draft[key] || ""}
                    onChange={(event) => updateDraft(key, event.target.value)}
                    disabled={!canEdit}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-700"
                  />
                  {!(draft[key] || "").trim() && (
                    <span className={validationClass}>
                      {t("parts_config.validation_required")}
                    </span>
                  )}
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
