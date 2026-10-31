import Link from 'next/link';
import dynamic from 'next/dynamic';
import messages from '@/local-tools/messages.json';
const LocalMediaTool=dynamic(()=>import('@/components/LocalMediaTool').then(m=>m.LocalMediaTool));
import {toolCopy,toolLinks,TOOL_GUIDES,TOOLS_LABEL,TOOL_UPDATED} from '@/local-tools/catalogue';
import {dictionary} from '@/i18n/dictionaries';
import {articlePath,homePath} from '@/i18n/config';
import {availableGuides} from '@/lib/guides';
import {SITE,faqSchema,jsonLdGraph} from '@/lib/seo';
import {localizedPageSchema,platformPageSchemas} from '@/lib/localized-seo';
import type {SitePage} from '@/lib/site-pages';
export function LocalToolView({page}:{page:SitePage}){
 if(page.identity.kind!=='local-tool')return null;
 const id=page.identity.id,copy=toolCopy(page.locale,id),d=dictionary(page.locale),url=new URL(page.path,SITE.url).href;
 const ownGuides=availableGuides(page.locale),related=TOOL_GUIDES[id].flatMap(id=>{const g=ownGuides.find(g=>g.id===id);return g?[g]:[];});
 return <article className="mx-auto max-w-4xl px-4 py-6 sm:px-6"><nav aria-label={d.breadcrumb} className="mb-4 text-sm text-slate-400"><Link href={homePath(page.locale)}>{d.home}</Link> / <span aria-current="page">{copy.heading}</span></nav><h1 className="text-3xl font-semibold sm:text-4xl">{copy.heading}</h1><LocalMediaTool key={`${page.locale}:${id}`} locale={page.locale} tool={id} messages={messages[page.locale]}/><p className="mt-7 text-lg text-slate-300">{copy.intro}</p><script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLdGraph([localizedPageSchema(page,copy.title,copy.description,TOOL_UPDATED),...platformPageSchemas(page,{...copy,supported:[]}),{...faqSchema(copy.faqs,url),inLanguage:page.locale}])}}/>{copy.sections.map(s=><section key={s.heading} className="mt-10"><h2 className="text-2xl font-semibold">{s.heading}</h2>{s.paragraphs.map(p=><p key={p} className="mt-4 leading-relaxed text-slate-300">{p}</p>)}</section>)}<section className="mt-10"><h2 className="text-2xl font-semibold">{d.faqTitle}</h2>{copy.faqs.map(f=><details key={f.question} className="mt-4 border-t border-white/10 py-4"><summary><h3 className="inline">{f.question}</h3></summary><p className="mt-3 text-slate-300">{f.answer}</p></details>)}</section><section className="mt-10"><h2 className="text-2xl font-semibold">{TOOLS_LABEL[page.locale]}</h2><ul className="mt-5 space-y-3">{toolLinks(page.locale).filter(t=>t.id!==id).map(t=><li key={t.id}><Link href={t.href} className="text-cyan-300">{t.label}</Link></li>)}{related.map(g=><li key={g.id}><Link href={articlePath(page.locale,g.slug)} className="text-cyan-300">{g.title}</Link></li>)}</ul></section></article>;
}
