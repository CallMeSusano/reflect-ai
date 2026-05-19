"use client";

import { I18nextProvider } from "react-i18next";
import { ReactNode, useEffect, useState } from "react";
import i18n from "@/lib/i18n";

interface TranslationsProviderProps {
  children: ReactNode;
}

export default function TranslationsProvider({
  children,
}: TranslationsProviderProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
