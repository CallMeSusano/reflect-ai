import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import common_en from '../locales/en/common.json';
import common_pt from '../locales/pt/common.json';

const resources = {
  en: {
    common: common_en,
  },
  'pt-PT': {
    common: common_pt,
  },
  pt: {
    common: common_pt,
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: process.env.NODE_ENV === 'development',
    
    ns: ['common'],
    defaultNS: 'common',

    interpolation: {
      escapeValue: false, // react already safes from xss
    },
    detection: {
      order: ['cookie', 'localStorage', 'navigator', 'htmlTag'],
      caches: ['cookie', 'localStorage'],
    },
  });

export default i18n;
