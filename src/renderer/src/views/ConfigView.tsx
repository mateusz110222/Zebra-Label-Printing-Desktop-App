import React from "react";
import { useTranslation } from "react-i18next";
import { CriticalErrorState, StatusBanner, ConfigViewSkeleton, LoadingWrapper } from "../components/common";
import {
  ConfigFormCard,
  ConnectionDisplayCard,
  NoConfigCard,
} from "../components/config";
import { useAuth } from "@renderer/context/AuthContext";
import { useConfigView } from "@renderer/hooks";

export function ConfigView(): React.JSX.Element {
  const { t } = useTranslation();
  const { CanEdit } = useAuth();
  const { data, status, actions, isValid } = useConfigView();

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
    <LoadingWrapper isLoading={status.isInitializing} skeleton={<ConfigViewSkeleton />}>
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

          {/* Main card - conditional rendering */}
          {!data.hasConfig && !CanEdit ? (
            <NoConfigCard />
          ) : !data.isEditing && data.hasConfig ? (
            <ConnectionDisplayCard
              connectionType={data.connectionType}
              ipAddress={data.ipAddress}
              port={data.port}
              comPort={data.displayedCom}
              baudRate={data.displayedBaudRate}
              canEdit={CanEdit}
              isProcessing={status.isProcessing}
              onTest={() => actions.handleAction("TEST")}
              onEdit={() => actions.setIsEditing(true)}
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
              isProcessing={status.isProcessing}
              isValid={isValid}
              onSave={() => actions.handleAction("SAVE")}
              onCancel={() => actions.setIsEditing(false)}
            />
          )}
        </div>
      </div>
    </LoadingWrapper>
  );
}
