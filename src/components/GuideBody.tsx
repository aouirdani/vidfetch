import Link from "next/link";
import type { GuideImage } from "@/lib/guides";
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
export function GuideBody({ body, locale = "en", images = [] }: { body: string; locale?: Locale; images?: GuideImage[] }) {
  return <div className="guide-prose">{body.split(/\n\s*\n/).map((block, i) => {
    const picture = /^!\[([^\]]+)\]\(([^\s)]+)\)$/.exec(block);
    if (picture) {
      const asset = images.find(image => image.src === picture[2] && image.alt === picture[1]);
      if (!asset || !/^\/guides\/lab\/[a-z0-9-]+\.(webp|avif)$/.test(asset.src) || !Number.isInteger(asset.width) || !Number.isInteger(asset.height) || asset.width < 1 || asset.height < 1 || asset.width > 5000 || asset.height > 5000) return <p key={i}>{picture[1]}</p>;
      return <figure key={i}><picture><source srcSet={asset.src} type={asset.src.endsWith(".avif") ? "image/avif" : "image/webp"} /><img src={asset.src} alt={asset.alt} width={asset.width} height={asset.height} loading="lazy" decoding="async" className="h-auto max-w-full rounded-xl border border-slate-200" /></picture>{asset.caption && <figcaption>{asset.caption}</figcaption>}</figure>;
    }
    const lines = block.split("\n");
    if (lines.length >= 2 && lines.every(line => line.startsWith("|")) && /^\|(?:\s*:?-+:?\s*\|)+$/.test(lines[1])) {
      const cells = (line: string) => line.slice(1, -1).split("|").map(cell => cell.trim());
      return <div className="guide-table" key={i}><table><thead><tr>{cells(lines[0]).map((cell,j) => <th key={j} scope="col">{inline(cell,locale)}</th>)}</tr></thead><tbody>{lines.slice(2).map((line,j) => <tr key={j}>{cells(line).map((cell,k) => <td key={k}>{inline(cell,locale)}</td>)}</tr>)}</tbody></table></div>;
    }
    if (/^\d+\. /.test(block) && lines.every(line => /^\d+\. /.test(line))) return <ol key={i}>{lines.map((line,j) => <li key={j}>{inline(line.replace(/^\d+\. /,""),locale)}</li>)}</ol>;
    if (block.startsWith("```")) return <pre key={i} dir="ltr"><code>{block.replace(/^```[^\n]*\n/, "").replace(/\n```$/, "")}</code></pre>;
    if (block.startsWith("### ")) return <h3 key={i} id={headingId(block.slice(4))}>{inline(block.slice(4), locale)}</h3>;
    if (block.startsWith("## ")) return <h2 key={i} id={headingId(block.slice(3))}>{inline(block.slice(3), locale)}</h2>;
    if (block.startsWith("- ")) return <ul key={i}>{block.split("\n").map((line, j) => <li key={j}>{inline(line.replace(/^- /, ""), locale)}</li>)}</ul>;
    return <p key={i}>{inline(block.replace(/\n/g, " "), locale)}</p>;
  })}</div>;
}
