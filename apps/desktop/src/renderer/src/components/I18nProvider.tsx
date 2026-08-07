import { useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import {
  APP_LOCALES,
  DEFAULT_ACTIVE_LOCALE,
  setLocale as setSharedLocale,
  sharedI18n,
  type AppLocale,
} from "../../../shared/i18n";
import { I18nContext, type I18nContextValue } from "./I18nContext";

void sharedI18n.use(initReactI18next);

const STORAGE_KEY = "hermes-locale";

function readStoredLocale(): AppLocale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (APP_LOCALES as string[]).includes(raw)) {
      return raw as AppLocale;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_ACTIVE_LOCALE;
}

const initialLocale = readStoredLocale();
setSharedLocale(initialLocale);

export function I18nProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  // react-i18next hoists @types/react@18 in the monorepo; React 19 ReactNode includes bigint.
  type I18nextChildren = Parameters<typeof I18nextProvider>[0]["children"];
  const i18nChildren = children as unknown as I18nextChildren;
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);

  useEffect(() => {
    let cancelled = false;

    void window.hermesAPI
      ?.getLocale?.()
      .then((mainLocale) => {
        if (cancelled || !mainLocale || mainLocale === locale) return;
        setLocaleState(mainLocale);
      })
      .catch(() => {
        /* ignore */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sharedI18n.language !== locale) {
      setSharedLocale(locale);
    }
    void window.hermesAPI?.setLocale?.(locale).catch(() => {
      /* ignore */
    });
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      /* ignore */
    }
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: setLocaleState,
    }),
    [locale],
  );

  return (
    <I18nContext.Provider value={value}>
      <I18nextProvider i18n={sharedI18n}>{i18nChildren}</I18nextProvider>
    </I18nContext.Provider>
  );
}
