import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ConfigViewSkeleton,
  ConfirmationModal,
  CriticalErrorState,
  LoadingWrapper,
  StatusBanner,
} from "../components/common";
import {
  ConfigFormCard,
  ConnectionDisplayCard,
  DatabaseConfigCard,
  DatabaseDisplayCard,
  FormatPrinterAssignmentsCard,
  NoConfigCard,
  PartsSourceConfigCard,
  PartsSourceDisplayCard,
} from "../components/config";
import { useAuth } from "@renderer/context/AuthContext";
import { useConfigView } from "@renderer/hooks";

export function ConfigView(): React.JSX.Element {
  const { t } = useTranslation();
  const { CanEdit, canConfigurePrinter } = useAuth();

  const { data, status, actions, isPrinterValid, isDatabaseValid } =
    useConfigView();

  const [activeTab, setActiveTab] = useState("connection");
  const [partsConfigVersion, setPartsConfigVersion] = useState(0);
  const [routingConfigVersion, setRoutingConfigVersion] = useState(0);
  const [printerToDelete, setPrinterToDelete] = useState<string | null>(null);
  const [isDeletingPrinter, setIsDeletingPrinter] = useState(false);
  const [isRoutingDirty, setIsRoutingDirty] = useState(false);
  const [isPrinterFormDirty, setIsPrinterFormDirty] = useState(false);
  const [isDatabaseFormDirty, setIsDatabaseFormDirty] = useState(false);
  const [isPartsFormDirty, setIsPartsFormDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const [pendingPrinter, setPendingPrinter] = useState<string | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const hasUnsavedChanges =
    isRoutingDirty ||
    isPrinterFormDirty ||
    isDatabaseFormDirty ||
    isPartsFormDirty;

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const preventClose = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventClose);
    return () => window.removeEventListener("beforeunload", preventClose);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const protectNavigation = (event: MouseEvent): void => {
      const element = event.target instanceof Element ? event.target : null;
      const anchor = element?.closest<HTMLAnchorElement>("a[href]");
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.href === window.location.href
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(anchor.href);
    };
    document.addEventListener("click", protectNavigation, true);
    return () => document.removeEventListener("click", protectNavigation, true);
  }, [hasUnsavedChanges]);

  const requestTabChange = (tab: string): void => {
    if (tab === activeTab) return;
    if (hasUnsavedChanges) {
      setPendingTab(tab);
      return;
    }
    setActiveTab(tab);
  };

  const requestPrinterSelection = (name: string): void => {
    if (name === data.printerName) return;
    if (hasUnsavedChanges) {
      setPendingPrinter(name);
      return;
    }
    void actions.selectPrinter(name);
  };

  const discardActiveChanges = (): void => {
    if (activeTab === "connection") actions.cancelPrinterEdit();
    if (activeTab === "database") actions.cancelDatabaseEdit();
    if (activeTab === "parts") cancelPartsSourceEdit();
    if (activeTab === "printer-routing") {
      setRoutingConfigVersion((version) => version + 1);
    }
    setIsRoutingDirty(false);
    setIsPrinterFormDirty(false);
    setIsDatabaseFormDirty(false);
    setIsPartsFormDirty(false);
  };

  const confirmPendingNavigation = (): void => {
    const nextTab = pendingTab;
    const nextPrinter = pendingPrinter;
    const nextHref = pendingHref;
    setPendingTab(null);
    setPendingPrinter(null);
    setPendingHref(null);
    discardActiveChanges();
    if (nextTab) setActiveTab(nextTab);
    if (nextPrinter) void actions.selectPrinter(nextPrinter);
    if (nextHref) window.location.assign(nextHref);
  };

  const confirmPrinterDelete = async (): Promise<void> => {
    if (!printerToDelete) return;
    setIsDeletingPrinter(true);
    try {
      await actions.deletePrinter(printerToDelete);
      setPrinterToDelete(null);
    } finally {
      setIsDeletingPrinter(false);
    }
  };

  const cancelPartsSourceEdit = (): void => {
    actions.cancelPartsEdit();

    // Potrzebne głównie przy pierwszej konfiguracji,
    // gdy nie istnieje jeszcze PartsSourceDisplayCard.
    setPartsConfigVersion((version) => version + 1);

    actions.setUiMessage(null);
  };

  if (status.criticalError) {
    return (
      <CriticalErrorState
        message={status.criticalError}
        onRetry={() => window.location.reload()}
        title={t("config_view.error")}
      />
    );
  }

  return (
    <LoadingWrapper
      isLoading={status.isInitializing}
      skeleton={<ConfigViewSkeleton />}
    >
      <div className="min-h-full p-4 sm:p-6 lg:p-8 font-sans text-slate-800 dark:text-slate-100 flex flex-col pb-24">
        <div className="max-w-5xl mx-auto w-full">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              {t("config_view.title")}
            </h2>

            <p className="text-slate-500 dark:text-slate-400 mt-1 sm:mt-2 text-sm sm:text-base">
              {t("config_view.subtitle")}
            </p>
          </div>

          {/* Status banner */}
          {status.uiMessage && (
            <div className="mb-6">
              <StatusBanner
                type={status.uiMessage.type}
                message={status.uiMessage.text}
                details={status.uiMessage.details}
                onClose={() => actions.setUiMessage(null)}
              />
            </div>
          )}

          {/* Tabs */}
          <div className="mb-6">
            <div className="border-b border-gray-200 dark:border-gray-700">
              <nav
                className="-mb-px flex gap-3 overflow-x-auto"
                aria-label="Tabs"
              >
                <button
                  type="button"
                  onClick={() => requestTabChange("connection")}
                  className={`${
                    activeTab === "connection"
                      ? "border-indigo-500 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                >
                  {t("config_view.connection_tab")}
                </button>

                <button
                  type="button"
                  onClick={() => requestTabChange("database")}
                  className={`${
                    activeTab === "database"
                      ? "border-indigo-500 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                >
                  {t("config_view.database_tab")}
                </button>

                <button
                  type="button"
                  onClick={() => requestTabChange("parts")}
                  className={`${
                    activeTab === "parts"
                      ? "border-indigo-500 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                >
                  {t("config_view.parts_tab")}
                </button>

                {data.printerMode === "multiple" && (
                  <button
                    type="button"
                    onClick={() => requestTabChange("printer-routing")}
                    className={`${
                      activeTab === "printer-routing"
                        ? "border-indigo-500 text-indigo-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                  >
                    {t("config_view.printer_routing_tab")}
                  </button>
                )}
              </nav>
            </div>
          </div>

          {/* Printer */}
          {activeTab === "connection" && (
            <>
              <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {t("config_view.printer_mode")}
                </p>
                {canConfigurePrinter ? (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {(["single", "multiple"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        disabled={
                          !canConfigurePrinter || status.isRoutingProcessing
                        }
                        onClick={() => {
                          void actions.handlePrinterModeChange(mode);
                          if (mode === "single") setActiveTab("connection");
                        }}
                        className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed ${
                          data.printerMode === mode
                            ? "border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200"
                            : "border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                        }`}
                      >
                        <span className="block font-semibold">
                          {t(`config_view.printer_mode_${mode}`)}
                        </span>
                        <span className="mt-1 block text-xs opacity-75">
                          {t(`config_view.printer_mode_${mode}_hint`)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                    <span className="block font-semibold text-slate-800 dark:text-slate-100">
                      {t(`config_view.printer_mode_${data.printerMode}`)}
                    </span>
                    <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">
                      {t(`config_view.printer_mode_${data.printerMode}_hint`)}
                    </span>
                  </div>
                )}
              </div>
              {canConfigurePrinter && data.printers.length > 0 && (
                <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {t("config_view.configured_printers")}:
                    </span>
                    {data.printers.map((printer) => {
                      const name =
                        printer.name ||
                        (printer.type === "IP"
                          ? `${printer.ip}:${printer.port ?? 9100}`
                          : printer.type === "COM"
                            ? printer.comPort || "COM"
                            : printer.usbPrinterName || "USB");
                      const isActive = data.printerName === name;
                      return (
                        <div
                          key={name}
                          className="flex overflow-hidden rounded-lg"
                        >
                          <button
                            type="button"
                            disabled={isActive}
                            aria-current={isActive ? "true" : undefined}
                            title={t(
                              isActive
                                ? "config_view.active_printer"
                                : "config_view.set_active_printer",
                              { name },
                            )}
                            onClick={() => requestPrinterSelection(name)}
                            className={`px-3 py-2 text-sm font-medium transition ${
                              isActive
                                ? "bg-indigo-600 text-white"
                                : "bg-slate-100 text-slate-700 hover:bg-indigo-50 dark:bg-slate-700 dark:text-slate-200"
                            }`}
                          >
                            {isActive && <span className="mr-1.5">✓</span>}
                            {name}
                          </button>
                          <button
                            type="button"
                            aria-label={t("config_view.delete_printer", {
                              name,
                            })}
                            title={t("config_view.delete_printer", { name })}
                            onClick={() => setPrinterToDelete(name)}
                            className="border-l border-slate-200 bg-slate-100 px-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:border-slate-600 dark:bg-slate-700"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                    {data.printerMode === "multiple" && (
                      <button
                        type="button"
                        onClick={actions.beginAddPrinter}
                        className="ml-auto rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950/30"
                      >
                        + {t("config_view.add_printer")}
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {t("config_view.configured_printers_hint")}
                  </p>
                </div>
              )}
              {!data.hasConfig && !canConfigurePrinter ? (
                <NoConfigCard
                  titleKey="config_view.printer_access_title"
                  messageKey="config_view.printer_access_message"
                />
              ) : !data.isPrinterEditing && data.hasConfig ? (
                <ConnectionDisplayCard
                  printerName={data.printerName}
                  connectionType={data.connectionType}
                  ipAddress={data.ipAddress}
                  port={data.port}
                  comPort={data.displayedCom}
                  baudRate={data.displayedBaudRate}
                  usbPrinterName={data.displayedUsbPrinter}
                  canEdit={canConfigurePrinter}
                  isProcessing={status.isPrinterProcessing}
                  onTest={() => actions.handlePrinterAction("TEST")}
                  onEdit={actions.beginPrinterEdit}
                />
              ) : (
                <ConfigFormCard
                  printerName={data.printerName}
                  onPrinterNameChange={actions.setPrinterName}
                  connectionType={data.connectionType}
                  onConnectionTypeChange={actions.setConnectionType}
                  ipAddress={data.ipAddress}
                  onIpAddressChange={actions.setIpAddress}
                  port={data.port}
                  onPortChange={actions.setPort}
                  selectedCom={data.selectedCom}
                  onComChange={actions.setSelectedCom}
                  baudRate={data.baudRate}
                  onBaudRateChange={actions.setBaudRate}
                  serialPorts={data.serialPorts}
                  onRefreshPorts={actions.handleRefreshPorts}
                  selectedUsbPrinter={data.selectedUsbPrinter}
                  onUsbPrinterChange={actions.setSelectedUsbPrinter}
                  usbPrinters={data.usbPrinters}
                  onRefreshUsbPrinters={actions.handleRefreshUsbPrinters}
                  isProcessing={status.isPrinterProcessing}
                  isValid={isPrinterValid}
                  onSave={() => actions.handlePrinterAction("SAVE")}
                  onCancel={actions.cancelPrinterEdit}
                  onDirtyChange={setIsPrinterFormDirty}
                />
              )}
            </>
          )}

          {activeTab === "printer-routing" &&
            data.printerMode === "multiple" && (
              <FormatPrinterAssignmentsCard
                key={`${routingConfigVersion}:${JSON.stringify(data.formatAssignments)}`}
                printers={data.printers}
                formats={data.availableLabelFormats}
                assignments={data.formatAssignments}
                isProcessing={status.isRoutingProcessing}
                readOnly={!canConfigurePrinter}
                onSave={actions.handleFormatAssignmentsSave}
                onRefresh={actions.refreshLabelFormats}
                onDirtyChange={setIsRoutingDirty}
              />
            )}

          {/* Database */}
          {activeTab === "database" && (
            <>
              {!data.hasDatabaseConfig && !CanEdit ? (
                <NoConfigCard
                  titleKey="config_view.database_access_title"
                  messageKey="config_view.database_access_message"
                />
              ) : !data.isDatabaseEditing && data.hasDatabaseConfig ? (
                <DatabaseDisplayCard
                  dbSslMode={data.dbSslMode}
                  dbHost={data.dbHost}
                  dbUser={data.dbUser}
                  dbName={data.dbName}
                  canEdit={CanEdit}
                  onEdit={actions.beginDatabaseEdit}
                />
              ) : (
                <DatabaseConfigCard
                  dbSslMode={data.dbSslMode}
                  onDbSslModeChange={actions.setDbSslMode}
                  dbHost={data.dbHost}
                  onDbHostChange={actions.setDbHost}
                  dbUser={data.dbUser}
                  onDbUserChange={actions.setDbUser}
                  dbPass={data.dbPass}
                  onDbPassChange={actions.setDbPass}
                  dbName={data.dbName}
                  onDbNameChange={actions.setDbName}
                  isProcessing={status.isDatabaseProcessing}
                  isValid={isDatabaseValid}
                  onSave={actions.handleDatabaseSave}
                  onCancel={actions.cancelDatabaseEdit}
                  onDirtyChange={setIsDatabaseFormDirty}
                />
              )}
            </>
          )}

          {/* Parts */}
          {activeTab === "parts" &&
            (!data.isPartsEditing && data.hasPartsConfig ? (
              <PartsSourceDisplayCard
                source={data.partsSource}
                server={data.partsServer}
                configPath={data.partsConfigPath}
                canEdit={CanEdit}
                onEdit={actions.beginPartsEdit}
              />
            ) : CanEdit ? (
              <PartsSourceConfigCard
                key={partsConfigVersion}
                source={data.partsSource}
                operation={data.partsOperation}
                server={data.partsServer}
                configPath={data.partsConfigPath}
                parts={data.localParts}
                isProcessing={status.isPartsProcessing}
                canEdit={CanEdit}
                onSave={actions.handlePartsSave}
                onCancel={cancelPartsSourceEdit}
                onDirtyChange={setIsPartsFormDirty}
              />
            ) : (
              <NoConfigCard
                titleKey="config_view.parts_access_title"
                messageKey="config_view.parts_access_message"
              />
            ))}

          <ConfirmationModal
            isOpen={printerToDelete !== null}
            title={t("config_view.delete_printer_title")}
            message={t("config_view.delete_printer_confirm", {
              name: printerToDelete || "",
            })}
            confirmLabel={t("config_view.delete_printer_action")}
            cancelLabel={t("common.cancel")}
            isProcessing={isDeletingPrinter}
            onConfirm={() => void confirmPrinterDelete()}
            onCancel={() => setPrinterToDelete(null)}
          />
          <ConfirmationModal
            isOpen={
              pendingTab !== null ||
              pendingPrinter !== null ||
              pendingHref !== null
            }
            title={t("config_view.unsaved_title")}
            message={t("config_view.unsaved_message")}
            confirmLabel={t("config_view.discard_changes")}
            cancelLabel={t("common.cancel")}
            onConfirm={confirmPendingNavigation}
            onCancel={() => {
              setPendingTab(null);
              setPendingPrinter(null);
              setPendingHref(null);
            }}
          />
        </div>
      </div>
    </LoadingWrapper>
  );
}
