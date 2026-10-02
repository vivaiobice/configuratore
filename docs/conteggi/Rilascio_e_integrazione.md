# Conteggi — implementazione per revisione e integrazione

Consegna del 2 ottobre 2026. Codice verificato: commit `322e175be0acdc42fa30149d761e05cfa396179e`.

Base repository: `ab25ab7d16bfc9ec35a3ffa7ec8a16ef90a0cbc3`; ramo isolato `feature/counts-v1`.
Questo pacchetto aggiunge il modulo e i servizi Conteggi. Non modifica shell, Profilo, editor, database remoto, account, DNS o produzione del configuratore. Nessuna email reale è stata inviata.

## Codice consegnato

| Area | File / interfaccia |
|---|---|
| Pagina autonoma | `conteggi/index.html`, `boot.js`, `ui.js`, `style.css` |
| Client unico configuratore/modulo | `src/counts-client.js`: `createCountsGateway({store?,scope,transport?,channel?})`, `createCountsTransport({client,environment})` |
| Persistenza | `conteggi/store.js`: `createCountsStore`, transazione IndexedDB completata, snapshot e outbox atomici |
| Dominio / navigazione | `conteggi/model.js`, `navigation.js`, `submission.js`; `integrationVersion=1` |
| Auth riutilizzata | `conteggi/runtime.js`: `createCountsRuntime`; riusa `createAuthService`, `createBackend`, `connectSupabase` già presenti |
| Consultazione amministrativa | `createCountsAdmin({transport,getScope})`; `counts-admin`, soltanto lettura |
| Servizi | `counts-api`, `submit-counts`; handler puro, repository, composer e adapter Resend |
| Migrazione additiva locale | `supabase/migrations/20261002025102_counts_v1.sql` generata dal CLI 2.119.0, non applicata |

La UI non importa `src/app.js`, librerie della mappa, catasto, suolo o editor. Il fallback Auth importa i modelli puri `fields.js`/`state.js` attraverso il backend esistente, senza avviarne le funzioni di progetto. Il catalogo usa direttamente la funzione pura esistente `listVarieties()`: nessun secondo catalogo, selettore clone o portinnesto.

## Scheda da consegnare esplicitamente al Work Configuratore

Le forme di `contratto-conteggi-v1.md` restano valide per le letture e modifiche concordate; quel documento conserva la fotografia precedente all’implementazione. **Questo documento ne aggiorna lo stato e le firme concrete:** pagina, gateway, admin e servizi esistono nel ramo locale, ma non sono pubblicati. I file non sono condivisi automaticamente fra Work: consegnare questo documento insieme al bundle/patch del ramo e agli allegati di contratto.

| Voce | Contratto concreto |
|---|---|
| Destinazione | `COUNTS_BASE_URL` → `/conteggi/` nello stesso dominio, dopo verifica di GET `/conteggi`, slash e refresh. Nessun DNS nuovo. |
| Apertura | `buildCountsUrl(base,{view,...})` da `conteggi/navigation.js`; stessa scheda, nessun `returnUrl` arbitrario. `resume`, `lists`, `new`, `list`, `counter`, `admin`. |
| Parametri | `integrationVersion=1`; `listId`, `countId`, `projectId` UUID cloud; `fieldId` testo client dentro progetto. Nessun token, recapito, nota o quantità nell’URL. `view=new` presenta il form senza scrivere dati. |
| Auth e namespace | Sessione Supabase esistente. `scope={backend:URL,environment:'LIVE'|'TEST',owner:user.id}` risolto prima di costruire il gateway. Cache separata anche in TEST. Non creare un guest locale generico. |
| Gateway | Metodi di lettura/modifica del contratto; `updateCount` e `updateList` richiedono `expectedRevision`, `expectedLocalRevision`, `operationId`. Le modifiche del desktop devono passare qui. Conservare la `localRevision` mostrata all’inizio della modifica, senza sostituirla con quella più recente prima del salvataggio. Generare l’`operationId` una volta per intenzione e riusarlo con gli stessi dati nei retry. Nessun SQL diretto, cache alternativa o contatore +1 nel configuratore. |
| Ripristino | `gateway.checkpoint(route)`, `resume()`, `refresh()`, `subscribe()`. `mountCountsUI(...).prepareExit()` attende il salvataggio e rilegge il checkpoint. Il configuratore conserva autonomamente il proprio editor/checkpoint V3. |
| Cambio identità | Prima di login/logout conservare il lavoro corrente; `prepareIdentityChange()` nel modulo. Il listener Auth deve chiamare **sincronicamente** `suspend()` appena cambia l’owner, prima di attendere qualunque hook; ogni invocazione verifica owner e fissa il token della sessione. `gateway.setScope(next)` invalida risposte del vecchio owner; `suspend()` blocca un’identità non risolta. Nessun trasferimento Conteggi implicito al login. |
| Associazione campo | `mountCountsUI({fieldDirectory,...})` riceve la `FieldDirectory` minima definita nel contratto. Non usa `listOwnedProjects`/`loadEditableProject`. Il backend Conteggi verifica soltanto ownership/stato delle associazioni. |
| UI riusabile | `mountCountsUI({gateway,route,config,fieldDirectory?,varietyCatalog?,authService?,admin?,feedback})`; `ready`, `whenIdle`, `prepareExit`, `prepareIdentityChange`, `refresh`, `destroy`. La UI contatore non va importata nel riepilogo desktop. |
| Admin | `createCountsAdmin`: `listUserLists(filter)`, `getUserList(listId)`, `listSubmissions(filter)`, `getSubmission(submissionId)`. Endpoint verifica `getUser` e ruolo attuale in `app_metadata`, con utente non anonimo. |
| Asset | Riferimenti diretti agli originali `assets/logo-vivai-obice-v14.png`, `favicon-v26.png`, `apple-touch-icon-v26.png`; hash approvati nel contratto precedente. Nessuna copia ridisegnata. |

