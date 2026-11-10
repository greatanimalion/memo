import i18next from "i18next";
import { initReactI18next } from "react-i18next";

i18next.use(initReactI18next).init({
  lng: "zh-CN",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  resources: {
    "zh-CN": { translation: {} },
    en: { translation: {} },
  },
});

export default i18next;
