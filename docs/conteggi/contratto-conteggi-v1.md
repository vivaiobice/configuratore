# Conteggi Vivai Obice scheda per il Work Configuratore

**Contratto V1 — proposta tecnica del Work Conteggi, 2 ottobre 2026.**

Questa scheda accompagna il piano e la specifica v2. È un documento di interscambio da trasferire esplicitamente; non implica accesso automatico ai file o ai messaggi dell'altro Work. Le interfacce sotto sono proposte concrete da implementare dopo revisione; oggi /conteggi risponde 404 e CountsGateway/CountsAdmin non esistono.

Fotografia: repository vivaiobice/configuratore, main, commit ab25ab7d16bfc9ec35a3ffa7ec8a16ef90a0cbc3, package 1.0.5. Letta la vostra Scheda_interscambio_Work_Conteggi_V1.md: convenzioni URL mantenute. Non modificare questa scheda precedente presumendo una sincronizzazione fra Work.

## 1. Destinazioni, ambiente e apertura

| Ambiente | CONFIGURATOR_BASE_URL | COUNTS_BASE_URL | Stato |
|---|---|---|---|
| Produzione | https://progettaimpianto.vivaiobice.com/ | https://progettaimpianto.vivaiobice.com/conteggi | Radice 200; Conteggi 404 al controllo. Destinazione prevista, non attiva. |
| Locale proposto | http://localhost:4173/ | http://localhost:4173/conteggi/ | Convenzione di test da configurare dopo revisione, non server avviato. |
| Integrazione/staging | Da assegnare sull'hosting di test reale | Stessa origine test + /conteggi | Mancante; nessuna stringa produzione come fallback. |
| Futuro | Base configurata dello strumento | conteggi.vivaiobice.com, solo eventuale | Non configurato. Richiede Auth/storage/CORS e prova fra origini, non solo cambio URL. |

Configurazione centrale unica per ambiente e destinazioni, di proprietà Work Configuratore; letta da entrambi. Asset base deve essere risolto rispetto all'origine/configurazione condivisa. Entrambi sono entrypoint statici distinti nello stesso pacchetto; nessuna necessità di due deploy.

Entry point proposto conteggi/index.html. Verificare GET /conteggi, /conteggi/, query e refresh. Pages può rendere canonico lo slash finale: concordare valore risultante dopo prova reale; il client costruisce URL dalla base configurata e conserva i parametri. Non cambiare silenziosamente il contratto in hash routing o history routing.

Tutti i passaggi nella stessa scheda. Ritorno soltanto a CONFIGURATOR_BASE_URL validata; nessun returnUrl arbitrario, token, nominativo, email, quantità, nota o geometria negli URL. App Conteggi non importa src/app.js, cloud hydration progetti, librerie o CSS della mappa.

## 2. View da implementare

Ogni link generato usa integrationVersion=1. Identificativi verificati per formato e poi autorizzazione; versione sconosciuta o query malformata → errore/fallback sicuro senza creare/cancellare dati.

| View | Parametri | Azione | Ingresso nel configuratore |
|---|---|---|---|
| resume | Nessuno | Ultimo contesto Conteggi dell'owner; altrimenti liste/primo avvio | Logo, scelta Conteggi |
| lists | projectId e fieldId facoltativi | Archivio, filtro autorizzato | Profilo, elenco conteggi campo |
| new | projectId e fieldId facoltativi | Preparazione con campo verificato; nessuna riga server al solo GET | Scheda campo, Nuovo conteggio |
| list | listId richiesto | Lista autorizzata | Liste recenti/riepilogo desktop |
| counter | listId e countId richiesti | Contatore autorizzato; countId deve appartenere a listId | Riepilogo campo/desktop |
| admin | Nessuno | Conteggi utenti dopo verifica ruolo server | Menu amministrativo Configuratore |
| Senza query | Nessuno | Liste, Riprendi visibile se checkpoint presente | Accesso diretto |

fieldId senza projectId non deve essere interpretato come autorizzazione o lookup globale. Se una riga non è disponibile: nessuna esposizione di altri dati; conservarne le eventuali modifiche locali autorizzate ed esporre stato unavailable.

## 3. Identità e metadati richiesti al Work Configuratore

