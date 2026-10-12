# Release 1.2.6 — visibilità mappe, stampa e Profilo mobile

Il pulsante occhio è disponibile nella mappa principale, nella mappa Campi e nell’editor, su desktop e mobile. Campo, Schema vigneto e Quote si possono mostrare o nascondere separatamente; Mostra tutto ripristina la visualizzazione completa. Le scelte sono temporanee e seguono la mappa durante la navigazione. Non cambiano i dati del progetto e lasciano disponibili i vertici e gli strumenti della modifica in corso.

Nello Schema tecnico stampato le quote sono esterne al campo e collegate al lato di riferimento. I campi ordinari vengono ingranditi nello stesso riquadro. Perimetri molto densi usano colonne esterne, con riduzione proporzionale solo quando lo spazio disponibile lo richiede. La disposizione completa delle quote si applica alla stampa: le piccole anteprime restano leggere. Orientamento e curvatura sono integrati sinteticamente in Geometria e filari, senza una sezione dedicata né la dicitura sull’equidistanza. I dettagli eccezionalmente lunghi proseguono su pagine dati aggiuntive. Note e piè di pagina restano separati, anche con nomi campo su più righe.

Il Profilo mobile usa campi e caratteri più compatti, due colonne in verticale e quattro in orizzontale. Tutti i dieci campi e i comandi sono visibili senza scorrimento nelle dimensioni collaudate. Gli input conservano un font da 16 px per evitare lo zoom automatico durante la digitazione su iOS. Comfortaa resta nell’interfaccia; la tipografia precedente del documento e Helvetica dell’esportatore nativo sono conservati.

## Verifiche

- `npm test`: 1004 passati, 0 falliti, 0 saltati. `npm run check` e `git diff --check` superati.
- MapLibre e Chromium reali con dati anonimi locali: occhio indipendente per le tre categorie, desktop/mobile, navigazione fra mappa principale, Campi ed editor, ridisegno, Mostra tutto, vertici disponibili anche con il campo nascosto. Geometria, filari e quantità invariati.
- Profilo dentro l’app completa a 320 × 568, 390 × 844 e 568 × 320 pixel: dieci campi presenti, comandi sopra la navigazione e nessuno scorrimento. Prove aggiuntive del selettore tema generato e di nomi lunghi.
- Sette fixture di stampa, sia HTML sia PDF nativo: campo a L, 31 lati e due porzioni, 60 porzioni, etichetta da 1.728 caratteri più Unicode, nome campo lungo e perimetri da 100/150 lati. Quote esterne e separate, note e testi entro i margini; quattro pagine per il caso ordinario, continuazione per i casi estremi. Controlli dei limiti e immagini rappresentative ispezionati.
- Regressioni delle porzioni, del salvataggio e dei pali di testa della 1.2.5 mantenute nella suite. Moduli e relativi importatori aggiornati a `?v=1.2.6`; worker Conteggi rigenerato con 37 risorse e URL JavaScript esatti.

## Riproduzione e consegna

Eseguire `npm ci`, `npm ci --prefix conteggi`, `npm run offline:build`, `npm test`, `npm run check`. Le prove aggiuntive sono `scripts/map-visibility-browser.mjs` e `scripts/report-layout-v126-browser.mjs`; richiedono Playwright/Chromium nel runtime indicato da `CODEX_PRIMARY_RUNTIME_NODE_MODULES` e `COUNTS_CHROMIUM_PATH`. La prova mappa usa gli asset MapLibre/Draw locali in `MAP_VISIBILITY_BROWSER_ASSETS` e scrive in `MAP_VISIBILITY_BROWSER_OUTPUT`; la prova report usa `COUNTS_BROWSER_OUTPUT`.

Il pacchetto unico ha radice piatta, con `index.html` e `conteggi/index.html`. Il manifest riporta il commit sorgente e gli hash dei file finali tracciati, escluso il manifest stesso. Dipendenze installate, checkout, log e PDF di collaudo non sono inclusi.

Nessuna pubblicazione remota, scrittura cloud, migrazione SQL o attivazione dei servizi Conteggi. Le prove mobile usano Chromium con viewport e touch emulati; dispositivi iOS/Safari reali e servizi LIVE non collaudati. Il worker attende la chiusura delle vecchie schede: riaprire online per ottenere gli asset nuovi, mantenendo gli archivi locali.
