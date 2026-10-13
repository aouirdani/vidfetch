"use client";
import { createContext, useContext } from "react";
import type { Locale } from "./config";
import type { Messages } from "./dictionaries";
const Context = createContext<{ locale: Locale; messages: Messages } | null>(null);
export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  return <Context.Provider value={{ locale, messages }}>{children}</Context.Provider>;
}
export function useI18n() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing VidFetch locale provider");
  return value;
}
