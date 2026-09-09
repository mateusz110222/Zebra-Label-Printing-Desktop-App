import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import Backend from "i18next-http-backend";

const getSavedLanguage = (): string => {
  try {
    const language = localStorage.getItem("language");
    return language === "pl" || language === "en" ? language : "en";
  } catch {
    return "en";
  }
};

i18n
  .use(Backend)
  .use(initReactI18next)
  .init({
    lng: getSavedLanguage(),
    fallbackLng: "en",
    backend: {
      loadPath: "./locales/{{lng}}/{{ns}}.json",
    },
  });

export default i18n;