**Già verificato:** Auth Supabase; auth-service.js e auth-bridge.js getState()/subscribe(); user.id anche anonimo quando la sessione esiste; isAdmin UI da app_metadata.role. Backend corrente lnclwslcjufwdbmsxljf; nessuna chiave segreta in questa scheda.

**Consegna richiesta:** bootstrap leggero comune che riusi i medesimi servizi e chiave storage Auth effettiva, inizializzazione owner, gestione offline e hook prima/dopo cambio identità. Non fornire un client che avvii analytics, upsert di progetti o l'app mappa come conseguenza dell'apertura Conteggi. Il frontend non può considerare owner affidabile prima della risoluzione della sessione.

getState minimo consumato: kind loading/guest/user, user.id quando risolto, is_anonymous verificato, isAdmin solo per interfaccia, campi profilo utili alla precompilazione e identityEpoch locale. identityEpoch è aggiunta proposta per invalidare callback tardive, non un nuovo token.

Logout e login conservano lo scope precedente ma non lo mostrano al nuovo account. I Conteggi non sono trasferiti dal solo login: la funzione guest esistente va coordinata con autorizzazione specifica. Il Work Conteggi fornisce una routine interna per le proprie strutture; il Work Configuratore mantiene grant e orchestrazione condivisa. Non aggiungere token permanenti o passaggi Auth nell'URL.

**Mapping proposto per V1, da approvare con l'altro Work:**
- projectId = projects.id UUID cloud, non client_project_id.
- fieldId = project_fields.client_field_id, testo, sempre con projectId; non project_fields.id.
- lista/conteggio = UUID creati dal modulo e invariati dopo sync.
- progetto/campo soltanto locale: tenere riferimento locale separato, owner/env vincolati, associationStatus pending; risolvere mapping appena il progetto è sincronizzato. Non inviare un ID locale come projectId cloud.
- Se il riferimento locale non può essere verificato dall'adapter, contare senza campo e associare successivamente. Nessuna finalizzazione del perimetro.

FieldDirectory proposta, prodotta dal Work Configuratore:
- listProjects() → Promise<ProjectRef[]>
- listFields(projectId) → Promise<FieldRef[]>
- resolveField(projectId, fieldId) → Promise<FieldRef|null>

ProjectRef: projectId, projectLabel.
FieldRef: projectId, projectLabel, fieldId, fieldLabel, varietyLabel facoltativa, associationStatus verified/pending.
La risoluzione normale server verifica owner corrente, ambiente, progetto/campo non eliminati. pending è soltanto locale e proviene da cache autorizzata nello stesso scope. unavailable viene rappresentato dal modulo quando l'associazione perde validità; non è un campo nuovamente autorizzato.

Il server restituisce esclusivamente questa proiezione. Non usare backend.listOwnedProjects() o loadEditableProject() direttamente da Conteggi: oggi recuperano anche geometrie e dati di progettazione. Nessuna lettura/copia di clone o portinnesto. Il codice pubblico di un progetto non concede accesso all'archivio Conteggi. La normale scelta campo da admin segue i propri progetti; la consultazione utenti rimane in CountsAdmin.

Catalogo: consegnare listVarieties leggero o proiezione derivata dalla fonte esistente, senza importare righe di cloni/portinnesti. Titolo libero rimane sempre funzionante senza catalogo/rete.

## 4. CountsGateway fornito dal Work Conteggi

Client leggero proposto in src/counts-client.js, condiviso come componente unico; nessun import delle UI contatore/admin e nessun SQL dal pannello desktop. Usa medesima identità e store locale Conteggi quando necessario. La cache è una sola e i comandi seguono identiche revisioni e outbox.

Firme e forme proposte:

