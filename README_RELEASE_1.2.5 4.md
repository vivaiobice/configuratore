# Release 1.2.5 — porzioni indipendenti

Un passaggio da 1,50 m che separa un campo a L genera porzioni coltivabili selezionabili tramite pulsanti e mappa. Direzione, curvatura ed equidistanza si modificano nella porzione attiva. Il campo resta uno solo, con identità, archivio, snapshot e documento invariati; il vecchio disegno viene ereditato fino alla prima modifica locale.

Il motore condiviso applica le esclusioni fisiche originali e le capezzagne sul perimetro originario. Ogni frammento fisico ha due pali di testa. Riepiloghi, Admin, pagine condivise e stampa ricevono i layout completi. I parametri stampati descrivono ciascuna porzione con angolo, stato rettilineo/curvo ed equidistanza. I dettagli aggiuntivi vengono impaginati separatamente dalle note, con continuazione senza limiti sul numero delle porzioni. Comfortaa resta nell’interfaccia; font dei documenti HTML e Helvetica del generatore nativo conservati.

## Verifiche locali

- `npm test`: 987 passati, 0 falliti, 0 saltati sia nel worktree sia nella copia estratta senza `.git`; il controllo dei moduli enumera direttamente i sorgenti, escludendo le dipendenze.
- `npm run check`, `git diff --check`: superati.
- `npm run offline:build`: 37 risorse statiche, compresi URL con query effettivamente richiesti dalla pagina e dipendenze locali. JavaScript offline corrisponde all’URL esatto; la navigazione mantiene il fallback alla shell.
- Regressioni su geometria anonima: filari e totali identici in editor, riepilogo, Admin, report e condivisione; metadati delle esclusioni conservati; snapshot/righe persistite/ripristino/handoff e revisioni delle sole porzioni verificati.
- Chromium reale desktop e formato mobile: selezione da mappa e pulsanti, isolamento di curve/direzioni, salva/ricarica/cambio campo e disegno di un passaggio fisico da 1,50 m. Nessun accesso a dati o progetti reali.
- Quattro PDF anonimi, nativi e da stampa HTML: 2 porzioni (5 pagine) e 60 porzioni con un’etichetta larga da 1.728 caratteri (9 pagine native, 12 da stampa HTML). Testo estratto, tutte le pagine renderizzate in PNG e ispezionate; nessuna sovrapposizione di parametri, note o piè di pagina. L’esportatore nativo resta un modulo già presente, senza nuovo collegamento UI.
- Aggiornamento Chromium con moduli 1.2.4 già caricati: il nuovo grafo richiede una sola identità 1.2.5 per fields/calculator/row-curves/row-portions. Regressione worker: non restituisce vecchi byte JS per una query diversa.

## Riproduzione e consegna

`npm ci`, `npm ci --prefix conteggi`, `npm run offline:build`, `npm test`, `npm run check`. Script Chromium: `scripts/row-portion-browser.mjs` e `scripts/row-portion-report-browser.mjs`; la prova delle etichette larghe usa `COUNTS_WIDE_PORTION_LABEL=1` sul secondo script. Richiedono runtime Playwright/pdf-lib e risorse Chromium locali indicate dalle variabili COUNTS_BROWSER_ASSETS, COUNTS_CHROMIUM_PATH e COUNTS_BROWSER_OUTPUT. La prova cache usa la cronologia Git locale per il motore precedente.

Il manifest registra il commit sorgente di implementazione e hash di tutti i file finali tracciati, escluso il manifest stesso. Lo ZIP finale viene creato dal commit finale dopo revisione dell’intero ramo, con radice piatta che contiene sia index.html sia conteggi/index.html. Dipendenze, worktree, report interni, log e fixture PDF generati non vengono inclusi.

Nessuna pubblicazione remota, scrittura cloud, migrazione SQL o attivazione dei servizi Conteggi. Dispositivi iOS/Safari reali e servizi LIVE non collaudati. Il nuovo worker attende la chiusura delle vecchie schede: riaprire online prima della verifica offline, conservando gli archivi locali.
