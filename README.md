# Vivai Obice — Configuratore

Web app autonoma per la progettazione preliminare di impianti viticoli.

Stato: ambiente TEST · release V53.3 WebApp.

## V53.3 — stato attivo del selettore mappa in Dark Mode

- Il selettore Satellite/Stradale usa un contenitore scuro uniforme: il pulsante inattivo non ha
  più la bordatura chiara che lo faceva sembrare selezionato.
- La mappa attiva è evidenziata in verde, con la stessa gerarchia visiva del Catasto attivo.
- Cache del foglio di stile aggiornata a `V53.3`; nessuna modifica alla logica cartografica,
  all'identificazione catastale, al database o al formato dei progetti.

## V53.2 — identificazione puntuale delle particelle

- Il Catasto mantiene esclusivamente perimetri e numeri delle particelle: il passaggio automatico
  al layer dei fogli è stato rimosso.
- In modalità Catasto, fermando il puntatore per tre secondi su una particella, una piccola barra
  in basso a sinistra mostra **Foglio** e **Particella**. Movimento, zoom e uscita dalla mappa
  annullano il controllo in attesa, evitando richieste continue al servizio pubblico.
- L'identificazione usa `GetFeatureInfo` tramite la Edge Function vincolata `cadastral-wms`; il
  browser riceve soltanto i riferimenti catastali normalizzati e non salva questi dati nel progetto.
- In modalità scura, Satellite e Stradale hanno ora stati attivo/inattivo nettamente distinguibili.
- Cache degli asset aggiornata a `V53.2`; nessuna modifica al database o al formato dei progetti.

## V53.1 — hotfix comandi mappa e scala catastale

- Il gruppo Satellite, Stradale e Catasto torna nell'angolo superiore sinistro della mappa; il
  cursore di visibilità compare nella seconda riga senza sovrapporsi al selettore del campo.
- Le particelle vengono richieste soltanto alla scala di 30 m o più ravvicinata; allargando
  l'inquadratura il Catasto passa al layer dei fogli, evitando il caricamento inutile dei dettagli.
- Il comando **− Punto** diventa **✓ Fine modifica** mentre i vertici eliminabili sono attivi e
  consente di uscire dalla modalità senza rimuovere un punto.
- Cache degli asset aggiornata a `V53.1`; nessuna modifica al database o al formato dei progetti.

## V53 — riferimenti catastali e controllo visibilità

- Il Catasto usa due rappresentazioni WMS ufficiali adattive: alle scale più ampie mostra il
  riferimento del foglio, avvicinandosi mostra perimetri e numeri delle particelle.
- Il cursore **Visibilità catasto**, disponibile su desktop e mobile, regola in tempo reale
  l'opacità dal 10% al 100%; parte dal 60% e resta una preferenza temporanea della sessione.
- Il pulsante **Catasto** mantiene uno stato attivo ben riconoscibile anche durante il passaggio del
  puntatore, in modalità scura e nell'interfaccia mobile.
- Il proxy accetta esclusivamente le due modalità catastali previste e continua a limitare le
  richieste alla cartografia italiana dell'Agenzia delle Entrate. Nessun dato catastale viene
  salvato nei progetti e non sono state introdotte modifiche al database.
- Versione dell'applicazione e query di cache aggiornate a `V53`.

## V52.1 — hotfix caricamento Catasto

- Le immagini WMS catastali passano attraverso la Edge Function pubblica e vincolata `cadastral-wms`, così MapLibre riceve un PNG con header CORS compatibili con WebGL.
- Il proxy accetta esclusivamente riquadri geografici italiani di dimensione limitata e inoltra le richieste soltanto al layer ufficiale `CP.CadastralParcel`.
- Fonte Agenzia delle Entrate e avvertenza informativa sono raccolte nell'angolo inferiore sinistro della mappa, sopra la scala.
- Versione e query di cache aggiornate a `V52.1` per evitare che il browser riutilizzi i moduli V52 precedenti.

## V52 — cartografia catastale informativa

- Il comando **Catasto** sovrappone nell'editor progetto il layer WMS ufficiale dell'Agenzia delle
  Entrate alle mappe Satellite e Stradale.
- La cartografia è soltanto un riferimento visivo: non seleziona particelle, non sostituisce il
  perimetro del campo e non compare in amministrazione, condivisioni o PDF.
- Sotto lo zoom utile il configuratore invita ad avvicinarsi; errori del servizio catastale non
  bloccano la mappa né gli strumenti di progettazione.
