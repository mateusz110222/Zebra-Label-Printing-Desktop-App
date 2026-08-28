import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfigViewSkeleton, CriticalErrorState, LoadingWrapper, StatusBanner } from "../components/common";
import {
  ConfigFormCard,
  ConnectionDisplayCard,
  DatabaseConfigCard,
  DatabaseDisplayCard,
  NoConfigCard,
  PartsSourceConfigCard,
  PartsSourceDisplayCard
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
      <div className="min-h-full p-4 font-sans text-slate-800 dark:text-slate-100 flex flex-col pb-24">
        <div className="max-w-4xl mx-auto w-full my-auto">
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
              <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                <button
                  type="button"
                  onClick={() => setActiveTab("connection")}
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
                  onClick={() => setActiveTab("database")}
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
                  onClick={() => setActiveTab("parts")}
                  className={`${
                    activeTab === "parts"
                      ? "border-indigo-500 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                >
                  {t("config_view.parts_tab")}
                </button>
              </nav>
            </div>
          </div>

          {/* Printer */}
          {activeTab === "connection" && (
            <>
              {!data.hasConfig && !canConfigurePrinter ? (
                <NoConfigCard
                  titleKey="config_view.printer_access_title"
                  messageKey="config_view.printer_access_message"
                />
              ) : !data.isPrinterEditing && data.hasConfig ? (
                <ConnectionDisplayCard
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
                />
              )}
            </>
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
                  dbHost={data.dbHost}
                  dbUser={data.dbUser}
                  dbName={data.dbName}
                  canEdit={CanEdit}
                  onEdit={actions.beginDatabaseEdit}
                />
              ) : (
                <DatabaseConfigCard
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
                />
              )}
            </>
          )}

          {/* Parts */}
          {activeTab === "parts" &&
            (!CanEdit ? (
              <PartsSourceDisplayCard
                source={data.partsSource}
                operation={data.partsOperation}
                canEdit={CanEdit}
                onEdit={actions.beginPartsEdit}
              />
            ) : (
              <PartsSourceConfigCard
                key={partsConfigVersion}
                source={data.partsSource}
                operation={data.partsOperation}
                parts={data.localParts}
                isProcessing={status.isPartsProcessing}
                canEdit={CanEdit}
                onSave={actions.handlePartsSave}
                onCancel={cancelPartsSourceEdit}
              />
            ))}
        </div>
      </div>
    </LoadingWrapper>
  );
}
