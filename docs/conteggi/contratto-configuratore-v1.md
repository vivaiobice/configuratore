# Vivai Obice — Scheda di interscambio per il Work Conteggi

**Contratto V1; fotografia del configuratore 1.0.5, 2 ottobre 2026.** Passare questa scheda all'altro Work insieme all'appendice comune del prompt allegato. «Proposto» significa interfaccia da implementare/coordinare, non funzione già disponibile.

## Destinazioni e routing

| Variabile / rotta | Valore e verifica |
|---|---|
| `CONFIGURATOR_BASE_URL` produzione | `https://progettaimpianto.vivaiobice.com/` — HTTP 200 alla verifica. |
| `COUNTS_BASE_URL` iniziale produzione | Previsto `https://progettaimpianto.vivaiobice.com/conteggi` — HTTP **404** alla verifica. Non pubblicare pulsanti finché la pagina separata non è disponibile. GitHub Pages risponde; il checkout include `CNAME`, non `conteggi/index.html` né una regola di rewrite. Verificare forma canonica con/senza slash dopo il packaging. |
| Sviluppo/test | URL distinti e configurabili per entrambi gli strumenti, da definire sull'hosting di test reale. Mai rinviare un test alla produzione. `src/config.js` oggi contiene `environment:'LIVE'` e non definisce le due basi o il flag; il Work Configuratore li introdurrà. |
| Futuro sottodominio | `conteggi.vivaiobice.com` è solo opzione futura. Un cambio di origine richiede prova Auth, storage, CORS e ritorno; nessun DNS ora. |

Convenzione comune: `?integrationVersion=1&view=resume|lists|new|list|counter|admin`; `view=new` e `view=lists` accettano `projectId`, `fieldId` opzionali, `view=list` usa `listId`, `view=counter` usa `listId` e `countId`. Apertura diretta senza query → liste e Riprendi; query invalide → fallback sicuro. Stessa scheda; ritorno a `CONFIGURATOR_BASE_URL` configurata, senza `returnUrl` libero. Nessun token, e-mail, nome, note, quantità o geometria negli URL. Gli ID non sono permessi. Il menu del logo usa `view=resume`, Profilo `view=lists`, scheda campo `view=new`, admin `view=admin`.

**Composizione proposta:** pubblicare `/conteggi/index.html` come entrypoint statico autonomo nel pacchetto del dominio e verificare GET, refresh, query e redirect slash. Il modulo non deve importare l'app completa del configuratore. Il menu del configuratore usa soltanto un client piccolo di CountsGateway. Proprietà del packaging unico da concordare, senza modifiche parallele a `index.html`, `src/app.js`, shell, migrazioni o policy.

## Identità, ID e campo

- Servizio già presente: `src/auth-service.js` usa una sessione Supabase; `src/auth-bridge.js` espone `getState()`/`subscribe()`. La vista contiene `kind:'guest'|'user'`, `user.id` (anche anonimo dopo `ensureAnonymousSession()`), `isAdmin` da `app_metadata.role`. Nessuna password/token va passato nell'URL o copiato in un altro archivio. Su `/conteggi` il Work Conteggi crea il proprio client leggero della **stessa** Auth e attende la sessione effettiva; la sola UI `isAdmin` non sostituisce controllo server.
- Chiavi locali della bozza/archivio sono già per owner in ambiente LIVE tramite `src/local-owner-scope.js`; il suo owner viene assegnato dopo il refresh Auth. I Conteggi guest solo locali non sono consultabili da admin. Per logout/login gli scope devono impedire il riuso di una bozza fra proprietari; non usare `Guest1234` come ID autorizzativo.
- `project.localProjectId` è un ID client; `state.cloud.projectId` è l'ID progetto cloud quando presente. `field.id` è il client field ID; il cloud usa `client_field_id` in `project_fields` e `field_plans`. Concordare con Conteggi il mapping server di projectId/fieldId prima di usare i parametri URL. Se un campo è solo locale o non sincronizzato, associazione pendente autorizzata quando sostenibile, altrimenti conteggio valido senza campo e associazione successiva. Mai finalizzare un perimetro per ottenere un ID.
- **FieldDirectory proposta, prodotta dal Configuratore:** per l'utente autenticato/guest corrente `listProjects(): Promise<ProjectRef[]>`, `listFields(projectId): Promise<FieldRef[]>`, `resolveField(projectId, fieldId): Promise<FieldRef|null>`; shape minima `ProjectRef={projectId,projectLabel}`, `FieldRef={projectId,projectLabel,fieldId,fieldLabel,varietyLabel?:string,associationStatus:'verified'|'pending'}`. `associationStatus` serve soltanto a non scambiare un ID locale per cloud. Il server deve verificare owner e stato del campo per ogni lookup. Nessuna geometria, clone, portinnesto, note, mappali o dati di altri proprietari. Associazione eliminata/inaccessibile: conservare il conteggio senza rivelare metadati del campo.
- Il codice pubblico e la visualizzazione amministrativa dei progetti di altri utenti **non** sono un permesso di leggere appunti dal profilo normale. Se i Work finiscono in bundle separati, FieldDirectory deve essere un modulo leggero condiviso o un servizio autorizzato; non basta importare `src/app.js`.