- La visibilità è temporanea e torna disattivata a ogni apertura. Fonte e avvertenza informativa
  restano visibili mentre il layer è attivo.

## V43 — documento, accesso con codice e materiali

- La geometria della foto satellitare è proiettata sulla stessa inquadratura acquisita per la stampa;
  gli stili dello schema tecnico sono isolati dall’overlay trasparente.
- Anteprima a schermo separata dall’impaginazione A4. Il nome proposto in stampa è
  `Progetto_VO1234567_NomeCognome.pdf` (salvataggio PDF soggetto al browser).
- La ricerca per ID apre anche i progetti salvati prima che esistessero revisioni del documento,
  in sola lettura per Guest. La migrazione è applicata solo all’ambiente TEST.
- I filari a S troppo stretti evitano gli incroci con un adattamento progressivo fino al tracciato
  precedente; vitigni, cloni e portainnesti sono alfabetici, con `Altro` in fondo.
- Selezione altezza barbatella 40/60 cm (40 predefinito), campi destinatario riordinati e tema
  Chiaro/Scuro/Automatico. Vedere `V43-VERIFICA.md` per il collaudo.

## V42 — navigazione trackpad, filari equidistanti e ID progetto

- Il trackpad desktop sposta la mappa con lo scorrimento a due dita senza richiedere la pressione;
  pinch zoom e rotazione con modificatore restano separati.
- I filari curvi dispongono dell’opzione, attiva per impostazione predefinita, `Mantieni equidistanza
  filari`. Le curve parallele sono calcolate lungo la normale e i tratti che produrrebbero cuspidi o
  inversioni locali vengono esclusi in sicurezza. Disattivando l’opzione resta disponibile il
  comportamento storico.
- Nel documento la geometria sopra la foto satellitare è trasparente; lo schema tecnico conserva il
  proprio riempimento. Ogni pagina A4 usa la filigrana Vivai Obice al 5% dietro ai contenuti.
- Il documento non stampa più l’URL completo: mostra il QR della revisione e l’ID progetto umano nel
  formato `VO-1234567`.
- `Carica progetto` è disponibile nell’intestazione desktop e nel Profilo mobile. Il codice apre
  l’ultima revisione pubblicabile in sola lettura; proprietario e Admin conservano il passaggio
  protetto all’editor.
- La ricerca pubblica è limitata a 12 tentativi in 10 minuti per richiedente, espone solo uno snapshot
  tecnico sanificato e non concede accesso diretto alle tabelle.
- Migrazione applicata esclusivamente all’ambiente Supabase TEST. Nessun intervento su LIVE.
- Release identificata come `AMBIENTE TEST · V42`; gate automatico `495/495` e controllo sintattico
  completati.

## V41 — filari curvi, orientamento preciso e documento cliente

- L’orientamento dei filari accetta ora un valore manuale con un decimale, oltre al cursore e alle
  direzioni rapide già presenti. Il valore viene salvato per campo e riportato con la stessa precisione
  nel documento.
- Aggiunti punti di curvatura multipli per modellare filari ad arco o a S. Ogni punto può essere
  spostato sulla mappa o regolato dai controlli; i punti appartengono al singolo campo e sono rimovibili
  o azzerabili.
- Lunghezze dei filari, barbatelle e pali sono ricalcolati sulle polilinee curve effettive. Se non sono
  presenti punti di curvatura, il motore storico dei filari rettilinei resta invariato.
- Anteprime mobile, mappa principale, pagina condivisa, schema tecnico e documento stampabile
  rappresentano l’intera curva e non soltanto i due estremi.
- Disponibile il documento professionale intestato Vivai Obice: selezione di uno o più campi,
  destinatario modificabile e precompilato, mappa satellitare, schema, dati tecnici, QR alla revisione
  condivisa, disclaimer obbligatorio e stampa/salvataggio PDF dal browser.
- I collegamenti condivisi sono in sola lettura per i Guest; la modifica è proposta soltanto a
  proprietario autenticato o Admin dopo verifica server-side. Le revisioni emesse restano datate.
- Gli esempi della richiesta materiale sono volutamente generici e non derivano da corrispondenza o
  dati cliente.
- Release identificata come `AMBIENTE TEST · V41`, con cache bust degli asset e dei moduli modificati.
- Gate automatico: `480/480` test superati; controllo sintattico completato.

## V40 — correzioni visuali desktop e mobile