```ts
type SyncState = 'local' | 'pending' | 'synced' | 'error' | 'conflict';
type Category = 'plants' | 'posts' | 'other';
type AssociationStatus = 'verified' | 'pending' | 'unavailable';

type FieldAssociation = {
  projectId: string | null;
  fieldId: string | null;
  projectLabel: string;
  fieldLabel: string;
  varietyLabel?: string;
  associationStatus: AssociationStatus;
  localRef?: { localProjectId: string; localFieldId: string };
};

type CountRecord = {
  countId: string;
  listId: string;
  category: Category;
  title: string;
  varietyLabel: string | null;
  quantity: number;
  notes: string;
  field: FieldAssociation | null;
  revision: number;
  localRevision: number;
  syncState: SyncState;
  updatedAt: string;
};
type CountList = {
  listId: string;
  title: string;
  status: 'open' | 'closed';
  revision: number;
  localRevision: number;
  updatedAt: string;
  syncState: SyncState;
};
type Page<T> = { items: T[]; nextCursor: string | null };
type CountPatch = Partial<Pick<
  CountRecord, 'title' | 'varietyLabel' | 'quantity' | 'notes' | 'field'
>>;
type FieldSummary = {
  projectId: string;
  fieldId: string;
  categories: {
    category: Category;
    items: {
      countId: string; listId: string; title: string;
      quantity: number; revision: number; syncState: SyncState;
    }[];
    totalQuantity: string;
  }[];
  updatedAt: string | null;
};
type MutationResult<T> = {
  value: T;
  operationId: string;
  syncState: SyncState;
};
type CountsGateway = {
  listLists(filter?: {
    projectId?: string; fieldId?: string;
    status?: 'open' | 'closed'; cursor?: string; limit?: number;
  }): Promise<Page<CountList>>;
  listRecentLists(limit?: number): Promise<CountList[]>;
  getList(listId: string): Promise<{
    list: CountList; counts: CountRecord[];
  }>;
  getCount(listId: string, countId: string): Promise<CountRecord>;
  getFieldSummary(projectId: string, fieldId: string):
    Promise<FieldSummary>;
  updateCount(input: {
    listId: string; countId: string; expectedRevision: number;
    expectedLocalRevision: number; operationId: string; patch: CountPatch;
  }): Promise<MutationResult<CountRecord>>;
  updateList(input: {
    listId: string; expectedRevision: number;
    expectedLocalRevision: number;
    operationId: string; patch: { title?: string; status?: 'open' | 'closed' };
  }): Promise<MutationResult<CountList>>;
  refresh(): Promise<void>;
  subscribe(listener: (event: {
    scopeEpoch: number; listId?: string; countId?: string;
    projectId?: string; fieldId?: string; reason: string;
  }) => void): () => void;
};
```

revision è la revisione server dell'entità; localRevision protegge la cache da due editor sullo stesso dispositivo, anche per updateList. Non presentare una mutation pending come synced. Le quantità sono interi non negativi rappresentabili esattamente; totalQuantity è una stringa decimale intera calcolata con aritmetica esatta, per evitare overflow nelle somme. Limiti tecnici proposti nella validazione comune: titolo 1–200 caratteri Unicode, note 0–10.000, messaggio di trasmissione 0–5.000; errori espliciti senza tagli silenziosi. Un titolo non ancora inserito riceve il nome modificabile della categoria.

Il client comprende anche le operazioni di creazione/eliminazione richieste dall'app Conteggi; il configuratore usa le sole firme pubbliche sopra e apre Conteggi per operazioni più articolate. Nessun contatore +1 duplicato nel pannello desktop.

Riepiloghi: categorie separate; mantenere singole righe anche con titoli uguali e provenienza da liste differenti. totalQuantity somma soltanto la categoria indicata e non sostituisce le righe; non aggiungere un totale generale misto. note restano nel record autorizzato, non nei titoli pubblici o nell'URL.

Trasporto proposto: Edge Functions counts-api e submit-counts, routine transazionali private nel backend. Non sono endpoint già disponibili. Il client nasconde questo dettaglio alla UI; server ricava owner dal token e applica ambiente, revisione e idempotenza, non da un parametro utente.

Errori tipizzati proposti: AUTH_REQUIRED, IDENTITY_UNRESOLVED, NOT_FOUND_OR_FORBIDDEN, VALIDATION_ERROR, VERSION_CONFLICT, LOCAL_STORAGE_FAILED, SYNC_UNAVAILABLE, FIELD_UNAVAILABLE, SERVICE_DISABLED. Per conflitto restituire solo versione corrente del record già autorizzato e mantenere la proposta locale; per ID altrui non distinguere dettagli che rivelino la sua esistenza.

Aggiornamento riepiloghi: al ritorno da Conteggi, visibilitychange/pageshow e auth change chiamano refresh nel nuovo scope; subscribe/BroadcastChannel invalida la cache. Una risposta asincrona del vecchio scope non può rendere dati nel nuovo. Nessun secondo archivio in localStorage nel configuratore.

