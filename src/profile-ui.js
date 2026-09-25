import {getTheme,setTheme} from './theme.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function createProfileUI({authService,document=globalThis.document}){
  if(!authService||!document)throw new TypeError('Auth service e document richiesti');
  const trigger=document.querySelector('#profile-trigger'),menu=document.querySelector('#profile-menu');
  let state=authService.getState?.()??{kind:'guest'},unsubscribe=null,dialog=null;
  const closeMenu=()=>{menu.hidden=true;menu.classList.add('profile-menu');trigger.setAttribute('aria-expanded','false');};
  function themeSelector(){const label=document.createElement('label');label.className='profile-theme-label';label.textContent='Preferenza tema';const select=document.createElement('select');select.dataset.themeChoice='true';for(const [value,title] of [['light','Modalità luminosa'],['dark','Dark Mode'],['auto','Automatico']]){const option=document.createElement('option');option.value=value;option.textContent=title;option.selected=value===getTheme();select.append(option);}select.addEventListener('change',()=>setTheme(select.value,{root:document.documentElement}));label.append(select);return label;}
  function feedback(message,error=false){const node=dialog?.querySelector('.profile-feedback');if(node){node.textContent=message||'';node.classList.toggle('error',error);}}
  function ensureDialog(){
    if(dialog)return dialog;
    dialog=document.createElement('div');dialog.className='profile-dialog';dialog.hidden=true;
    dialog.innerHTML='<section class="profile-dialog-card" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title"><header class="profile-dialog-head"><h2 id="profile-dialog-title">Profilo</h2><button class="profile-dialog-close" type="button" aria-label="Chiudi">×</button></header><div class="profile-dialog-body"></div><p class="profile-feedback" role="status"></p></section>';
    document.body.append(dialog);
    dialog.querySelector('.profile-dialog-close').addEventListener('click',()=>dialog.hidden=true);
    dialog.addEventListener('click',async event=>{
      const authAction=event.target.closest?.('[data-auth-action]')?.dataset.authAction;
      const profileAction=event.target.closest?.('[data-profile-action]')?.dataset.profileAction;
      if(!authAction&&!profileAction)return;
      const login=dialog.querySelector('.profile-login'),register=dialog.querySelector('.profile-register');
      if(authAction==='show-register'){login.hidden=true;register.hidden=false;return;}
      if(authAction==='show-login'){register.hidden=true;login.hidden=false;return;}
      feedback('Attendi…');
      try{
        if(authAction==='login')await authService.login({identifier:login.querySelector('[name="identifier"]').value,password:login.querySelector('[name="password"]').value});
        if(authAction==='register')await authService.register({displayName:register.querySelector('[name="displayName"]').value,email:register.querySelector('[name="email"]').value,username:register.querySelector('[name="username"]').value,password:register.querySelector('[name="newPassword"]').value});
        if(authAction==='reset')await authService.requestPasswordReset(login.querySelector('[name="identifier"]').value);
        if(profileAction==='save'){
          const form=dialog.querySelector('.profile-details');
          await authService.updateProfile(Object.fromEntries(['firstName','lastName','companyName','address','postalCode','city','province','vatNumber','phone'].map(key=>[key,String(form.querySelector(`[name="${key}"]`)?.value??'').trim()])));
          feedback('Profilo aggiornato.');return;
        }
        if(profileAction==='reset-password'){await authService.requestPasswordReset(state.email);feedback('Ti abbiamo inviato le istruzioni per reimpostare la password.');return;}
        if(profileAction==='logout'){await authService.logout();dialog.hidden=true;return;}
        feedback(authAction==='reset'?'Se l’account esiste, riceverai un’e-mail.':'Operazione completata.');if(authAction!=='reset')dialog.hidden=true;
      }catch(error){feedback(error.message||'Operazione non riuscita',true);}
    });
    return dialog;
  }
  function renderGuestBody(node){
    node.innerHTML='<div class="profile-login"><label>E-mail o username<input name="identifier" autocomplete="username"></label><label>Password<input name="password" type="password" autocomplete="current-password"></label><button class="profile-primary" data-auth-action="login">Accedi</button><button data-auth-action="show-register">Crea account</button><button data-auth-action="reset">Password dimenticata?</button></div><div class="profile-register" hidden><label>Nome profilo<input name="displayName" autocomplete="name"></label><label>E-mail<input name="email" type="email" autocomplete="email"></label><label>Username<input name="username" autocomplete="username" placeholder="anche solo numeri"></label><label>Password<input name="newPassword" type="password" autocomplete="new-password"></label><button class="profile-primary" data-auth-action="register">Crea account</button><button data-auth-action="show-login">Ho già un account</button></div>';
  }
  function renderUserBody(node){
    node.innerHTML=`<form class="profile-details"><div class="profile-fields"><label>Nome<input name="firstName" autocomplete="given-name" value="${esc(state.firstName)}"></label><label>Cognome<input name="lastName" autocomplete="family-name" value="${esc(state.lastName)}"></label><label class="profile-wide">Azienda<input name="companyName" autocomplete="organization" value="${esc(state.companyName)}"></label><label class="profile-wide">Indirizzo<input name="address" autocomplete="street-address" value="${esc(state.address)}"></label><label>CAP<input name="postalCode" autocomplete="postal-code" value="${esc(state.postalCode)}"></label><label>Località<input name="city" autocomplete="address-level2" value="${esc(state.city)}"></label><label>Provincia<input name="province" autocomplete="address-level1" maxlength="2" value="${esc(state.province)}"></label><label>Partita IVA<input name="vatNumber" autocomplete="off" value="${esc(state.vatNumber)}"></label><label>Telefono<input name="phone" autocomplete="tel" value="${esc(state.phone)}"></label><label>E-mail<input value="${esc(state.email)}" readonly></label></div><button class="profile-primary" data-profile-action="save" type="button">Salva dati profilo</button></form><div class="profile-account-actions"><button data-profile-action="reset-password" type="button">Reimposta password</button><button data-profile-action="logout" type="button">Esci / Logout</button></div>`;
  }
  function openProfile(){
    closeMenu();const node=ensureDialog(),body=node.querySelector('.profile-dialog-body');
    node.querySelector('#profile-dialog-title').textContent=state.kind==='user'?'Il tuo profilo':'Accedi';
    if(state.kind==='user')renderUserBody(body);else renderGuestBody(body);
    body.append(themeSelector());feedback('');node.hidden=false;
  }
  function render(next){state=next??{kind:'guest'};trigger.textContent=state.kind==='user'?(state.displayName||'Profilo'):'Login';menu.replaceChildren();
    if(state.kind==='user'){
      const profile=document.createElement('button');profile.type='button';profile.textContent='Profilo';profile.addEventListener('click',openProfile);menu.append(profile);
      if(state.isAdmin){const admin=document.createElement('a');admin.href='./admin/';admin.textContent='Amministrazione';admin.setAttribute('role','menuitem');menu.append(admin);}
      const logout=document.createElement('button');logout.type='button';logout.textContent='Esci';logout.addEventListener('click',async()=>{closeMenu();await authService.logout();});menu.append(logout);
    }else closeMenu();
  }
  function onTrigger(){if(state.kind!=='user'){openProfile();return;}const opening=menu.hidden;menu.hidden=!opening;trigger.setAttribute('aria-expanded',String(opening));}
  function onKey(event){if(event.key==='Escape'){closeMenu();if(dialog)dialog.hidden=true;}}
  function mount(){trigger.addEventListener('click',onTrigger);document.addEventListener('keydown',onKey);unsubscribe=authService.subscribe(render);render(state);}
  function destroy(){trigger.removeEventListener('click',onTrigger);document.removeEventListener('keydown',onKey);unsubscribe?.();dialog?.remove();}
  return {mount,destroy,openProfile};
}