- Ripristinati sulla mappa mobile i comandi GPS e Vai al campo: GPS torna centrato verticalmente,
  mentre Vai al campo mostra soltanto il simbolo di ricentraggio nel pulsante circolare.
- Il perimetro attivo desktop usa ora lo stesso tratto chiaro, sottile e subordinato ai filari già
  approvato sul mobile, migliorando la lettura sopra l'immagine satellitare.
- Rimossi i badge numerici decorativi `01` e `02` dalle intestazioni della barra laterale desktop.
- Il riepilogo mette in evidenza la quantità commerciale arrotondata al multiplo di 25 e mostra in
  piccolo le barbatelle calcolate. La stessa gerarchia è applicata alle schede mobile.
- Formule, arrotondamento commerciale, geometrie, salvataggio e sincronizzazione non sono cambiati.
- Release identificata come `AMBIENTE TEST · V40`; cache bust aggiornato per gli asset modificati.
- Gate automatico: `411/411` test superati e controllo sintattico dei moduli completato.

## V39 — rifinitura visuale desktop

- La toolbar laterale mostra ora soltanto riquadri compatti con l'icona. Il nome del singolo comando
  compare integralmente con uno slide su hover o focus e scompare nuovamente all'uscita.
- La ricerca località è stata separata dai gruppi di strumenti e posizionata autonomamente in alto a
  destra della mappa.
- Il selettore centrale della mappa non mostra più il titolo `Campo selezionato`: restano il nome del
  campo attivo e la possibilità di passare agli altri campi.
- `Affina il progetto` è il titolo generale di tre card dedicate: Caratteristiche dell'impianto,
  Materiale vegetale e Informazioni. Anno, inquadramento e note sono riuniti nella card Informazioni.
- Vitigno, Clone/selezione e Portainnesto usano altezza, testo e spaziature coerenti. Il testo della
  vendemmia meccanica è stato uniformato alla tipografia del pannello.
- Le etichette dinamiche degli editor preservano la struttura icona/slide anche durante modifica punti,
  chiusura perimetro, esclusione e passaggio.
- Gate locale: suite `405/405` superata. Nessuna modifica a formule, geometrie, persistenza, database
  o Supabase LIVE; il layout mobile resta protetto dal breakpoint esistente.

## V38 — barra strumenti desktop e campi disponibili

- I comandi desktop Editor mappa, Posizionamento e Gestione aree escluse sono riuniti in una barra
  laterale destra compatta. Le funzioni restano separate per gruppo e il testo compare espandendo
  l'icona al passaggio o al focus; il gruppo Tipo di mappa non è stato modificato.
- Rotazioni disposte in basso e controllo verticale MapLibre zoom/bussola affiancato a destra, senza
  sovrapposizioni. Aggiunta nella barra la lente che porta alla ricerca della località.
- `Campo attivo` è diventato **Campi disponibili**. Lo stesso selettore è presente in alto al centro
  della mappa; entrambi caricano e inquadrano il campo scelto e restano sincronizzati con la rinomina.
- L'annata dell'impianto è presentata nelle opzioni avanzate desktop mantenendo intatto il controllo
  mobile. `Affina il progetto` segue l'ordine richiesto e l'avviso della vendemmia meccanica è sotto
  la checkbox dedicata.
- Il Calcolo rapido dispone ora di superficie, distanza piante e distanza filari proprie: non legge e
  non modifica il sesto del progetto aperto.
- Gate locale: suite `397/397` e controllo sintattico superati. Formule, geometrie, conteggi,
  database e Supabase LIVE non sono stati modificati.

## V37 — gestione progetti e strumenti mappa desktop

- La sezione Progetti consente ora di aprire, rinominare ed eliminare ogni progetto, sia da desktop
  sia da mobile. I progetti sincronizzati vengono rinominati o eliminati prima sul cloud e solo dopo
  nell’archivio locale, evitando sparizioni apparenti o ricomparse al successivo aggiornamento.
- Aggiunto **Nome progetto** nella schermata principale desktop, prima della gestione dei campi; il
  valore viene usato dal salvataggio già esistente senza creare un nuovo flusso.
- Sulla mappa desktop i comandi sono separati in gruppi: visualizzazione in alto, editor a sinistra,
  esclusioni e posizionamento a destra, rotazione in basso a destra accanto ai controlli MapLibre.
- Nella V37 `Catasto` includeva anche il sottomenu sperimentale **Trova particella**, rimosso nella
  V52 a favore della sola sovrapposizione informativa.
