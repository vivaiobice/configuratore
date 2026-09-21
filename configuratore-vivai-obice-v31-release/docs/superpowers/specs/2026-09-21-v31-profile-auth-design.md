# V31 — Profilo, login e continuità Guest

Data: 21 settembre 2026  
Ambiente autorizzato: TEST  
Baseline: V30

## 1. Obiettivo

La V31 introduce un accesso riconoscibile alla gestione dell'identità senza alterare editor,
geometria, calcoli o impaginazione desktop. Un visitatore può continuare a lavorare come Guest,
registrarsi oppure accedere a un account esistente. I progetti Guest presenti sul dispositivo non
devono andare persi durante il passaggio a un account.

## 2. Esperienza utente

### Mobile

- La barra principale contiene quattro voci: `Mappa`, `Campi`, `Progetti`, `Profilo`.
- `Profilo` apre una pagina interna coerente con la WebApp, non un sito o un popup esterno.
- In stato Guest mostra una spiegazione breve, `Accedi` e `Crea account`.
- In stato autenticato mostra nome profilo, username, e-mail, `Esci` e, per gli Admin, il comando
  `Amministrazione`.

### Desktop

- In alto a destra compare soltanto `Login` quando l'utente è Guest.
- Dopo l'accesso, lo stesso comando mostra il nome del profilo.
- Il clic apre un menu compatto con `Profilo`, `Esci` e, se autorizzato, `Amministrazione`.
- Editor, pannello laterale, mappa, riepilogo, stili e calcoli desktop restano invariati.

## 3. Credenziali

- La registrazione richiede nome visualizzato, e-mail, username e password.
- L'accesso usa un unico campo `E-mail o username` più password.
- Lo username è case-insensitive, univoco e lungo 3–32 caratteri.
- Sono ammessi lettere ASCII, numeri, punto, trattino e underscore; è ammesso uno username composto
  soltanto da cifre. Non viene trattato come numero telefonico.
- Lo username viene normalizzato in minuscolo e non può contenere `@`.
- L'e-mail serve per conferma account e recupero password.
- Gli errori di accesso sono intenzionalmente generici e non confermano l'esistenza di username o
  e-mail.

## 4. Modello dati e sicurezza

`public.profiles` viene estesa con:

- `username` normalizzato, univoco tramite indice su `lower(username)`;
- `display_name` obbligatorio per gli account permanenti;
- timestamp di aggiornamento.

La classificazione `guest/user/admin` continua a derivare esclusivamente da claim Auth protetti.
`user_metadata` non concede mai privilegi. Le policy RLS permettono a un utente di leggere e
aggiornare il proprio profilo, mentre l'Admin conserva la lettura globale già prevista.

L'accesso tramite username passa da una Edge Function TEST:

1. riceve identificatore e password tramite HTTPS;
2. applica validazione e limite dei tentativi;
3. risolve internamente lo username senza esporre l'e-mail;
4. effettua l'autenticazione password tramite Supabase Auth;
5. restituisce la sessione oppure lo stesso errore generico per credenziali errate.

La funzione non registra password, non restituisce l'e-mail risolta nei messaggi di errore e non
espone chiavi privilegiate al browser. Il login diretto per e-mail usa lo stesso servizio applicativo,
così UI e gestione errori restano identiche.

## 5. Registrazione e progetti Guest

### Nuovo account creato durante una sessione Guest

L'utente anonimo viene promosso tramite l'API Auth aggiungendo e-mail e password alla stessa identità.
Poiché `auth.uid()` non cambia, proprietà di progetti, campi e revisioni resta invariata. Dopo la
conferma e-mail, il profilo passa da Guest a User e riceve username e nome.

### Accesso a un account già esistente

Prima di sostituire la sessione Guest, il client richiede un grant monouso, casuale, con durata breve.
Il database conserva soltanto l'hash del token e l'ID Guest. Dopo il login, l'account permanente usa
quel grant per trasferire atomicamente progetti, campi, revisioni e dati collegati.

