import {selectedDetailLines} from './reading-title.js?v=1.3.7';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
 reset:'<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
 trash:'<path d="M3 6h18M9 6V4h6v2M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
 sync:'<path d="M20 3v5h-5M4 21v-5h5M20 8a8 8 0 0 0-14-3M4 16a8 8 0 0 0 14 3"/>',
 sound:'<path d="M11 5 6 9H3v6h3l5 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
 mute:'<path d="M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6"/>',
 haptic:'<rect x="8" y="3" width="8" height="18" rx="2"/><path d="m4 7-2 3 2 4-2 3m18-10-2 3 2 4-2 3M11 18h2"/>',
 hapticOff:'<rect x="8" y="3" width="8" height="18" rx="2"/><path d="m3 3 18 18"/>',
 archive:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 12h6M9 17h6"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 plants:'<path d="M12 21V10m0 5C3 15 3 9 3 6c6 0 9 3 9 9Zm0-4c0-6 3-8 9-8 0 6-3 8-9 8Z"/>',
 posts:'<path d="M8 21V3h4v18m6 0V6h3v15M3 10h19M3 16h19"/>',
 other:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 save:'<path d="m5 12 4 4L19 6"/>',
 edit:'<path d="m14 5 5 5M4 20l4-1L20 7a2 2 0 0 0-3-3L5 16l-1 4Z"/>',
 plus:'<path d="M12 4v16M4 12h16"/>',
 share:'<path d="M12 16V3m-5 5 5-5 5 5M5 12v8h14v-8"/>',
 back:'<path d="m14 5-7 7 7 7"/>',
 pagePlus:'<path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M12 11v7m-3-3.5h6"/>',
 storage:'<path d="M5 3h12l3 3v15H4V3h1Zm2 0v6h10V3M8 21v-7h8v7"/>'
};
export const icon=name=>`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]??paths.other}</svg>`;
export function counterView(count,feedback){
 const preferences=feedback?.getPreferences?.()??{sound:false,haptic:true},capabilities=feedback?.capabilities??{};
 const toggle=(name,label,on,off)=>`<button type="button" class="icon-button feedback-toggle" data-action="toggle-feedback" data-preference="${name}" aria-label="${label}${capabilities[name]?'':' non disponibile'}" title="${label}${capabilities[name]?'':' non disponibile in questo browser'}" aria-pressed="${Boolean(preferences[name]&&capabilities[name])}" ${capabilities[name]?'':'disabled'}>${icon(preferences[name]&&capabilities[name]?on:off)}</button>`;
 return `<section class="impulse-counter" aria-label="Contatore a impulsi">
  <img class="counter-watermark" src="../assets/logo-filigrana.png" alt="" aria-hidden="true" width="726" height="670">
  <div class="counter-toolbar">
   <button type="button" class="icon-button reset-button" data-action="reset" aria-label="Azzera lettura" title="Azzera lettura">${icon('reset')}</button>
   <div class="feedback-icons">${toggle('sound','Audio','sound','mute')}${toggle('haptic','Vibrazione','haptic','hapticOff')}</div>
   <button type="button" class="icon-button" data-action="back" aria-label="Elenco letture" title="Elenco letture">${icon('archive')}</button>
   <button type="button" class="icon-button" data-tool="configurator" aria-label="Torna al configuratore" title="Torna al configuratore">${icon('back')}</button>
  </div>
  <div class="type-switch" role="group" aria-label="Cosa stai contando">${[['plants','Viti'],['posts','Pali'],['other','Altro']].map(([category,label])=>`<button type="button" data-action="category" data-category="${category}" aria-pressed="${count.category===category}" aria-label="${label}">${icon(category)}<span>${label}</span></button>`).join('')}</div>
  <label class="reading-title"><span class="sr-only">Nome lettura</span><input name="title" value="${esc(count.title)}" maxlength="200" required aria-label="Nome lettura" aria-describedby="reading-title-hint">${icon('edit')}</label><p id="reading-title-hint" class="reading-title-hint">Tocca il nome per modificarlo</p>
  <button type="button" class="counter-details-trigger" data-action="counter-details" aria-haspopup="dialog">${icon('plus')}<span>Aggiungi dettagli</span></button>
  <p class="counter-detail-summary" aria-label="Dettagli selezionati" ${selectedDetailLines(count).length?'':'hidden'}>${selectedDetailLines(count).map(line=>`<span>${esc(line)}</span>`).join('')}</p>
  <div class="number-stage"><output id="quantity-display" aria-label="Quantità" aria-live="off" style="--digits:${String(count.quantity).length}">${count.quantity}</output><span class="number-unit">${count.category==='plants'?'Barbatelle / Viti':count.category==='posts'?'Pali':'Elementi'}</span>${count.field?`<span class="counter-field">${esc(count.field.fieldLabel)}${count.field.associationStatus==='pending'?' · bozza':''}</span>`:''}</div>
  <div class="impulse-controls"><button type="button" data-action="decrement" class="decrement" aria-label="Togli uno" ${count.quantity===0?'disabled':''}>−1</button><button type="button" data-action="increment" class="increment" aria-label="Aggiungi uno">${icon('plus')}<span class="sr-only">+1</span></button></div>
  <button type="button" data-action="confirm-count" class="save-reading">${icon('save')}<span>Salva lettura</span></button>
 </section>`;
}