- Il nuovo pulsante compatto **Aggiungi campo**, centrato in basso, avvia il disegno e diventa
  **Chiudi perimetro** quando sono disponibili almeno tre vertici. Durante altri editor resta bloccato.
- Gate locale: suite `388/388` e controlli sintattici superati. Formule, geometrie e schema database
  non sono stati modificati; Supabase LIVE resta invariato.

## V36 — flusso desktop e annata d’impianto

- Desktop: il gruppo **Nome campo** apre ora la barra laterale, con i comandi rinominati
  **Aggiungi campo** e **Elimina campo**; seguono GPS/Trova terreno, sesto d’impianto e
  orientamento filari.
- Il calcolatore rapido è stato rimosso dalla barra laterale desktop e si apre a richiesta dalla
  barra superiore, senza modificare il calcolatore mobile.
- Aggiunta l’**annata d’impianto** a livello di progetto, modificabile sia da desktop sia dalla
  schermata parametri mobile. Sono accettati gli anni dal 2000 al 2100 e il valore usa il campo
  persistente `campaignYear` già previsto dal backend.
- Il comando desktop **Salva progetto** mostra gli stati `Salvataggio…`, `✓ Progetto salvato` ed
  eventuale errore; una modifica successiva ripristina lo stato da salvare.
- Gate locale: suite `378/378` e controlli sintattici superati. Nessuna modifica a geometria,
  calcoli viticoli, database, Supabase LIVE o `styles.css` storico.

## V35 — aggiornamento manuale, archivio desktop e Admin

- Mobile: pulsante di aggiornamento nelle sezioni Campi e Progetti; forza prima il salvataggio delle
  modifiche in coda e poi scarica l’archivio dell’account. Le bozze soltanto locali restano conservate.
- Mobile: l’accesso all’Amministrazione resta volutamente nascosto; è disponibile soltanto dal desktop.
- Desktop: comandi Campi e Progetti nella barra superiore aprono un archivio separato senza smontare
  né modificare l’editor principale. Da Progetti si può aggiornare, salvare, creare o riaprire un progetto.
- Admin: mappa satellitare, scroll pagina ripristinato e visualizzazione di tutti i perimetri presenti
  nei `field_plans`, con fallback ai vecchi progetti dotati della sola geometria principale.
- Admin: KPI selezionabili, elenco reale degli utenti registrati, filtro dei progetti per utente e
  collegamento per tornare al configuratore.
- Gate locale: suite `373/373`; controlli sintattici superati. Nessuna modifica a editor, calcoli,
  geometria o `styles.css` V18. Nessuna modifica al database e nessun intervento su LIVE.

## V34 — sincronizzazione archivio personale

- Dopo login, l'app scarica i progetti attivi appartenenti all'account e li unisce all'archivio del
  dispositivo usando l'identificativo stabile `client_project_id`.
- Le bozze presenti soltanto sul dispositivo non vengono eliminate. Se il dispositivo è vuoto,
  viene aperto il progetto cloud aggiornato più recentemente; una bozza locale già disegnata non
  viene mai sostituita automaticamente.
- Aprendo un progetto dalla sezione Progetti vengono ripristinati `projectId`, versione e numero di
  revisione cloud: il salvataggio aggiorna lo stesso record invece di crearne uno duplicato.
- La vista personale dell'Admin applica comunque il filtro esplicito sul proprio `owner_user_id` e
  non importa i progetti degli altri utenti.
- Verifica dati TEST: 3 progetti Admin attivi e 11 campi disponibili; nessun dato è stato perso.
- Gate locale: suite `366/366` e controllo sintattico superati. Nessuna modifica a editor, calcoli,
  geometria o foglio desktop V18. LIVE non modificato.

## V33 — hotfix recupero registrazione interrotta

- La registrazione riconosce ora un account Guest rimasto parzialmente configurato da V31/V32 e lo
  completa sul suo UID originale, senza eliminare progetti o campi già salvati.
- Il recupero è consentito soltanto se coincidono username, e-mail e password già registrata; la
  verifica dell'hash resta server-side e non è accessibile al client.
- Se il tentativo arriva da un nuovo Guest/dispositivo, i relativi progetti cloud vengono trasferiti
  all'account recuperato mediante il grant monouso già previsto.
- Hotfix applicato soltanto al backend TEST; nessuna modifica all'interfaccia, all'editor, ai calcoli
  o al foglio desktop V18.

