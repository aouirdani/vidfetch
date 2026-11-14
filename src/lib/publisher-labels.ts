import type { Locale } from "../i18n/config";

/** Presentation copy stays outside the gateway's embedded dictionaries. */
export const PUBLISHER_LABELS: Record<Locale, { publisher: string; status: string; director: string; email: string; address: string; host: string; phone: string; distribution: string }> = {
  en: { publisher: "Publisher", status: "Private individual, no business status", director: "Publication director", email: "Email", address: "Postal address", host: "Hosting provider", phone: "Phone", distribution: "Network distribution" },
  fr: { publisher: "Éditeur", status: "Particulier, sans statut d’entreprise", director: "Directeur de la publication", email: "E-mail", address: "Adresse postale", host: "Hébergeur", phone: "Téléphone", distribution: "Diffusion" },
  es: { publisher: "Editor", status: "Particular, sin condición de empresa", director: "Director de la publicación", email: "Correo electrónico", address: "Dirección postal", host: "Alojamiento", phone: "Teléfono", distribution: "Distribución de red" },
  "pt-BR": { publisher: "Editor", status: "Pessoa física, sem estatuto empresarial", director: "Diretor da publicação", email: "E-mail", address: "Endereço postal", host: "Hospedagem", phone: "Telefone", distribution: "Distribuição de rede" },
  id: { publisher: "Penerbit", status: "Perorangan, tanpa status perusahaan", director: "Direktur publikasi", email: "Email", address: "Alamat pos", host: "Penyedia hosting", phone: "Telepon", distribution: "Distribusi jaringan" },
  de: { publisher: "Herausgeber", status: "Privatperson, ohne Unternehmensstatus", director: "Verantwortlich für die Veröffentlichung", email: "E-Mail", address: "Postanschrift", host: "Hosting-Anbieter", phone: "Telefon", distribution: "Netzwerkverteilung" },
  it: { publisher: "Editore", status: "Privato, senza status d’impresa", director: "Direttore della pubblicazione", email: "E-mail", address: "Indirizzo postale", host: "Hosting", phone: "Telefono", distribution: "Distribuzione di rete" },
  ar: { publisher: "الناشر", status: "فرد، دون صفة شركة", director: "مدير النشر", email: "البريد الإلكتروني", address: "العنوان البريدي", host: "مقدم الاستضافة", phone: "الهاتف", distribution: "توزيع الشبكة" },
};
