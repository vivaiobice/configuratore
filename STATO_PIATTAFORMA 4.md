# Piattaforma Vivai Obice — stato unico

**Versione codice: 1.2.5 — 3 ottobre 2026.** Ambiente configurato: LIVE; pubblicazione non eseguita. Progetta impianto alla radice, Conteggi in `/conteggi/`; nessuna nuova migrazione SQL o scrittura sui progetti cloud.

## Porzioni indipendenti 1.2.5

- Componenti coltivabili reali, fori ed esclusioni unite. Identità per sovrapposizione quando si muove una strada; unioni con disegni incompatibili segnalate nel configuratore.
- Direzione, punti curva ed equidistanza locali alla porzione selezionata. Il disegno precedente resta ereditato fino alla modifica e resta disponibile come base nel campo.
- Capezzagne sul perimetro originario; due pali di testa per ogni frammento fisico. La normalizzazione topologica non ritaglia ulteriormente i filari.
- Editor, riepiloghi, Admin e documenti calcolano dagli stessi layout. Snapshot e revisioni conservano le porzioni in un solo campo. Documento e scheda mobile mostrano i parametri effettivi delle porzioni.
- Moduli modificati e relativi importatori aggiornati a `?v=1.2.5`; cache Conteggi aggiornata, 37 risorse offline e corrispondenza esatta per JavaScript con query.

## Verifiche 1.2.5

`npm test`: **987 passati, 0 falliti, 0 saltati**. `npm run check` e `git diff --check` superati. Chromium desktop/mobile: selezione, direzione, curva, salvataggio, ricarica, cambio campo e disegno di un passaggio da 1,50 m. PDF nativo e stampa HTML: quattro fixture anonime, 5 pagine con 2 porzioni; con 60 porzioni e un’etichetta larga da 1.728 caratteri, 9 pagine native e 12 da stampa HTML; testo e PNG renderizzati e controllati. Verificato aggiornamento dalla cache 1.2.4 alle identità dei moduli 1.2.5.

Dispositivi iOS/Safari reali e servizi LIVE non collaudati. L’esportatore nativo già presente è verificato senza introdurre un nuovo comando di download. La consegna resta un pacchetto statico completo; revisione finale e confezionamento avvengono dopo il controllo dell’intero ramo.

## Cronologia 1.2.4

## Correzioni 1.2.4

- **Filari indipendenti:** la direzione del corridoio è recuperata dai lati alla distanza salvata e verificata rispetto all’attraversamento del campo. La lunghezza del bordo ritagliato non viene più scambiata per la direzione del passaggio. Coperti anche i colli da 1,46–1,50 m con corridoi quasi quadrati e rotazioni del perimetro.
- **Pali di testa:** clipping sulle intersezioni effettive delle polilinee con ogni bordo delle esclusioni, comprese aree sottili tra due campioni. Ogni pezzo fisico sopravvissuto ha due pali di testa. Le capezzagne restano sui bordi originali del campo.
- **Pagina PDF:** icona Aggiorna progetto accanto al titolo; destinatario e selezione validi si conservano. Se cambia la geometria selezionata, l’avvertenza va accettata di nuovo. Ogni generazione usa un checkpoint e una revisione aggiornati. Errori e risposte tardive sono riprovabili dalla stessa pagina; verificati progetto, proprietario, operazione e revisione. Un progetto archiviato non prende il posto della bozza aperta nel configuratore. L’aggiornamento online conserva una bozza locale differente per la successiva riconciliazione.
- **Immagini del documento:** quote a 13 px nell’immagine sorgente, all’esterno e senza box sovrapposti; nomi dei campi esterni con richiamo al proprio perimetro. Margini di cattura ampliati. Anteprima e PDF usano la stessa immagine annotata. Inserita la vista generale anche nell’esportatore PDF nativo già presente. Mappa principale, mappa di progettazione e schema tecnico conservano le loro etichette.
- **Aspetto:** bordo leggero e hover per Stampa/PDF e Richiedi preventivo su riepilogo e archivi desktop/mobile, in entrambi i temi. Bordo chiaro del logo originale in dark mode aumentato da 0,45 a 0,75 px.

## Verifiche eseguite sulla 1.2.4