## V33 — conversione Guest completa

- Corretta la registrazione che lasciava e-mail in attesa e account ancora anonimo.
- La conversione avviene ora nella Edge Function protetta `promote-guest-account`: verifica il JWT
  Guest, conserva lo stesso UID, riserva lo username, imposta e conferma e-mail/password e restituisce
  una sessione permanente.
- Gli errori delle Edge Function vengono letti dal relativo payload: l'interfaccia mostra ora il
  motivo utile invece del generico `Edge Function returned a non-2xx status code`.
- Collaudo reale TEST superato: Guest → account → login con username, stesso UID in tutti i passaggi.
- Nessuna modifica a editor, calcoli, geometria o foglio desktop V18.

## V32 — hotfix login e registrazione

- Corretto l'errore browser `projectSync?.suspend is not a function` che interrompeva registrazione
  e login prima del cambio identità.
- Causa: GitHub Pages poteva riutilizzare dalla cache il modulo V30 `project-sync.js`, mentre
  `app.js` V31 richiedeva il nuovo metodo `suspend()`.
- Applicato cache bust esplicito a `project-sync.js?v=32`, oltre a shell, entrypoint e badge V32.
- Nessuna modifica a database, editor, calcoli, geometria o foglio desktop V18.

## V31 — Profilo, login e trasferimento Guest

- Mobile: nuova sezione `Profilo` nella barra inferiore. Desktop: `Login` in alto a destra; dopo
  l'accesso mostra il nome profilo con menu Profilo, Esci e Amministrazione per i soli Admin.
- Registrazione con e-mail, password, username e nome profilo. Lo username può essere composto solo
  da numeri e mantiene gli zeri iniziali; non viene trattato come numero telefonico.
- La registrazione promuove l'identità Guest esistente. L'accesso a un account già creato trasferisce
  una sola volta i progetti locali/cloud mediante token temporaneo hashato e ripetibile in sicurezza.
- Risoluzione username→e-mail e rate limit restano sul server; gli errori di login sono volutamente
  generici per non rivelare l'esistenza di un account.
- Migrazioni ed Edge Function applicate soltanto al progetto Supabase TEST. LIVE non modificato.
- `styles.css` resta byte-identico alla versione desktop V18; le aggiunte desktop sono isolate in
  `profile.css`.

## V30 — archivio cloud e storico in TEST

- Pubblicata in Ambiente TEST la Fase A dell'archivio cloud: progetti e campi Guest vengono salvati
  nel database con proprietà isolata, identificativi stabili e controllo di versione.
- Il comando `Salva` crea una revisione storica; autosalvataggi, retry idempotenti e coda IndexedDB
  proteggono anche il caso di connessione persa dopo un commit già eseguito.
- Admin può filtrare, recuperare progetti eliminati e ripristinare revisioni attraverso RPC protette.
- Predisposta la migrazione una tantum da FieldArea GeoJSON, senza importatore pubblico.
- Cache bust e badge aggiornati a V30. `styles.css` resta alla V18: il desktop e i calcoli non sono
  stati modificati da questa release.

## V29 — allineamenti visivi

- Icona del comando `Torna al campo` sostituita con un SVG 24×24 centrato geometricamente nel
  pulsante circolare della mappa LIVE.
- Checkbox vendemmia meccanizzata stabilizzata: vuota e selezionata occupano la stessa posizione.
  Rimosso il secondo segno di spunta che, nello stato attivo, spostava il quadrato verso sinistra.
- Nessuna modifica a funzioni, dati, calcoli, geometria o desktop.

## V28 — mappe LIVE, checkbox e nome automatico

- Nella mappa LIVE di `Imposta l’impianto` compare un solo comando: ricentra sul campo. È presente
  sia nella prima configurazione sia quando si riapre l'impianto per modificarlo.
- Checkbox vendemmia meccanizzata resa quadrata e più visibile: 34×34 px dentro un target touch
  accessibile di 44×44 px.
- Il nome predefinito del campo si aggiorna in `Varietà · Portainnesto` quando vengono selezionati.
  Se è disponibile una sola selezione, viene mostrata quella; se l'utente scrive un nome personale,
  gli aggiornamenti automatici vengono definitivamente sospesi per quel campo.
- I campi salvati in precedenza con nomi personalizzati vengono riconosciuti e protetti; i nomi
  `Campo 1`, `Campo 2`, ecc. restano invece automatici.
- Desktop invariato.

