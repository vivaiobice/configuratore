const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const trim=value=>String(value??'').trim();

export function missingProjectProfileFields(profile={}) {
  const missing=[];
  if(!trim(profile.firstName))missing.push('Nome');
  if(!trim(profile.lastName))missing.push('Cognome');
  if(!trim(profile.phone))missing.push('Telefono');
  if(!EMAIL_RE.test(trim(profile.email)))missing.push('E-mail');
  return missing;
}

export function projectContactFromProfile(profile={}) {
  const missing=missingProjectProfileFields(profile);
  if(missing.length)throw new Error(`Completa il Profilo per salvare o scaricare il progetto: ${missing.join(', ')}.`);
  return {
    firstName:trim(profile.firstName),lastName:trim(profile.lastName),
    phone:trim(profile.phone),email:trim(profile.email).toLowerCase(),
    companyName:trim(profile.companyName)
  };
}

export function assertSavedRevision(revision) {
  if(revision?.state==='conflict')throw new Error('Conflitto di versione: aggiorna il progetto e riprova. La bozza resta sul dispositivo.');
  if(revision?.state==='error')throw new Error(`Sincronizzazione non riuscita: ${revision.lastError||'riprova più tardi'}. La bozza resta sul dispositivo.`);
}