### Dipendenze dell’altro Work

1. Consegnare l’adattatore `FieldDirectory` reale, il bootstrap Auth/coordinatore leggero comune e i valori centrali delle due basi URL. Il fallback usa i servizi attuali; dopo la consegna esplicita questo Work collegherà gli adattatori comuni in `conteggi/boot.js`. Attualmente i conteggi senza campo sono operativi; il selettore campi reale non è collegato.
2. Il trasferimento guest resta del coordinatore Auth esistente. È disponibile **solo il gancio privato** `private.counts_transfer_after_verified_grant(source,target,environment)`, senza permessi a client/service role: va chiamato dal coordinatore privilegiato nella transazione che verifica/consuma la prova guest, dopo scelta esplicita di trasferire Conteggi. Non è un endpoint di login o un nuovo sistema di grant. Il coordinatore deve anche trattare la coda locale non ancora sincronizzata; non copiarla automaticamente nel nuovo scope.
3. L’adapter Resend consegnato deve diventare quello comune anche per l’invio del configuratore, sostituendo il suo codice inline con una chiamata condivisa. Questo Work non modifica `submit-quote`. Non pubblicare due nuovi adapter: adottare quello consegnato e preservare i secret/mittente verificati dal responsabile del rilascio.
4. Collegamenti in header/Profilo/campi/riepilogo desktop/ingresso admin e checkpoint dell’editor sono esclusivamente del Work Configuratore. Il rilascio deve avere un solo responsabile per assemblare i due rami.

### Firme aggiuntive effettivamente consegnate

```text
// scope è obbligatorio anche nel transport: non derivare l’owner dal payload.
transport.request(action, input, scope)
transport.submit(input, scope)
transport.admin(action, input, scope)
createCountsAdmin({transport, getScope: gateway.getScope})

// UUID generati una sola volta; riusare dati e identificativi nei ritentativi.
gateway.createList({title, listId?, operationId?})
gateway.createCount({listId, countId?, operationId?, category, title?, varietyLabel?, quantity?, notes?, field?})
gateway.changeQuantity(listId, countId, action, value?, operationId?)
gateway.deleteList(listId, expectedLocalRevision, operationId?)
gateway.deleteCount(listId, countId, expectedLocalRevision, operationId?)

// Correzioni esplicite e richieste volontarie; nessun invio in background.
gateway.resolveConflict(kind, entityId, 'local' | 'remote' | 'unassociate')
gateway.listRecoveryProposals()
gateway.submit(review)
gateway.retrySubmission(submissionId)
```

Il riepilogo campo restituisce soltanto `countId`, `listId`, `title`, `quantity`, `revision`, `syncState` negli `items`; recuperare `getCount()` per aprire la modifica completa. I totali sono stringhe decimali esatte, separati per categoria. `localRevision` è l’indice della versione locale mostrata, non una revisione SQL.

Le mutazioni locali possono restituire `LOCAL_STORAGE_FAILED`, `VERSION_CONFLICT`, `IDENTITY_UNRESOLVED`, `AUTH_REQUIRED`, `NOT_FOUND_OR_FORBIDDEN`, `VALIDATION_ERROR`. Le risposte server aggiungono `NOTICE_REQUIRED`, `ADMIN_REQUIRED`, `FIELD_UNAVAILABLE`, `SERVICE_DISABLED`, `SYNC_UNAVAILABLE`. Il client non deve usare un messaggio di errore come prova di ownership.