- `npm test`: **948 passati, 0 falliti, 0 saltati**, in processi isolati. Controllo sintattico e `git diff --check` superati; cache aggiornate, manifest offline con 35 risorse.
- Curvatura: regressioni prima del fix, clipping sottile e obliquo, indipendenza e conteggi. Caso reale obliquo: 170 pezzi / 340 pali di testa; caso sottile: 14 pezzi / 28 pali. I colli quasi quadrati sono stati riprodotti e verificati anche dal revisore indipendente.
- `scripts/row-interruption-browser.mjs`: app e MapLibre reali, passaggio salvato ritagliato, controllo inferiore 3→12 m, sette righe superiori e feature cartografiche byte-identiche; 24 pezzi / 48 teste → 28 pezzi / 56 teste. Ricarica conserva i controlli; zero errori. La stessa prova con il motore precedente fallisce.
- `scripts/report-refresh-browser.mjs`: popup reale desktop/mobile, errore di sincronizzazione, aggiornamento dalla pagina, recupero del progetto scelto, conservazione destinatario/selezione e nuovo checkpoint prima della generazione. Bozza main conservata e cambio proprietario blocca azioni e scritture. SDK e acquisizione satellitare simulati; le funzioni applicative di sincronizzazione e generazione sono reali.
- Annotazioni: MapLibre 4.7.1 reale, WebGL e canvas a densità 2×; 19 lati ravvicinati, sei campi adiacenti e nove campi con uno circondato dagli altri. Anteprime e PDF nativi renderizzati e ispezionati. Raster e catasto sono fixture locali.
- Pulsanti/logo: 20 controlli di stile effettivo sui dieci punti di accesso, temi chiaro/scuro e desktop/mobile; hover cambia fondo e bordo senza spostare i tasti.
- `scripts/report-fonts-browser.mjs`: 206 nodi, desktop/mobile × schermo/stampa, zero differenze dalla tipografia del documento precedente. Verifica di ripristino dell’app completa e delle interazioni desktop/mobile completata.
- Due revisioni indipendenti, su curve/pali e PDF/sincronizzazione/layout, senza blocchi residui dopo le correzioni.

**Limiti del collaudo:** Chromium emula il formato mobile; dispositivi iOS/Safari reali e backend/servizi cartografici LIVE non collaudati in questa consegna. Con un numero estremo di etichette che non entra nello spazio disponibile, la cattura segnala un errore esplicito senza omettere quote. Le linee di richiamo possono incrociarsi o attraversare campi vicini, ma i box restano esterni e separati. Il limite dei passaggi incrociati a X resta descritto sotto.

## Baseline e compatibilità

- Configuratore stabile: `Configuratore-Vivai-Obice-1.0.5.zip`, commit locale `2edb335`; integrazione recuperata `c73fb83`. Conteggi era stato confrontato anche con il pacchetto originale.
- Remoto inventariato: `vivaiobice/configuratore`, main `29eb69e6ba328de725c8604b2813d7c4940db08c`, messaggio 1.0.6. I 447 file condivisi con il checkout unificato erano identici byte per byte. Le copie storiche ulteriori non sono state cancellate.
- Baseline di questa release: 1.2.3, implementazione `f739e1f` e inventario `e4fa502`, 915 test passati. Archivi e commit precedenti conservati. Nessuna modifica a remoto, database, account o checkout precedenti.
- Restano identici alla baseline stabile: geometria rettilinea, regole, catalogo varietà/cloni/portainnesti, template del documento, UI preventivi, `submit-quote`, logo originale e `CNAME`. Il calcolatore è stato esteso per la curvatura indipendente e i chiamanti report/condivisione passano i metadati dei passaggi. Quantità di mappa, riepiloghi e documenti usano lo stesso motore. La tipografia del documento è ripristinata.
- Record Conteggi precedenti e punti curva senza `segmentId` restano validi. I nuovi dettagli dei materiali sono facoltativi. Non occorre una nuova migrazione SQL per la 1.2.4.

## Comportamento corrente

