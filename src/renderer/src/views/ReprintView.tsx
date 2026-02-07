import React from "react";
import { useTranslation } from "react-i18next";
import Select from "react-select";

import {
  CriticalErrorState,
  StatusBanner,
  SubmitButton,
  LoadingWrapper,
} from "../components/common";
import { LabelPreview, PartDetailsCard } from "../components/print";
import { usePrintLabel } from "@renderer/hooks";
import { selectStyles } from "@renderer/config";
import { useTheme } from "@renderer/context/ThemeContext";
import ReprintUnitDetails from "@renderer/components/print/ReprintUnitDetails";

export function ReprintView(): React.JSX.Element {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const { data, status, actions, isValid } = usePrintLabel("reprint");

  if (status.criticalError) {
    return (
      <CriticalErrorState
        message={status.criticalError}
        onRetry={() => window.location.reload()}
        title={t("print_view.error")}
      />
    );
  }

  return (
    <LoadingWrapper isLoading={status.isLoading}>
      <div className="min-h-full p-4 sm:p-6 lg:p-8 font-sans text-slate-800 dark:text-slate-100 flex flex-col">
        <div className="max-w-4xl w-full m-auto">
          {/* Status Banner */}
          {status.uiMessage && (
            <div className="mb-6">
              <StatusBanner
                type={status.uiMessage.type}
                message={status.uiMessage.text}
                details={status.uiMessage.details}
                onClose={actions.clearUiMessage}
              />
            </div>
          )}

          {/* Main Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
            <form onSubmit={actions.handlePrint}>
              <div className="p-4 sm:p-6 lg:p-8">
                {/* Part Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100 mb-2">
                    {t("print_view.part_selection")}
                  </label>
                  <Select
                    key={theme}
                    autoFocus
                    options={data.options}
                    onChange={actions.handleSelectChange}
                    placeholder={t("print_view.select_part")}
                    isClearable
                    value={
                      data.selectedPart
                        ? {
                          value: data.selectedPart.Serial_Prefix,
                          label: `${data.selectedPart.Part_Description} (${data.selectedPart.Serial_Prefix})`,
                        }
                        : null
                    }
                    classNamePrefix="react-select"
                    styles={selectStyles}
                  />
                </div>

                {/* Part Details Card */}
                {data.selectedPart && (
                  <PartDetailsCard
                    part={data.selectedPart}
                    quantity={data.labelQuantity}
                    onQuantityChange={actions.handleQuantityChange}
                  />
                )}

                {data.selectedPart && (
                  <ReprintUnitDetails
                    date={data.date}
                    onchangeDate={actions.handleDateChange}
                    serialNumber={data.serialNumber}
                    onchangeSerialNumber={actions.handleSerialNumberChange}
                  />
                )}

                <LabelPreview
                  isLoading={status.isPreviewLoading}
                  previewImage={data.previewImage}
                />
              </div>

              {/* Footer */}
              <div className="px-4 sm:px-6 lg:px-8 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">
                  {data.selectedPart
                    ? t("print_view.ready_to_print")
                    : t("print_view.select_part_first")}
                </p>
                <SubmitButton
                  isLoading={status.isPrinting}
                  isDisabled={!isValid}
                  loadingText={t("print_view.printing")}
                  text={t("print_view.print_label")}
                />
              </div>
            </form>
          </div>
        </div>
      </div>
    </LoadingWrapper>
  );
}