Le eliminazioni server non vengono annullate da un client rimasto offline. La proposta locale e gli appunti dei figli di una lista eliminata vengono conservati nell’archivio di recupero e mostrati nelle liste, dopo scelta esplicita. Un conflitto o errore definitivo su una voce sospende la sua coda senza bloccare le altre liste. Durante un cambio account, le azioni locali fallite restano legate al vecchio scope e si possono ritentare quando si torna a quel profilo.

`submit()` conserva la richiesta prima dell’invocazione. Un esito incerto conserva stesso ID e payload; un rifiuto definitivo permette di correggere e rivedere prima di una nuova conferma. Una richiesta già accettata conserva anche `noticeVersion`; il ritentativo email mantiene lo stesso riepilogo anche dopo una successiva modifica dei conteggi o dell’avviso. Per un nuovo riepilogo è obbligatoria la versione attuale dell’avviso. Stati email: `pending`, `sending`, `provider_accepted`, `failed`, `uncertain`; la UI offre un ritentativo esplicito della medesima richiesta nei casi non confermati.

## Attivazione: quattro gate distinti

I flag browser in `conteggi/config.js` sono spenti. Anche il server li considera spenti se i secret non sono esplicitamente configurati. Un flag browser non concede permessi.

| Configurazione server | Significato |
|---|---|
| `COUNTS_ENVIRONMENT` | Ambiente servito, default TEST; richieste con altro ambiente rifiutate. |
| `COUNTS_ALLOWED_ORIGINS` | Lista esatta separata da virgole; nessun wildcard. |
| `COUNTS_NOTICE_VERSION` | Versione dell’avviso validato; senza valore sync resta disattivata. |
| `COUNTS_SYNC_ENABLED` | Raccolta appunti soltanto dopo avviso riconosciuto per owner/ambiente/versione. |
| `COUNTS_ADMIN_ENABLED` | Consultazione amministrativa autorizzata; non invia richieste. |
| `COUNTS_SUBMIT_ENABLED` | Accettazione volontaria del riepilogo immutabile; non è un ordine. |
| `COUNTS_EMAIL_ENABLED` | Invio tramite provider; indipendente dall’accettazione della richiesta. |
| Secret esistenti | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `QUOTE_EMAIL_FROM`; nessun valore segreto nel pacchetto. |
| `CONFIGURATOR_BASE_URL` | Base degli asset originali nei messaggi email. |

Le nuove Edge Functions richiedono la validazione del JWT nell’handler tramite `getUser`. Nel deployment verificare la compatibilità delle chiavi publishable e della verifica JWT del gateway Supabase; se si usa `--no-verify-jwt`, l’autenticazione esplicita nell’handler deve restare obbligatoria. Non modificare la configurazione globale delle funzioni esistenti.

**Privacy da validare prima della raccolta pubblica:** titolare, base giuridica del servizio e della consultazione admin, destinatari/processore email, tempi di conservazione, cancellazione/esportazione e contatti per i diritti. Il testo dell’avviso incluso è una bozza funzionale; il link all’informativa esistente non costituisce validazione. Nessun consenso marketing, invio automatico o uso commerciale degli appunti è introdotto.

## Verifiche e limiti

Esito locale finale: **792/792 test**, comprendenti **750 preesistenti + 42 Conteggi**, nessun test saltato. `npm run check`, sintassi di tutti i nuovi moduli JS, `git diff --check` e Deno 2.9.6 sulle tre funzioni passati. Chromium desktop e iPhone 13 emulato passati. Le prove di regressione sono state prima osservate fallire e poi passare dopo le correzioni. Nessuna dipendenza applicativa aggiunta al package del configuratore: PGlite e fake-indexeddb sono dipendenze di sviluppo del package `conteggi/`.

Per riprodurre: `npm ci`, `npm ci --prefix conteggi`, `npm test`; per i soli nuovi test: `node --test tests/counts-*.test.mjs`. Il browser runner `scripts/counts-browser.mjs` richiede Playwright e Chromium disponibili nell’ambiente; avvia autonomamente un server locale e blocca richieste esterne. Deno richiede risoluzione del package Supabase dichiarato nell’entrypoint, con `--no-lock` e ambiente dipendenze appropriato. Non eseguire un deploy per collaudare la UI.