## CountsGateway / CountsAdmin richiesti al Work Conteggi

Fornire e documentare metodi reali, forme delle risposte, errori e gestione offline per: elencare recenti/liste dell'utente; riepilogo per campo; leggere una lista/conteggio; modificare titolo e quantità con revisione/conflitto; aprire note e associazione nel modulo; stato «Da sincronizzare». Il pannello desktop non usa SQL diretto, non conserva un secondo archivio e non fa il conteggio rapido +1. Tenere categorie separate e non scrivere su quantità progettate nel Configuratore. Specificare invalidazione/refresh al ritorno da Conteggi.

`CountsAdmin` rende appunti sincronizzati e richieste volontarie due insiemi distinti, dopo verifica del ruolo a ogni accesso protetto. Aprire una bozza in admin non crea una richiesta, non invia email e non profila il cliente. L'avviso sulla visibilità amministrativa va validato prima della prima raccolta/sincronizzazione; il prompt non è un testo legale approvato.

## Stato del Configuratore da preservare (responsabilità di questo Work)

L'attuale `src/storage.js` salva uno stato locale V2 ma non conserva `manualVertices` e modalità disegno di `src/map.js`, `mobileTransactionSnapshot` né la schermata mobile; la camera non è nello stato normalizzato (`src/state.js`). `src/project-sync.js` ha coda IndexedDB e conflitti, ma il suo `flush()` tenta la rete; per uno switch offline serve un checkpoint locale verificato e un accodamento durevole separato dalla navigazione. Il Configuratore aggiungerà una migrazione versionata del checkpoint e il ripristino per owner; Conteggi salva separatamente il proprio stato. Nessuno dei due Work deve chiamare Salva impianto o creare una lista server al solo caricamento del link.

## Brand verificato da riutilizzare

| Risorsa | Riferimento nel checkout |
|---|---|
| Logo originale attualmente usato | `assets/logo-vivai-obice-v14.png` (2047×626, PNG RGBA; SHA-256 `940fcaae10b85c6b3c04f800269be37c8f31c72340b2034ba94dbe5b692d2f85`). In `index.html` e `src/mobile-ui.js` con `?v=14`. |
| Variante già presente | `assets/logo-vivai-obice-lineare.png`, stesso hash e stessi byte del V14; nessuna ricostruzione necessaria. Altri vecchi file V10/V12/V13/light esistono ma non sono la variante corrente selezionata. |
| Favicon / touch | `assets/favicon-v26.png` (48×48), `assets/apple-touch-icon-v26.png` (180×180); `manifest.webmanifest` usa `assets/vivai-obice-icon-v26.png` (1254×1254 dichiarato). |
| Stile | `styles.css`: `Inter, ui-sans-serif, system-ui, ...`; verde `#183f28`, `#275f3e`, testo `#142019`, sfondo `#eef1ed`, superfici bianche, bordi `#dce2dd`. Mobile in `mobile.css`. Riusare proporzioni del logo, senza creare una scritta o un'icona diversa. |
| Testi/footer | Nel configuratore la testata desktop mostra «Configuratore» e la pagina «Progetta il tuo vigneto»; Conteggi deve essere esplicito nel suo pannello. Footer discreto previsto: «Uno strumento Vivai Obice» e «© 2026 Vivai Obice. Tutti i diritti riservati.» Non ho verificato un link istituzionale nella shell: nessun URL aggiuntivo o dato societario dedotto dal PDF. |

**Consegna dell'asset:** se i Work non condividono il checkout, trasferire il file PNG originale nel pacchetto di integrazione o come allegato binario con hash sopra; verificare hash dopo la copia. Nessuna credenziale necessaria. Conservare attribuzioni di servizi terzi.

## Responsabilità e dipendenze

| Prodotto | Proprietario unico |
|---|---|
| Header/logo/menu, editor/mobile, checkpoint V3, FieldDirectory, profilo/campo/admin link, flag del configuratore | Work Configuratore. |
| `/conteggi` entrypoint/app autonoma, gateway, dati e migrazioni dei conteggi, admin dei conteggi, feedback e ritorno | Work Conteggi. |
| Packaging comune e configurazione delle due basi | Un responsabile di rilascio concordato prima della fusione degli artefatti; nessuna modifica concorrente alla shell. |

**Mancano oggi:** pagina `/conteggi` (404), CountsGateway/CountsAdmin e metodi/forme concrete, configurazione test URL, decisione su mapping ID locale/cloud, prova di autorizzazione guest/admin e validazione dell'avviso amministrativo. Fino a questi riscontri il flag resta spento e non si pubblicano link.

**Verifiche di questa scheda:** lettura repository, risposte HTTP, metadati e hash file eseguiti; nessun test end-to-end, prova su dispositivi reali, scrittura al DB o deploy eseguiti.