## 5. CountsAdmin e invii

view=admin è nella pagina Conteggi. Ingresso menu configuratore a cura dell'altro Work. Guardia UI isAdmin utile per menu, ma endpoint counts-admin verifica user permanente e ruolo corrente lato server. Nessuna lettura admin tramite il gateway ordinario del profilo.

Metodi proposti:
- listUserLists({ownerKind?: guest|user, from?, to?, listStatus?, hasSubmission?, cursor?, limit?}) → Page<AdminListRow>.
- getUserList(listId) → {owner:{technicalId,kind}, list, counts}. Per registrati solo dati autorizzati utili alla consultazione.
- listSubmissions({ownerKind?, from?, to?, emailState?, cursor?, limit?}) → Page<SubmissionSummary>.
- getSubmission(submissionId) → snapshot esatto, acceptedAt, stato email, providerAcceptedAt/deliveredAt quando verificabili.

counts-admin non espone update/delete/send. Un guest non riceve un nome inventato; recapiti disponibili soltanto se realmente forniti. “Appunti sincronizzati” e “Richieste trasmesse” sono insiemi distinti; nota letta non è richiesta commerciale. Richieste con email non riuscita/incerta hanno stato evidente.

Richiesta Conteggi: copia immutabile delle sole righe selezionate e recapiti/messaggio. Nessun upsert di progetto o import admin. Stato sync, accepted della richiesta e email provider_accepted/delivered restano separati. Nessuna trasmissione automatica al ritorno della rete.

Email: servizio attuale submit-quote verificato come ACTIVE, versione 4, provider Resend. Non riutilizzabile direttamente: richiede progetto e genera clone/portinnesto/lotti. Occorre adapter provider comune e validatore recapiti puro estratti una sola volta, con responsabilità condivisa coordinata dal Work Configuratore. Conteggi produce composer e invio autonomo senza un secondo provider. Secret/mittente/quote e consegna non collaudati; nessuna email reale spedita.

## 6. Salvataggio e ritorno fra strumenti

| Evento | Work Conteggi | Work Configuratore |
|---|---|---|
| Durante uso | Ogni modifica locale atomica; lista/riga, note, titolo, quantità e schermata conservati | Conservazione automatica della propria progettazione e bozze |
| Scelta voce già attiva | Chiude menu; niente reset | Stessa regola nel proprio selettore |
| Uscita da Conteggi | Flush locale, commit oncomplete, checkpoint verificato, enqueue sync, navigazione nella stessa scheda | All'ingresso ripristina la propria sessione senza confermarla |
| Uscita dal Configuratore | Nessuna lettura o modifica dell'editor da Conteggi | Checkpoint completo anche vertici/passaggi/esclusioni non confermati, poi navigazione |
| Offline | Switch dopo persistenza locale; outbox pending, nessuna attesa rete | Stessa regola sulla sua bozza |
| Errore storage | Resta nella pagina; Riprova, nessuna perdita silenziosa | Stessa regola |
| Nuovo owner | Checkpoint/coda isolati, callback vecchie scartate | Identità condivisa e checkpoint vecchio non restaurato |
| view=resume | Valida owner e schema; ripristina contesto e IDs | Ritorno alla base configurata richiama ripristino proprio |

Il selettore non conferma il conteggio, non conclude la lista, non trasmette e non conferma il perimetro. Campi non sincronizzati non vengono finalizzati per produrre un link. La bozza editor non viene inviata nei servizi Conteggi.

## 7. Asset approvati verificati

Asset correnti realmente presenti e usati dal configuratore; nessuna variante ridisegnata. Pacchetto di interscambio include i file binari originali elencati.

| Asset | Dimensioni | SHA-256 |
|---|---|---|
| assets/logo-vivai-obice-v14.png | 2047×626 RGBA | 940fcaae10b85c6b3c04f800269be37c8f31c72340b2034ba94dbe5b692d2f85 |
| assets/logo-vivai-obice-lineare.png | Identico a V14 | Stessi byte e hash; non occorre una seconda copia |
| assets/favicon-v26.png | 48×48 RGBA | fc36519c32dfa23754a0c01551af50843b7625dbd6827bbc6af9f4e0dfe59f59 |
| assets/apple-touch-icon-v26.png | 180×180 RGB | 2c9a650cfe6c8370f805e510be20d688df8e7ed213039782b72d28bdb31c78e8 |

