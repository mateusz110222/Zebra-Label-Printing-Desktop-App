import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { StatusBanner } from "../components/common";
import { useNavigate } from "react-router-dom";

interface UiMessage {
  type: "success" | "error";
  text: string;
  details?: string;
}

export default function Login(): React.JSX.Element {
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
      const errMsg =
        error instanceof Error ? error.message : "backend.config.save_fail";
      setUiMessage({
        type: "error",
        text: t(errMsg),
      });
    }
    setIsProcessing(false);
  };

  const isValid = login.length > 0 && password.length > 0;

  return (
    <div className="p-8 font-sans text-slate-800">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {t("login.title")}
          </h2>
          <p className="text-slate-500 mt-2">{t("login.subtitle")}</p>
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
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
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
                <label className="block text-sm font-semibold leading-6 text-slate-900 mb-1">
                  {t("login.email_label", "Email")}
                </label>
                <input
                  type="email"
                  value={login}
                  onChange={(e) => setLoginState(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && HandleLogin()}
                  placeholder="twoj.email@firma.pl"
                  className="block w-full rounded-lg border-0 py-2.5 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
                />
              </div>

              {/* Password input */}
              <div>
                <label className="block text-sm font-semibold leading-6 text-slate-900 mb-1">
                  {t("login.password_label", "Hasło")}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPasswordState(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && HandleLogin()}
                    placeholder="••••••••"
                    className="block w-full rounded-lg border-0 py-2.5 px-3 pr-10 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Submit button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={!isValid || isProcessing}
                  className={`w-full inline-flex items-center justify-center rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all ${
                    isValid && !isProcessing
                      ? "bg-indigo-600 hover:bg-indigo-500 active:scale-95"
                      : "bg-slate-300 cursor-not-allowed"
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
          <div className="px-8 pb-6 text-center border-t border-slate-100">
            <p className="text-slate-400 text-xs pt-4">
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