## V27 — navigazione dell'editor ed esclusioni

- Pan della mappa abilitato su mobile durante disegno del perimetro, modifica dei vertici e modifica
  delle aree escluse. Un trascinamento sullo sfondo sposta la mappa; un trascinamento sulla maniglia
  continua a spostare il punto selezionato.
- Corretto il percorso `campo → area esclusa → Modifica`: la WebApp mobile non richiama più il vecchio
  fullscreen, quindi `Annulla` e `Fine modifica` restano raggiungibili.
- Checkbox della vendemmia meccanica ridotta visivamente a 28 px, mantenendo un target touch di 44 px.
- Desktop invariato: durante il disegno conserva il blocco dello sfondo già esistente.

## V26 — affidabilità dei controlli e rifinitura iPhone

- Selettori mobile dedicati per inquadramento, vitigno, clone e portainnesto, collegati agli stessi
  controlli e allo stesso stato dell'applicazione; il checkbox della vendemmia meccanica usa un
  comando touch esplicito. Tornando al desktop vengono ripristinati i controlli originali.
- Campo Nome spostato sopra l'anteprima; la mappa satellitare è LIVE già alla prima configurazione,
  con pan, pinch-zoom e rotazione e senza pulsanti cartografici nel riquadro.
- Gestione `visualViewport` per mantenere il campo attivo sopra la tastiera iOS.
- Risultato del calcolatore rapido reso immediato: barbatelle in evidenza e ordine ×25 separato.
- Satellite, Stradale e Catasto presentati come tre scelte uniformi.
- Bussola MapLibre reale spostata nella colonna strumenti e resa circolare: conserva l'orientamento
  live e il ripristino del Nord. Perimetri mobili più chiari e visivamente subordinati ai filari.
- Dock più trasparente con selezione interna coerente con la curvatura esterna.
- Icona V26 cache-busted; Apple Touch Icon preparata dalla stessa immagine approvata senza alone bianco.
- Il foglio desktop `styles.css`, la geometria e le regole di calcolo non sono stati modificati.

## V25 — interazioni mobile e scheda Campo LIVE

- Menu a tendina lasciati al percorso eventi nativo di Safari/iOS, senza intercettazione touch.
- Eliminazione rapida nell’elenco Campi nascosta finché la scheda non viene trascinata verso sinistra.
- L’anteprima nella scheda Campo usa la mappa satellitare LIVE con pan, zoom e rotazione gestuale.
- Il riquadro LIVE non mostra pulsanti, toolbar o comandi di modifica; per modificare si usa l’editor o la Home Mappa.
- Versione desktop e regole di calcolo invariate.

## V20 — fix interazione mobile

- Comandi mobile attivabili anche tramite `pointerup` touch quando Safari non produce il click sintetico.
- Livelli e pulsanti flottanti portati esplicitamente sopra la superficie della mappa.
- Rotazione mappa a due dita abilitata solo nella versione mobile; desktop invariato.
- Tocco su un campo disegnato apre la sua scheda e seleziona il campo corretto.
- Confermati i flussi Aggiungi campo, Campi → scheda e ritorno alla mappa.

## V19 — WebApp mobile a schermate

- Il link mobile apre direttamente la mappa con logo, filigrana e campi già disegnati.
- Flusso: Aggiungi campo → editor → parametri impianto → salva → ritorno alla mappa.
- Menu principale: Mappa / Campi / Progetti.
- Campi: riepilogo aggregato, schede singole, anteprima dell'impianto, barbatelle e pali distinti.
- Progetti: salvataggio e riapertura locale dell'impianto completo.
- Calcolatore rapido e livelli accessibili dalla mappa.
- Desktop conservato; la shell mobile riusa gli stessi controlli e gli stessi dati.
- `PROMPT_JOURNAL.md` contiene cronologia, requisiti, KPI, bug corretti e regole di continuità.

## V18 — mobile ispirato al flusso OneSoil

- Navigazione inferiore Progetto / Campi / Mappa.
- Campi, livelli e strumenti in pannelli dal basso; controlli esistenti riutilizzati senza duplicare i dati.
- Anteprima alta 640 px, dedicata alla consultazione. Disegno solo nella mappa a tutto schermo.
- Perimetro, passaggi e aree escluse con conferma visibile; durante il disegno si può annullare o togliere l'ultimo punto.
- Su mobile il passaggio attende Conferma passaggio dopo il secondo punto. Su desktop conserva il comportamento precedente.
- Riepilogo compatto: Salva / PDF / Preventivo a destra delle barbatelle, dettagli e pali espandibili.
- Layout mobile mantenuto anche su iPhone in orizzontale; pagina progetto scorrevole.
- Desktop: stili e disposizione originali conservati. Le regole aggiuntive riguardano schermi piccoli o touch fino a 1100 px.
- Confermati i tagli netti di passaggi/esclusioni e due pali di testa per ogni segmento risultante.