[Logo originale fissato al commit](https://github.com/vivaiobice/configuratore/blob/ab25ab7d16bfc9ec35a3ffa7ec8a16ef90a0cbc3/assets/logo-vivai-obice-v14.png).

Non deformare, ritagliare o ricolorare il logo. CSS dedicato con proporzioni originali. Font/palette: Inter/system, #183f28, #275f3e, #142019, #eef1ed, #ffffff, #dce2dd. mobile.css/stili reali sono riferimenti, non CSS da caricare integralmente. Nessun vettoriale approvato individuato.

Testi: “Conteggi”; “Rimesse, pali e appunti di campo” dove appropriato; title “Conteggi | Vivai Obice”. Footer “Uno strumento Vivai Obice”, anno generato e “Vivai Obice. Tutti i diritti riservati.”. Riepilogo/email con marchio e corpo testuale accessibile. Nessun nuovo PDF necessario.

Link verificati HTTP 200: [sito](https://www.vivaiobice.com/), [contatti](https://www.vivaiobice.com/contatti), [privacy esistente](https://www.vivaiobice.com/privacypolicy). Destinatario info@vivaiobice.com trovato nel servizio email e nel sito. Non assumere che la privacy attuale copra Conteggi; titolare, base giuridica, conservazione e condizioni devono essere validati. Nessun dato societario dedotto o inserito.

## 8. Responsabilità e gate

| Elemento | Proprietario unico proposto |
|---|---|
| Modulo /conteggi, UI, store, CountsGateway, nuove tabelle/policy/routine, CountsAdmin, snapshot e composer email Conteggi | Work Conteggi |
| Header/profilo/campo/menu desktop/admin link, checkpoint editor, FieldDirectory, Auth comune e grant guest | Work Configuratore |
| Catalogo vitigni leggero, configurazione destinazioni, estrazione adapter email/validatore contatti | Work Configuratore referente; contratto concordato con Conteggi |
| Composizione pacchetto e deploy unico | Work Configuratore, responsabile di rilascio proposto da confermare |
| Privacy/finalità/ruoli/conservazione e autorizzazione attivazione pubblica | Titolare/consulente; entrambi rispettano il gate |

Nessuna modifica concorrente ai file comuni. Le migrazioni Conteggi non sovrascrivono la funzione guest condivisa: consegnano una routine interna, il coordinatore integra l'invocazione in una migrazione distinta di sua proprietà.

Flag produzione chiusi fino a pagina reale disponibile, autorizzazioni provate e andata/ritorno collaudato. Sync/admin gate server subordinato alla validazione privacy prima della prima raccolta appunti. Invio gate separato. Non basta aggiungere un pulsante o superare un mock.

## 9. Checklist di riscontro fra i due Work

- [ ] Accordare mapping projectId cloud / fieldId client e schema di pending locale.
- [ ] Consegnare bootstrap Auth leggero e chiave storage condivisa, senza token nei documenti.
- [ ] Fornire FieldDirectory con whitelist e ownership per guest/registrati.
- [ ] Concordare linking guest esplicito e routine transazionale Counts.
- [ ] Consegnare proiezione soli vitigni e configurazione centrale URL/ambienti.
- [ ] Definire ambiente test reale e responsabile unico del packaging.
- [ ] Congelare tipi/firme CountsGateway con revisione locale uniforme e codici errore.
- [ ] Concordare helper email unico e test provider senza egress reale.
- [ ] Validare privacy per note sincronizzate consultabili anche senza richiesta.
- [ ] Provare accessi diretti negati, campo eliminato/offline e cambio account.
- [ ] Provare Configuratore→Conteggi→Configuratore con bozze reali e refresh.
- [ ] Provare email snapshot/doppio clic/timeout e rollback compatibile con outbox.

Tutte queste prove di integrazione sono **non eseguite**. Verificati soltanto letture codice/metadati, HTTP, hash asset e sintassi del codice corrente. Nessun DB, autorizzazione, DNS, codice applicativo o produzione modificati.
