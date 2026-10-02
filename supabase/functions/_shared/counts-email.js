import {CATEGORY_LABELS,countDetailLines} from '../../../conteggi/model.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function composeCountsEmail(submission,{from,assetBase='https://progettaimpianto.vivaiobice.com/'}={}){
 const {snapshot,contact,message,acceptedAt,submissionId}=submission;const year=new Date(acceptedAt).getFullYear();
 const lines=snapshot.entries.map(row=>[`${CATEGORY_LABELS[row.category]} · ${row.title}`,`Quantità: ${row.quantity}`,...countDetailLines(row),row.field?`Campo: ${row.field.associationStatus==='unavailable'?'non disponibile':row.field.fieldLabel}`:'',row.notes?`Note: ${row.notes}`:''].filter(Boolean).join('\n'));
 const signature=`Uno strumento Vivai Obice\n© ${year} Vivai Obice. Tutti i diritti riservati.`;
 const content=[`Conteggi | Vivai Obice`,`Rimesse, pali e appunti di campo`,`Lista: ${snapshot.listTitle}`,`Riepilogo trasmesso: ${acceptedAt}`,`Riferimento: ${submissionId}`,...lines,'',`Da: ${contact.firstName} ${contact.lastName}`,contact.companyName?`Azienda: ${contact.companyName}`:'',`Telefono: ${contact.phone}`,`E-mail: ${contact.email}`,message?`Messaggio: ${message}`:'','L’invio non costituisce un ordine.',signature].filter(Boolean).join('\n\n');
 return {from,to:['info@vivaiobice.com'],reply_to:contact.email,subject:'Conteggi | Vivai Obice',text:content,html:`<div style="font-family:Arial,sans-serif;color:#142019;max-width:680px"><img src="${escape(new URL('assets/logo-vivai-obice-v14.png',assetBase).href)}" width="230" alt="Vivai Obice"><h1>Conteggi</h1><p>Rimesse, pali e appunti di campo</p><div style="white-space:pre-wrap">${escape(content)}</div><p><a href="https://www.vivaiobice.com/">Sito</a> · <a href="https://www.vivaiobice.com/contatti">Contatti</a> · <a href="https://www.vivaiobice.com/privacypolicy">Privacy</a></p></div>`};
}
export async function deliverWithResend(body,{apiKey,idempotencyKey,fetch=globalThis.fetch}){
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify(body)});
 if(!response.ok){const error=new Error('Invio non confermato');error.definitive=response.status>=400&&response.status<500&&response.status!==408&&response.status!==429;throw error;}
 const result=await response.json();if(!result.id)throw new Error('Risposta provider non confermata');return result;
}