- Il grant è utilizzabile una sola volta e scade automaticamente.
- Solo l'identità Guest che lo crea può generarlo.
- Solo un account permanente autenticato può consumarlo.
- I retry sono idempotenti.
- In caso di collisione dello stesso `client_project_id`, prevale la copia dell'account e la copia
  Guest viene archiviata senza sovrascrittura silenziosa.
- Se il trasferimento fallisce, la copia locale rimane disponibile e l'interfaccia segnala che la
  sincronizzazione è in attesa.

## 6. Sessione e sincronizzazione

- L'avvio continua a creare automaticamente una sessione anonima quando non esiste un account.
- Un cambio Auth invalida l'identità in memoria e ricrea servizio cloud e coordinatore di sync con il
  nuovo `auth.uid()`.
- Le operazioni già accodate mantengono gli operation ID, ma vengono riconciliate soltanto dopo il
  trasferimento Guest completato.
- `Esci` chiude la sessione permanente e crea una nuova sessione Guest; non cancella dati locali.
- La UI mostra stati espliciti: Guest, verifica e-mail richiesta, autenticato, trasferimento in corso,
  sincronizzazione in attesa ed errore recuperabile.

## 7. Recupero password

`Password dimenticata?` invia il messaggio di recupero all'e-mail inserita. La risposta UI resta
generica. Il rientro dal link usa il callback Auth dell'Ambiente TEST e permette di impostare la nuova
password senza creare un nuovo account.

## 8. Admin

- Il ruolo Admin continua a dipendere esclusivamente da `app_metadata.role = admin`.
- Un account normale non può impostare o modificare questo claim.
- Il link `Amministrazione` compare solo dopo verifica della sessione e porta a `admin/`.
- La pagina Admin conserva il proprio controllo server-side/DB e non si fida della sola visibilità UI.

## 9. File previsti

- `src/auth-service.js`: stato Auth, registrazione, login per e-mail/username, logout e recupero.
- `src/profile-ui.js`: controller UI desktop condiviso con la pagina mobile.
- `src/mobile-ui.js`, `mobile.css`: quarta voce e schermata Profilo.
- `index.html`, CSS mobile-scoped o regole minime dedicate: trigger desktop in alto a destra.
- `src/app.js`, `src/backend.js`, `src/cloud.js`, `src/project-sync.js`: cambio identità e
  riconciliazione.
- nuova migrazione Supabase: username, grant Guest e RPC protette.
- nuova Edge Function TEST per login con alias.
- test unitari, DOM, schema/RLS, integrazione sessione e migrazione Guest.
- `PROMPT_JOURNAL.md`, `README.md` e rapporto V31.

## 10. Test di accettazione

1. Guest apre la WebApp e continua a creare/salvare senza registrarsi.
2. Guest si registra: `auth.uid()` resta stabile e i progetti restano visibili.
3. Login funziona sia con e-mail sia con username alfabetico o soltanto numerico.
4. Credenziali errate restituiscono sempre lo stesso messaggio.
5. Login a un account esistente trasferisce una sola volta i progetti Guest del dispositivo.
6. Perdita di rete durante il trasferimento non elimina la copia locale e il retry non duplica.
7. Logout produce una nuova sessione Guest senza cancellare archivi locali.
8. Solo un Admin vede e può aprire `Amministrazione`.
9. La barra mobile contiene Profilo senza sovrapposizioni su iPhone verticale/orizzontale.
10. Il desktop mostra Login/nome in alto a destra e conserva byte e comportamento dell'editor,
    salvo il nuovo controllo account autorizzato.
11. Tutti i 318 test V30 continuano a passare.

## 11. Esclusioni V31

- Login tramite telefono o SMS.
- Social login.
- Piani e pagamenti PRO.
- Importazione pubblica FieldArea.
- Modifiche a geometria, filari, pali, rese o editor.
- Pubblicazione in LIVE senza un nuovo consenso esplicito.
