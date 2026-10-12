import Link from "next/link";
import type { ReactNode } from "react";
import { headingId } from "@/lib/guides";

/** A small, deliberately restricted Markdown dialect. HTML is rendered as text. */
function inline(text: string): ReactNode[] {
  return text.split(/(\[[^\]]+\]\([^\s)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) => {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const [ , label, href ] = link;
      if (href.startsWith("/") && !href.startsWith("//")) return <Link key={i} href={href} prefetch={false}>{label}</Link>;
      if (href.startsWith("https://")) return <a key={i} href={href} rel="noopener noreferrer">{label}</a>;
      return label;
    }
    if (part.startsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return part;
  });
}
export function GuideBody({ body }: { body: string }) {
  return <div className="guide-prose">{body.split(/\n\s*\n/).map((block, i) => {
    if (block.startsWith("```")) return <pre key={i}><code>{block.replace(/^```[^\n]*\n/, "").replace(/\n```$/, "")}</code></pre>;
    if (block.startsWith("### ")) return <h3 key={i} id={headingId(block.slice(4))}>{inline(block.slice(4))}</h3>;
    if (block.startsWith("## ")) return <h2 key={i} id={headingId(block.slice(3))}>{inline(block.slice(3))}</h2>;
    if (block.startsWith("- ")) return <ul key={i}>{block.split("\n").map((line, j) => <li key={j}>{inline(line.replace(/^- /, ""))}</li>)}</ul>;
    return <p key={i}>{inline(block.replace(/\n/g, " "))}</p>;
  })}</div>;
}