| Area | Comportamento |
|---|---|
| Font | Comfortaa locale 300–700 per l’interfaccia, controlli, dialoghi e nomi mappa. Il documento generato usa la precedente famiglia Inter/system e i diagrammi Arial, sia a schermo sia in stampa. Asset e licenza OFL inclusi. |
| Accessi | Logo con selettore strumenti e Profilo aprono direttamente Conteggi su desktop/mobile. Anche il contatore mostra logo e selettore in alto a sinistra; il contatore offre un pulsante diretto per tornare al configuratore. Rimosso il pulsante Conteggi aggiuntivo in alto a destra della mappa. Conservati gli accessi dai campi e il gateway dei dati. |
| Nomi sulla mappa | I tag dei campi visibili restano presenti con quel campo, un altro campo o nessuno selezionato. Se il centro esce dall’inquadratura, il nome si ancora alla porzione visibile del campo; i tag sovrapposti vengono separati. Nessun tag per campi completamente fuori schermo. |
| Filari curvi | Un passaggio lineare che attraversa il campo nella direzione trasversale divide la curva in tratti indipendenti, anche con passaggio da 1,50 m. Controlli e slider mostrano il tratto; aggiungere un secondo punto privilegia il tratto ancora vuoto. Modificare un tratto non cambia l’altro. Supportati passaggi obliqui e tratti corti vicino al bordo; offset impossibili vengono ridotti entro il tratto. Passaggi corti interni, longitudinali ed esclusioni areali mantengono il comportamento precedente. |
| Limite dei passaggi incrociati | Quando due passaggi trasversali si intersecano dentro il campo, resta la curva globale con tutte le esclusioni effettive. Questa scelta conserva geometria e quantità senza filari duplicati o omessi; i tratti laterali di un incrocio non sono indipendenti nella 1.2.4. Passaggi paralleli sovrapposti sono trattati come una sola interruzione. |
| Contatore | Ingresso diretto, fondo scuro, logo originale in filigrana leggera inclinata, numero grande. Titolo Lettura modificabile, matita, bordo e suggerimento esplicito. Audio/vibrazione e categoria a icone. `+` verde a tutta larghezza, centrato; `−1` a sinistra sopra il `+`. Azzeramento con conferma; feedback sonoro/aptico e flash dopo commit locale riuscito, secondo il supporto del browser. |
| Archivio | Una sola schermata con tutte le card degli elenchi e tre gruppi espandibili: Barbatelle / Viti, Pali e Altro, ciascuno con totale e letture modificabili in popup. Nuova lettura e nuovo elenco a icona; Riprendi il conteggio centrato quando esiste una lettura aperta. Intestazione centrata, nome profilo senza overflow, icona di salvataggio discreta in alto e avviso locale/ospite in fondo. |
| Dettagli | Barbatelle / Viti: vitigno e portainnesto. Pali: tipo testa/filare/altro e materiale castagno/ferro/altro. Altri componenti: molle, tendifili, ancore, fili, tutori, legacci, distanziatori e altro. È ammesso testo personalizzato. Restano titolo, quantità, note, campo e selezione o creazione della destinazione; ID e quantità si conservano negli spostamenti. Dettagli conservati cambiando categoria e inclusi nei riepiloghi, snapshot e codice email. |
| Salvataggio | La lettura aperta è locale nello scope del proprietario; ricarica e offline conservano gli impulsi. Salva chiude la lettura e crea una sola riga nell’elenco del giorno locale di apertura. Solo la lettura conclusa entra negli elenchi e può essere sincronizzata. Se la destinazione implicita è stata eliminata, si usa un elenco giornaliero valido. |
| Editor e navigazione | Checkpoint verificato prima dell’uscita, inclusi vertici incompleti, passaggi, camera, transazione e schermata mobile. Errori di salvataggio bloccano l’uscita. La disponibilità dell’editor resta persistente dopo l’inizializzazione: non si attende un nuovo `load` durante attività dei tile. Ripristino e cambio campo mantengono le correzioni 1.2.2. Associazione facoltativa a un campo; Conteggi resta utilizzabile autonomamente. |
| Identità e concorrenza | Archivi distinti per owner/ambiente. Logout invalida il recupero offline; cambio account sospende operazioni e conserva il lavoro nel precedente scope. Risposte tardive non aggiornano il nuovo account. I comandi sospesi di lettura, eliminazione, spostamento e associazione campo catturano il proprio contesto al click; riprova non dipende da modali rimossi. Doppio salvataggio del campo protetto. Revisioni e conflitti restano verificati. |
| Cloud, admin e invio | Codice con verifica JWT/ruolo corrente e RLS. Appunti e richieste volontarie separati; autosalvataggio/sync non inviano richieste commerciali. Trasmetti a Vivai Obice richiede riepilogo e conferma, retry con stesso ID e payload. Riutilizzo Resend/mittente esistente. I servizi restano disattivati nel pacchetto consegnato. |

## Verifiche storiche della 1.2.3

