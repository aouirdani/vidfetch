import en from "./messages/en.json";
import fr from "./messages/fr.json";
import es from "./messages/es.json";
import pt from "./messages/pt-BR.json";
import id from "./messages/id.json";
import de from "./messages/de.json";
import it from "./messages/it.json";
import ar from "./messages/ar.json";
import type { Locale } from "./config";
export type Messages = typeof en;
// Server imports select one dictionary. Client components import only this type.
export const dictionaries = { en, fr, es, "pt-BR": pt, id, de, it, ar } satisfies Record<Locale, Messages>;
export function dictionary(locale: Locale): Messages { return dictionaries[locale]; }
