# Release 1.3.0 — terreno e coordinate precise

La nuova funzione Terreno si attiva esplicitamente da Affina progetto. L'altimetria viene acquisita automaticamente: DTM regionale Piemonte da 5 m dove disponibile, altrimenti TINITALY nazionale da 10 m. Un campo usa una sola fonte e conserva i dati numerici acquisiti insieme al disegno applicato. Fonte, risoluzione ed epoca sono visibili; riaprire il progetto non richiede una nuova acquisizione.

Segui il terreno propone filari con interfila minima misurata sulla superficie del modello. Prima dell'applicazione si vedono le variazioni per porzione e per l'intero campo. La prima applicazione converte tutte le porzioni; in seguito la guida di una porzione può cambiare indipendentemente dalle altre. Le modifiche comuni, come interfila o capezzagna, richiedono una nuova proposta per tutto il campo e conservano le guide delle porzioni non selezionate. Passaggi da 1,50 m e zone escluse tagliano fisicamente i filari; ogni frammento ha due pali di testa. Le superfici e le lunghezze sul terreno sono integrate sul modello numerico, anche lungo le curve.

La vista 3D è un'anteprima approssimativa dello stesso modello, con esagerazione verticale iniziale 1. Camera e visualizzazione non cambiano il calcolo. Tornare alla modifica chiude il 3D e ripristina la vista 2D e le scelte del pulsante occhio.

Dopo aver sbloccato i vertici, un'azione discreta consente di impostare coordinate precise del perimetro, delle esclusioni e degli estremi dei nuovi passaggi. Sono disponibili WGS84 longitudine/latitudine ed EPSG:32632, 32633 e 32634; è accettata la virgola decimale. Confermare valori invariati conserva le coordinate originali complete. Lo spostamento a mano resta disponibile. I nuovi passaggi mantengono asse e gruppo: modificarne un estremo rigenera tutte le parti a larghezza 1,50 m in un unico aggiornamento. I vecchi poligoni restano modificabili senza ricostruire estremi non disponibili. Nessun nuovo strumento per ostacoli puntuali: si usano piccole zone escluse.

## Compatibilità con la 1.2.6

Senza applicare Terreno si conserva il percorso di calcolo precedente. I 144 risultati completi catturati dal commit stabile `7b1e0165e559cbd66864af1751dfc6fa7b2617a5` coincidono esattamente, su campi rettangolari, a L e concavi, curve, esclusioni e passaggi. Anche il modello di stampa e gli HTML di progetto/condivisione senza terreno hanno confronti di parità con la versione stabile.

Sui terreni pianeggianti, quando la famiglia di filari esistente soddisfa l'interfila richiesta, se ne conservano fase, disegno e quantità commerciali. I vecchi metri usati per le quantità restano distinti dai metri fisici integrati sul modello: interfaccia e stampa mostrano Metri per quantità e Metri sul terreno, con la dicitura Quantità del disegno conservate o Quantità in parte conservate. Le aree sul terreno e delle capezzagne sono sempre quelle integrate sul modello. Una famiglia che non soddisfa la distanza minima viene adattata o rifiutata esplicitamente.

Restano il selettore tool, Conteggi, le porzioni indipendenti, i controlli occhio, i gesti della mappa e il Profilo mobile compatto. Comfortaa resta nell'interfaccia; la tipografia precedente dei documenti e Helvetica dell'esportatore PDF nativo sono conservate. Conteggi conserva la propria versione funzionale 1.2.4; il pacchetto unico e la cache offline sono 1.3.0.

## Precisione e salvataggio

Un DTM da 5 o 10 m produce stime riferite al modello e non un rilievo centimetrico. La numerazione precisa delle coordinate non aumenta la risoluzione altimetrica. Geometrie ramificate, copertura incompleta, dati mancanti o casi non verificabili richiedono di rivedere il disegno; non si sostituiscono automaticamente con un calcolo piano.