- Suite finale `node --test tests/*.test.mjs`: **915 passati, 0 falliti, 0 saltati**. Test precedenti conservati; aggiornate le aspettative statiche dei riferimenti cache. `npm run check` e `git diff --check` passati. Manifest offline rigenerato: 35 risorse.
- Test DOM, IndexedDB emulato e PostgreSQL PGlite: archivio unico, paginazione oltre 100 elenchi, popup e metadati, categorie, testo libero e payload precedenti, spostamenti, snapshot immutabili, CAS, retry idempotenti, escaping email, permessi e isolamento. Regressioni riprodotte prima del fix per azioni sospese durante cambio account e doppio salvataggio campo.
- Curve: controlli e domini per tratto, indipendenza, obliquità, microtratti, sovrapposizione dei controlli, rimozione del passaggio e ID obsoleto; quantità coerenti nei riepiloghi e nel documento. La revisione ha confrontato 32 casi di curve precedenti e 8 rettilinei: parità mantenuta. Incrocio a X: geometria identica al percorso storico con tutte le esclusioni.
- `scripts/counts-browser.mjs`: Chromium desktop, mobile 390 px e mobile 320 px. Impulsi, ripresa, offline, reset, tastiera, salvataggio, dettagli dei materiali, spostamenti, scope, titolo, header lungo, pulsanti e footer. Totali estremi validi non si sovrappongono alle etichette. Screenshot ordinari controllati.
- `scripts/tool-menu-browser.mjs`: touch, click, hit testing, tap senza click nativo, click ritardato, accessi dal logo/editor/Profilo ospite e utente; viewport mobile, 320 px, tablet e desktop. Checkpoint e ingresso diretto verificati.
- `scripts/configurator-restore-browser.mjs`: app completa con MapLibre/Draw reali; fixture mantengono `loaded()` false dopo il primo `load`. Quattro casi desktop/mobile, ospite/utente: editor e bozze utilizzabili. La prova desktop modifica davvero uno dei due controlli di curvatura e verifica aggiornamento delle righe MapLibre, persistenza e indipendenza dell’altro tratto.
- `scripts/map-field-labels-browser.mjs`: tre casi desktop utente, mobile utente e desktop ospite. Selezione attiva/altra/nessuna, campo parzialmente visibile con centro fuori, pan, rotazione, tag sopra il canvas, accessi Conteggi conservati e pulsante extra rimosso. Il difetto del tag fuori viewport è stato riprodotto prima del fix.
- `scripts/report-fonts-browser.mjs`: template reale del documento, 206 nodi e relativi pseudo-elementi; desktop/mobile × schermo/stampa. Zero differenze dalla tipografia precedente; controlli Comfortaa e diagrammi Arial. Screenshot e PDF di verifica prodotti localmente.
- Due revisioni indipendenti in sola lettura sul sorgente finale: Conteggi e mappa/curve/font, **nessun problema critico, importante o minore aperto**. Difetti riprodotti, corretti e ricontrollati: comandi sospesi e doppio save-field, overflow dei totali, merge di controlli curva, dominio obliquo, microtratto, ID dopo rimozione passaggio e incrocio a X.
- Pacchetto controllato per integrità ZIP, percorsi necessari, hash e riferimenti locali; esclusi `.git`, dipendenze installate, temporanei e secret. Inventario in `manifest-piattaforma.json`.

## Limiti delle verifiche e attivazione

Le prove browser usano Chromium 151 con fixture Auth/database/rete; UI e moduli sono quelli consegnati. **Hosting e Safari su dispositivi reali non collaudati.** Restano sessione Auth effettiva, mappa sul dominio pubblicato, aggiornamento worker, persistenza Safari, stampa/PDF e audio/aptica fisici. Il browser può non supportare la vibrazione; non si promette aptica su iOS.

**Backend Conteggi non attivato.** L’inventario Supabase del 2/10/2026 non includeva la migrazione Conteggi. Nessuna migrazione applicata, funzione distribuita, impostazione Auth/secret/DNS modificata o email reale inviata. `syncEnabled`, `adminEnabled`, `submitEnabled`, `guestTransferEnabled` sono false e `noticeVersion` null. Il caricamento statico non installa il backend. Per i nuovi metadati non serve una nuova migrazione, ma un backend già attivo deve ricevere le funzioni aggiornate.

Nuova registrazione ospite conserva UID; accesso a un account esistente con appunti richiede trasferimento esplicito e servizio attivo. Finché è spento, quell’ospite può continuare o registrare un nuovo account, conservando l’accessibilità degli appunti. Un ospite senza lavoro locale può accedere normalmente.

## Riproduzione, pubblicazione e ripristino

Frontend statico; dipendenze cartografiche esistenti. Test con `npm ci`, `npm ci --prefix conteggi`, `npm test`, `npm run check`. Runner browser separati richiedono Playwright/Chromium e gli asset MapLibre/Draw di fixture; variabili opzionali `COUNTS_CHROMIUM_PATH`, `COUNTS_MAPLIBRE_PATH`, `COUNTS_MAPBOX_DRAW_PATH`, `COUNTS_BROWSER_OUTPUT`. Node verificato: 24.19.0. La pubblicazione degli asset non richiede dipendenze installate.

Le tre migrazioni additive e le funzioni `counts-api`, `counts-admin`, `submit-counts` sono consolidate in `supabase/`. `PUBBLICAZIONE.md` riporta installazione, flag, riuso dei secret, collaudo e rollback. Le note in `docs/conteggi/` e le altre release sono storiche; questo è il documento corrente.

Pubblicare il pacchetto completo nel checkout esistente. Chiudere le vecchie schede e riaprire online per gli asset 1.2.4; mantenere origine HTTPS e archivi. Nessuna rimozione obbligatoria. Per il rollback disattivare i servizi nuovi e ripubblicare il pacchetto precedente, conservando tabelle, account, IndexedDB e localStorage. Non cancellare tutti i dati del sito.
