# Vivai Obice — Configuratore

Web app autonoma per la progettazione preliminare di impianti viticoli.

Stato: ambiente TEST · release V35 WebApp.

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
373 test automatici verificati, compresi refresh archivio, sezioni desktop, mappa Admin multi-campo,
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
