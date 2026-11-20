import type { Locale } from "./config";

// Presentation only: not imported by the gateway's temporary legacy helper.
export const transferCopy = {
  en: { started: "Download started", help: "Your file downloads in this tab. Keep it open until the transfer finishes." },
  fr: { started: "Téléchargement lancé", help: "Le fichier se télécharge dans cet onglet. Gardez-le ouvert jusqu’à la fin du transfert." },
  es: { started: "Descarga iniciada", help: "El archivo se descarga en esta pestaña. Mantenla abierta hasta que termine la transferencia." },
  "pt-BR": { started: "Download iniciado", help: "O arquivo é baixado nesta aba. Mantenha-a aberta até o fim da transferência." },
  id: { started: "Unduhan dimulai", help: "File diunduh di tab ini. Biarkan tab tetap terbuka sampai transfer selesai." },
  de: { started: "Download gestartet", help: "Die Datei wird in diesem Tab heruntergeladen. Lass ihn geöffnet, bis die Übertragung abgeschlossen ist." },
  it: { started: "Download avviato", help: "Il file viene scaricato in questa scheda. Tienila aperta fino al termine del trasferimento." },
  ar: { started: "بدأ التنزيل", help: "يُنزَّل الملف في علامة التبويب هذه. أبقِها مفتوحة حتى يكتمل النقل." },
} satisfies Record<Locale, { started: string; help: string }>;
