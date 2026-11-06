import { Fragment } from 'react';

export default function ReadableText({text}:{text?:string|null}) {
  if(!text?.trim())return <p className="text-sm text-muted-foreground">Ainda não informado.</p>;
  return <div className="space-y-2 text-sm leading-7 text-foreground [overflow-wrap:anywhere]">{text.split(/\n+/).filter(line=>line.trim()).map((line,index)=>{
    const heading=/^#{1,4}\s+/.test(line),bullet=/^\s*([-*•]|\d+[.)])\s+/.test(line);
    const content=line.replace(/^\s*(#{1,4}\s+|[-*•]\s+|\d+[.)]\s+)/,'');
    const formatted=content.split(/(\*\*[^*]+\*\*)/g).map((part,i)=>part.startsWith('**')&&part.endsWith('**')?<strong key={i} className="font-semibold text-foreground">{part.slice(2,-2)}</strong>:<Fragment key={i}>{part}</Fragment>);
    return heading?<p key={index} className="pt-1 font-semibold text-foreground">{formatted}</p>:<p key={index} className={bullet?'flex gap-2':''}>{bullet&&<span aria-hidden="true" className="mt-3 h-1 w-1 shrink-0 rounded-full bg-primary/70"/>}<span>{formatted}</span></p>;
  })}</div>;
}