### Installazione e verifica

Caricare tutti i file di questo archivio nella cartella del sito, sostituendo la versione precedente.
Aprire tramite HTTP/HTTPS, non direttamente come file locale. Non serve una compilazione per pubblicare.
Per i test di sviluppo: `npm ci`, `npm test`, `npm run check`.
480 test automatici verificati, compresi filari curvi multipunto, orientamento decimale, documento e condivisione V41,
controlli visuali V40, refresh archivio, sezioni desktop, mappa Admin multi-campo,
profili selezionabili, promozione Guest server-side, messaggi Edge leggibili e il controllo che impedisce di pubblicare nuovamente il
modulo di sincronizzazione senza cache bust, autenticazione profilo, trasferimento Guest idempotente,
archivio cloud, coda offline, revisione differita,
allineamento stabile della checkbox, centratura SVG,
nome automatico protetto, ricentraggio nelle mappe LIVE,
navigazione dell'editor, modifica esclusioni,
selettori/checkbox mobile, tastiera visual viewport,
calcolatore rapido, bussola MapLibre, swipe eliminazione, scheda Campo LIVE,
flusso mobile a schermate, archivio progetti,
navigazione sul DOM, ripristino desktop e calcolo dei tagli.
Il browser remoto di verifica non raggiunge la copia locale: resa visiva, gesti e rotazione vanno ancora verificati su Safari iPhone reale.

## Fase A — archivio cloud e storico (solo Ambiente TEST)

La release V31 include la persistenza cloud normalizzata introdotta in V30 con identificativi client stabili, campi,
revisioni immutabili, coda IndexedDB e controllo di versione ottimistico. Il primo salvataggio cloud
avviene soltanto dopo un perimetro valido; le modifiche aggiornano lo stato corrente e il comando
esplicito Salva crea una revisione. I dati V29 locali vengono migrati in memoria senza sovrascrivere
archivi corrotti e restano disponibili durante problemi di rete.

La migrazione SQL è `supabase/migrations/202609210001_cloud_archive_history.sql`. Non contiene chiavi
segrete. Prima dell'uso deve essere applicata e verificata esclusivamente sul progetto Supabase TEST.
L'Admin dispone di filtri per campagna, origine, tipo proprietario ed eliminati; recupero e ripristino
revisioni passano solo da RPC protette. Il normalizzatore FieldArea accetta GeoJSON geografico valido,
ma non esiste ancora un pulsante di importazione pubblico e nessuna migrazione reale è stata eseguita.

Stato e limiti operativi sono registrati in `FASE-A-VERIFICA.md` e `V30-VERIFICA.md`. La pubblicazione
rimane confinata all'Ambiente TEST; LIVE non è stato modificato.

Prova consigliata su iPhone: apri Mappa, disegna un campo, conferma, modifica punti, aggiungi un passaggio,
modifica/elimina un'esclusione, torna al Progetto e ruota il telefono. Controlla anche il riepilogo espanso.

## Documento di progetto in sviluppo — Ambiente TEST

Il comando `Stampa / PDF` apre una schermata separata. Si possono includere tutti i campi validi o
solo quelli selezionati; il destinatario viene precompilato dal contatto del progetto e dal profilo,
ma ogni modifica in questa schermata riguarda soltanto il documento. Dopo la presa visione obbligatoria
dell'avvertenza viene creata una revisione immutabile, acquisita una base satellitare separata dalla
mappa di lavoro per ciascun campo, emesso un documento A4 con frontespizio, schede, schema tecnico,
quantità commerciali, QR e piè di pagina Vivai Obice, e abilitati stampa/PDF e copia link.

Il QR contiene un token casuale ad alta entropia; il database conserva soltanto il suo hash. La pagina
`shared-project.html` è pubblicamente consultabile tramite token ma non espone il destinatario, i
contatti o i dati del profilo. Soltanto un account permanente proprietario o Admin, verificato con
RPC lato server, può vedere il collegamento all'editor. La versione stampata resta distinta dalle
modifiche successive; il token può essere revocato dal proprietario/Admin tramite RPC. Lo storico
registra autore, data e riepilogo delle modifiche. Il disclaimer è identificato dalla versione
`VO-DISC-2026-01`; testo e limiti devono ricevere revisione tecnica/legale prima di LIVE.

