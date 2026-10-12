"use client";
import { useI18n } from "@/i18n/context";
import { homePath } from "@/i18n/config";
export default function NotFound() {
  const { locale, messages: d } = useI18n();
  return <div className="mx-auto max-w-3xl px-4 py-24 text-center"><h1 className="text-3xl font-semibold">{d.notFoundTitle}</h1><p className="mt-5 text-slate-300">{d.notFoundDescription}</p><a className="mt-8 inline-block rounded-xl bg-cyan-300 px-6 py-3 font-semibold text-ink-950" href={homePath(locale)}>{d.home}</a></div>;
}