Il limite è 262.144 celle native, 500.000 nodi di calcolo e 10 secondi nel worker, 1 MiB per campo canonico e 4 MiB per il salvataggio completo. L'acquisizione e la proposta sono temporanee. Applica aggiorna il progetto solo dopo un salvataggio locale riuscito; un errore di quota conserva il progetto precedente e la proposta recuperabile. Risposte tardive dopo cambio campo o account vengono scartate. Un terreno applicato ma invalidato da modifiche mostra Da rivedere e quantità non disponibili, anche negli elenchi, nella condivisione e in Admin.

## Verifiche

- Suite completa: 1.147 test superati, zero falliti, saltati o annullati; compresi i 144 confronti completi con la 1.2.6. Controllo sintattico e whitespace superati.
- Chromium e MapLibre 4.7.1 reali, fixture anonime locali: coordinate, trascinamento desktop/touch, disegno manuale, rigenerazione atomica dei passaggi, proposta/applicazione/annullamento, errore di quota recuperabile, cambio account, selezione porzioni, ultima modifica prevalente e ciclo 2D/3D. Modifica globale su campo a L con guida originale a 45°: solo la porzione selezionata riceve la guida automatica.
- Mappa principale, Campi ed editor: occhio indipendente per Campo, Schema vigneto e Quote, dati invariati e vertici utilizzabili. Profilo con dieci campi e comandi senza scorrimento a 320 × 568, 390 × 844 e 568 × 320 pixel.
- Stati invalidi e distinzione fra quantità conservate e metri fisici verificati su mobile, desktop, schede proprietario e Admin.
- Stampa: 24 PDF di collaudo, con casi precedenti densi e nomi lunghi, terreno applicato/invalidato, quantità pianeggianti/miste, stampa condivisa e guida automatica. Quote esterne, dati sopra il piè di pagina, font conservati; immagini rappresentative ispezionate.
- Richieste numeriche reali dal browser locale: TINITALY 10 m in Toscana e fallback nazionale in Piemonte. La richiesta regionale 5 m restituisce TIFF numerico e CORS dal controllo HTTP, ma nel browser del runtime ha risposto 401 ed è intervenuto il fallback. La disponibilità regionale da un'origine pubblicata non è stata collaudata.
- Cache Conteggi rigenerata con 38 risorse e URL JavaScript esatti; verifica degli importatori e del worker. ZIP finale verificato per hash, riferimenti locali e test sul contenuto estratto.

## Riproduzione e consegna

Eseguire `npm ci`, `npm ci --prefix conteggi`, `npm run offline:build`, `node --test --test-concurrency=2 tests/*.test.mjs`, `npm run check`. Le prove browser richiedono Playwright nel runtime indicato da `CODEX_PRIMARY_RUNTIME_NODE_MODULES` e una distribuzione Chromium completa indicata da `COUNTS_CHROMIUM_PATH`, comprese le librerie grafiche necessarie a WebGL. Gli asset MapLibre/Draw locali si configurano con `MAP_VISIBILITY_BROWSER_ASSETS`.

Gli script sono `map-visibility-browser.mjs`, `coordinate-editor-browser.mjs`, `terrain-coordinates-browser.mjs`, `terrain-selective-browser.mjs`, `terrain-invalid-quantities-browser.mjs`, `terrain-mobile-basis-browser.mjs`, `report-layout-v126-browser.mjs`, `terrain-quantity-layout-browser.mjs`, `terrain-report-browser.mjs` e `terrain-live-provider-browser.mjs`, nella cartella scripts. Tutte le prove applicative usano fixture locali; la sola prova provider legge servizi pubblici senza autenticazione.

Il pacchetto ha radice piatta con `index.html` e `conteggi/index.html`. Il manifest riporta commit e hash di tutti i file tracciati, escluso il manifest stesso. Checkout, dipendenze installate, log e PDF di collaudo sono esclusi. Il pacchetto 1.2.6 è conservato.

Nessuna pubblicazione remota, migrazione SQL o scrittura su account LIVE è stata eseguita. Il campo reale Cascina Elena / Chardonnay - 775P non è stato aperto: i controlli geometrici usano fixture anonime a L. Le prove mobile usano touch emulato in Chromium; iOS/Safari reali non collaudati. Il worker offline attende la chiusura delle vecchie schede: riaprire online per caricare gli asset nuovi, mantenendo gli archivi locali.
