"use client";
import { createContext, useContext } from "react";
import type { Locale } from "./config";
import type { ClientMessages } from "./client-messages";
const Context = createContext<{ locale: Locale; messages: ClientMessages } | null>(null);
export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: ClientMessages; children: React.ReactNode }) {
  return <Context.Provider value={{ locale, messages }}>{children}</Context.Provider>;
}
export function useI18n() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing VidFetch locale provider");
  return value;
}
