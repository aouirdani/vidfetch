import Link from "next/link";
import type { ReactNode } from "react";
import { type Locale, articlePath } from "@/i18n/config";
import { availableGuides } from "@/lib/guides";
import { resolvePage } from "@/lib/site-pages";
import { headingId } from "@/lib/guides";

/** A small, deliberately restricted Markdown dialect. HTML is rendered as text. */
function inline(text: string, locale: Locale): ReactNode[] {
  return text.split(/(\[[^\]]+\]\([^\s)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) => {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const [ , label, href ] = link;
      if (href.startsWith("/") && !href.startsWith("//")) {
        const id = /^\/blog\/([a-z0-9-]+)$/.exec(href)?.[1];
        const guide = id ? availableGuides(locale).find(g => g.id === id) : undefined;
        if (!guide) return resolvePage(href.split("/").filter(Boolean)) ? <Link key={i} href={href} prefetch={false}>{label}</Link> : label;
        return <Link key={i} href={articlePath(locale, guide.slug)} prefetch={false}>{label}</Link>;
      }
      if (href.startsWith("https://")) return <a key={i} href={href} rel="noopener noreferrer">{label}</a>;
      return label;
    }
    if (part.startsWith("`")) return <code key={i} dir="ltr">{part.slice(1, -1)}</code>;
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return part;
  });
}
export function GuideBody({ body, locale = "en" }: { body: string; locale?: Locale }) {
  return <div className="guide-prose">{body.split(/\n\s*\n/).map((block, i) => {
    if (block.startsWith("```")) return <pre key={i} dir="ltr"><code>{block.replace(/^```[^\n]*\n/, "").replace(/\n```$/, "")}</code></pre>;
    if (block.startsWith("### ")) return <h3 key={i} id={headingId(block.slice(4))}>{inline(block.slice(4), locale)}</h3>;
    if (block.startsWith("## ")) return <h2 key={i} id={headingId(block.slice(3))}>{inline(block.slice(3), locale)}</h2>;
    if (block.startsWith("- ")) return <ul key={i}>{block.split("\n").map((line, j) => <li key={j}>{inline(line.replace(/^- /, ""), locale)}</li>)}</ul>;
    return <p key={i}>{inline(block.replace(/\n/g, " "), locale)}</p>;
  })}</div>;
}