- Test reali su IndexedDB emulato: transazione abortita dopo `put`, scope guest/utenti e TEST/LIVE, 30 incrementi/3 decrementi, idempotenza/CAS, conflitto conservato, callback account vecchio e ripristino.
- SQL eseguito in PostgreSQL locale PGlite: ownership, RLS/DML negati, CAS, idempotenza, tombstone, campo di altro owner, separazione ambiente, snapshot immutabile e lease email. Non è un test sul database remoto.
- Browser Chromium desktop/mobile emulato: tocchi/click, tastiera, perdita rete a pagina aperta, reload/ripresa, note, escaping, layout e navigazione al placeholder. Auth/provider sono adapter di prova e le richieste esterne sono bloccate.
- Deno type check sulle tre funzioni. Suite preesistente del configuratore da mantenere verde.
- Non verificati: telefono fisico (aptica/audio e restrizioni Safari), vera andata/ritorno con checkpoint editor dell’altro Work, FieldDirectory/coordinatore guest reali, deploy/hosting remoto, mittente/provider effettivi, consegna email. `provider_accepted` significa accettazione provider, non consegna al destinatario.
- Una pagina già aperta continua offline; non è promesso riaprire una pagina chiusa senza rete. Non è stata aggiunta una PWA.

## Rilascio e ripristino proposti

1. Integrare i rami in un ambiente di prova, conservando base e commit di entrambi. Installare solo le dipendenze di sviluppo necessarie ai test. Ricontrollare il timestamp della nuova migrazione e le routine/RLS prima di applicarla in staging.
2. Pubblicare asset e `/conteggi/` con flag spenti. Verificare MIME dei moduli JS, route/slash/refresh, asset originali e rollback del pacchetto statico.
3. Applicare la migrazione additiva in staging e pubblicare le tre funzioni con gate chiusi. Eseguire test con account guest/utenti/admin distinti e provider finto/sandbox, senza email a destinatari reali.
4. Dopo validazione privacy, configurare avviso e flag sincronizzazione. Poi validare admin; richiesta ed email hanno gate separati. Collaudare doppio clic, esito incerto, cambio account, revoca admin e handoff reale prima di rendere visibili i link del configuratore.
5. In caso di problema: spegnere immediatamente i gate server interessati, poi i link browser. Ripristinare il precedente pacchetto statico/funzioni; conservare IndexedDB, tabelle e snapshot, senza cancellare dati né rimuovere la migrazione in produzione. La coda locale deve restare leggibile e riprovabile con il codice corretto.
6. Una richiesta offline non viene trasmessa alla riconnessione. Il retry usa lo stesso riepilogo/key/body. Dopo la finestra prudente di 23 ore da un primo tentativo incerto, la consegna si ferma come `uncertain`; richiede riconciliazione del provider, senza creare un nuovo invio automatico.

## Revisione finale e decisioni di esecuzione

Una revisione finale indipendente è stata completata sul commit `c446a14`; è seguita una sola passata correttiva, senza una seconda revisione. Le prove dopo le correzioni sono descritte sopra.

| Problema rilevato | Correzione verificata |
|---|---|
| Token del nuovo account usato con dati del precedente; A→B→A con hook lento | Sospensione immediata, owner osservato separato, epoch e token vincolato all’owner della richiesta |
| Creazione già conservata ripetuta dopo errore checkpoint | ID di entità e operazione stabili, comando locale idempotente |
| Coda di errore A blocca B o agisce sul suo percorso | Coda e contesto conservati per scope; UI B operativa subito |
| Correzione manuale letta dopo aggiornamento del DOM | Valore e revisione catturati all’evento |
| Nota su schermata vecchia sovrascrive versione aggiornata | CAS sulla revisione mostrata, entrambe le proposte conservate; ACK tardivo non cancella il conflitto |
| Eliminazione/conflitto blocca tutta la sincronizzazione | Quarantena della sola entità, tombstone autorizzato, recupero appunti anche dei figli |
| Email non confermata induce nuova richiesta/chiave | Ritentativo esplicito del riepilogo immutabile accettato |
| Riepilogo rifiutato non più correggibile | Ritorno al form per richieste non tentate/rifiutate; payload incerto resta immutabile |
| Tasto Invio tenuto premuto ripete il conteggio | Evento tastiera ripetuto ignorato; prova reale Chromium |

**Due rilievi minori rinviati, da rifinire prima dell’attivazione pubblica:** il feedback sonoro/aptico segnala l’intenzione del tocco prima dell’ACK locale e usa lo stesso tono per +/−; l’azione globale Sincronizza può mostrare “Sincronizzazione verificata” mentre singole voci rimangono in attesa o conflitto (il loro stato resta visibile). Non sono stati nascosti dalla consegna.

Decisioni registrate durante l’esecuzione: ramo isolato per preservare la base; innesti per gli adattatori mancanti senza ricreare servizi del configuratore; migrazione solo locale; catalogo puro esistente riutilizzato; adapter email comune da adottare anche nell’altro Work; gancio guest interno subordinato al coordinatore/prova condivisi. Gli helper del ledger della skill non erano disponibili: è stato mantenuto un registro equivalente locale, incluso nel pacchetto di consegna.

Non è stata creata una Dashboard aziendale. Nessun test locale viene presentato come verifica di privacy, produzione, backup remoto, provider reale o passaggio completo fra i due strumenti.
