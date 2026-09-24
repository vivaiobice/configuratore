function safePart(value){
  return String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/<[^>]*>/g,'').replace(/[^a-zA-Z0-9]+/g,' ')
    .trim().split(/\s+/).filter(Boolean).map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join('').slice(0,80);
}

export function buildReportPdfFilename({code,recipient={}}={}){
  const publicCode=String(code??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const client=safePart([recipient.firstName,recipient.lastName].filter(Boolean).join(' '))
    ||safePart(recipient.companyName)||'Cliente';
  return `Progetto_${publicCode||'VO'}_${client}.pdf`;
}
