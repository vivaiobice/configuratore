import { resolveProductionLot } from './lot-lookup.js';

const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean=(value,max=160)=>String(value??'').trim().slice(0,max);

export function validateQuoteContact(raw={}) {
  const contact={firstName:clean(raw.firstName),lastName:clean(raw.lastName),companyName:clean(raw.companyName),
    phone:clean(raw.phone,32),email:clean(raw.email,254).toLowerCase()};
  if(!contact.firstName)throw new TypeError('Nome obbligatorio');
  if(!contact.lastName)throw new TypeError('Cognome obbligatorio');
  if(!contact.phone)throw new TypeError('Telefono obbligatorio');
  if(!EMAIL.test(contact.email))throw new TypeError('E-mail non valida');
  return contact;
}

export function buildQuoteRequest({project,fields,fieldIds,contact}) {
  const person=validateQuoteContact(contact);
  const wanted=[...new Set(fieldIds??[])];
  if(!wanted.length || wanted.length>50)throw new TypeError('Seleziona almeno un campo');
  const byId=new Map((fields??[]).map(field=>[String(field.client_field_id),field]));
  if(wanted.some(id=>!byId.has(String(id))))throw new TypeError('Campo non appartenente al progetto');
  const details=wanted.map(id=>{
    const field=byId.get(String(id)),design=field.design_data??{};
    const lot=resolveProductionLot({variety:design.grapeVariety,clone:design.cloneSelection,rootstock:design.rootstock});
    const plants=Math.max(0,Math.round(Number(field.simulated_plants)||0));
    const commercial=Math.max(0,Math.round(Number(field.commercial_plants_25)||0))||Math.ceil(plants/25)*25;
    const lines=[`Campo: ${clean(field.label,120) || 'Campo'}`,
      `Superficie: ${Math.round(Number(field.gross_area_m2)||0)} m²`,
      `Quantità commerciale barbatelle: ${commercial}`,
      `Vitigno: ${clean(design.grapeVariety)||'Da definire'}`,
      `Clone: ${clean(design.cloneSelection)||'Da definire'}`,
      `Portainnesto: ${clean(design.rootstock)||'Da definire'}`,
      `Lotto univoco: ${lot.lot??'Da assegnare (verificare in vivaio)'}`];
    return {id:String(id),lotStatus:lot.status,lot:lot.lot,candidates:lot.candidates,lines};
  });
  const text=[`Richiesta preventivo · ${clean(project?.public_code)||'progetto senza codice'}`,
    `Progetto: ${clean(project?.name)||'Il mio impianto'}`,
    `Cliente: ${person.firstName} ${person.lastName}`,
    `Azienda: ${person.companyName||'—'}`,
    `Telefono: ${person.phone}`,`E-mail: ${person.email}`,
    '',...details.flatMap(detail=>[...detail.lines,'']),
    'Lotti e quantità sono indicativi: verificare la disponibilità commerciale prima di formulare un’offerta.'].join('\n');
  return {fieldIds:wanted.map(String),contact:person,details,text};
}