Migrazioni `supabase/migrations/202609240001_project_reports_and_audit.sql`,
`202609240002_remove_report_direct_select.sql` e `202609240003_fix_public_report_lookup.sql`
applicate soltanto al progetto Supabase TEST il 24/09/2026. Aggiungono metadati di audit, emissioni e revoche, RPC di
condivisione e controllo di accesso, senza concedere accesso diretto alla tabella dei documenti.
La verifica SQL eseguita come ruolo `anon` conferma che un token inesistente non apre il link e
non c'è lettura diretta della tabella; un chiamante non autenticato non può modificare il progetto.
Gli advisor mostrano avvisi già presenti su altre tabelle e sulla protezione delle password, oltre
alla nota informativa attesa per la tabella dei documenti senza policy di lettura diretta.
Restano da fare i test reali con Guest/proprietario/Admin. La funzionalità
non va pubblicata né considerata pronta all'uso prima di tali verifiche.

Verifiche manuali TEST ancora necessarie: selezione di uno e tre campi, salvataggio A4 da Chrome,
stampa da Safari iPhone, leggibilità dei QR, attribuzione Esri, sovrapposizione satellitare/filari,
validazione della checkbox, link Guest sola lettura, accesso proprietario/Admin, token revocato,
gestione di mappe senza tile/CORS e resa delle pagine senza ritagli. I test automatici non sostituiscono
questa verifica visiva e di sicurezza remota.

Mobile: anteprima con Satellite, Stradale, Catasto, GPS, centra campo e zoom.
Apri mappa a tutto schermo → Disegna terreno → tocca i vertici → Chiudi perimetro.
Disegno e modifica avvengono solo nell'editor a tutto schermo.
Torna al progetto chiude gli strumenti; un perimetro non ancora confermato viene annullato.
Gestione esplicita dei tocchi, senza duplicare i punti generati da clic sintetici.
Verifica su iPhone reale ancora richiesta: i test automatici non equivalgono a Safari iOS.

- Modifica punti: maniglie trascinabili, aggiunta con +, Fine modifica.
- Cambio campo: chiusura della modalità modifica e rimozione delle maniglie.
- Zone escluse: elenco visibile, Modifica ed Elimina.
- Capezzagne solo esterne: passaggi e zone interne producono tagli netti.
- Riepilogo del campo attivo: pali totali e di cui pali di testa.
# Release TEST V44 (24 settembre 2026)

Per modifiche, pacchetto e controlli dopo il caricamento, leggere `V44-VERIFICA.md`. La stampa con nome stabile si ottiene tramite **Scarica PDF**. La cartografia del PDF viene catturata come un'unica immagine MapLibre georeferenziata con filari e perimetro; la prova finale richiede confronto visivo sui dispositivi.

# Release TEST V45 (24 settembre 2026)

Per le modifiche e le verifiche successive al caricamento, leggere `V45-VERIFICA.md`. Il progetto condiviso resta consultabile dai Guest: il pulsante di stampa apre login o registrazione nella stessa pagina. Indirizzo del destinatario e località dell'impianto sono gestiti separatamente.
# V54 TEST — Riferimenti catastali e mappe Admin

Ogni campo può conservare più riferimenti catastali manuali (Comune, Foglio e Particella) insieme ai riferimenti legacy. L'Admin mostra il nome del campo nella seconda colonna e i riferimenti nella scheda; MainMap e mappe di dettaglio mostrano filari, esclusioni, rotazione e Catasto indipendente con visibilità al 60%. La consultazione dei mappali tramite puntatore richiede tre secondi di sosta e zoom 16+. Verifiche operative in `V54-VERIFICA.md`.
# V55 TEST — Profilo suolo del campo

La mappa può mostrare su richiesta i temi pedologici della Regione Piemonte. La scheda Suolo interroga fino a nove punti del campo e salva la classe effettivamente letta, con fonte, data, scala e indicazione della qualità orientativa. Quando cambia il perimetro, il profilo viene marcato da aggiornare. La versione resta TEST finché il WMS non è verificato dal browser sul dominio pubblicato; prova operativa in `V55-VERIFICA.md`.
