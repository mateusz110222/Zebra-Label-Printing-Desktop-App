import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { StatusBanner } from "../components/common";
import { useNavigate } from "react-router-dom";
import { FiEye, FiEyeOff, FiLoader } from "react-icons/fi";
import { UiMessage } from "../types";

export function LoginView(): React.JSX.Element {
  const { t } = useTranslation();
  const { setLogin } = useAuth();

  const [uiMessage, setUiMessage] = useState<UiMessage | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const [login, setLoginState] = useState<string>("");
  const [password, setPasswordState] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const navigate = useNavigate();

  const HandleLogin = async (): Promise<void> => {
    if (!login || !password) return;

    setIsProcessing(true);
    try {
      const response = await window.electron.ipcRenderer.invoke(
        "handle-login",
        {
          login: login,
          password: password,
        },
      );

      if (!response.status) {
        setUiMessage({
          type: "error",
          text: t(response.message),
        });
      }

      const FullName = response.data.FullName;
      const CanEdit = response.data.department.includes("IT");

      setUiMessage({
        type: "success",
        text: t(response.message),
      });

      setLogin(FullName, CanEdit);
      navigate("/");
    } catch (error) {
      const { message } = extractError(error);
      setUiMessage({
        type: "error",
        text: t(message),
      });
    }
    setIsProcessing(false);
  };

  const extractError = (err: unknown): { message: string; details?: string } => {
    const message = err instanceof Error ? err.message : String(err);
    const details =
      typeof err === "object" && err !== null && "rawError" in err
        ? (err as { rawError: string }).rawError
        : undefined;
    return { message, details };
  };

  const isValid = login.length > 0 && password.length > 0;

  return (
    <div className="p-8 font-sans text-slate-800 dark:text-slate-100 min-h-full flex items-center justify-center bg-slate-50 dark:bg-slate-950/50">
      <div className="max-w-md w-full mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            {t("login.title")}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2">{t("login.subtitle")}</p>
        </div>

        {/* Message */}
        {uiMessage && (
          <div className="mb-6">
            <StatusBanner
              type={uiMessage.type}
              message={uiMessage.text}
              details={uiMessage.details}
              onClose={() => setUiMessage(null)}
            />
          </div>
        )}

        {/* Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              HandleLogin();
            }}
            className="p-8"
          >
            <div className="space-y-5">
              {/* Email input */}
              <div>
                <label className="block text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100 mb-1">
                  {t("login.email_label", "Email")}
                </label>
                <input
                  type="email"
                  value={login}
                  autoFocus
                  onChange={(e) => setLoginState(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && HandleLogin()}
                  placeholder={t("login.login_placeholder")}
                  className="block w-full rounded-lg border-0 py-2.5 px-3 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-600 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-inset focus:ring-indigo-600 dark:focus:ring-indigo-500 sm:text-sm"
                />
              </div>

              {/* Password input */}
              <div>
                <label className="block text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100 mb-1">
                  {t("login.password_label", "Hasło")}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPasswordState(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && HandleLogin()}
                    placeholder={t("login.password_placeholder")}
                    className="block w-full rounded-lg border-0 py-2.5 px-3 pr-10 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-600 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-inset focus:ring-indigo-600 dark:focus:ring-indigo-500 sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? t("login.hide_password") : t("login.show_password")}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  >
                    {showPassword ? (
                      <FiEyeOff className="w-5 h-5" />
                    ) : (
                      <FiEye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={!isValid || isProcessing}
                  className={`w-full inline-flex items-center justify-center rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all ${isValid && !isProcessing
                    ? "bg-indigo-600 hover:bg-indigo-500 active:scale-95 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                    : "bg-slate-300 dark:bg-slate-600 cursor-not-allowed"
                    }`}
                >
                  {isProcessing ? (
                    <>
                      <FiLoader className="animate-spin -ml-1 mr-2 h-4 w-4" />
                      {t("login.logging_in")}
                    </>
                  ) : (
                    t("login.login_btn")
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* Footer */}
          <div className="px-8 pb-6 text-center border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <p className="text-slate-400 dark:text-slate-500 text-xs pt-4">
              {t(
                "login.footer_info",
                "Zaloguj się kontem firmowym Active Directory",
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
