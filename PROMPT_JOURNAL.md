# PROMPT JOURNAL — Configuratore vigneto Vivai Obice

Documento di continuità per agenti e sviluppatori. Aggiornato alla **V20 WebApp TEST**.
Prima di modificare il progetto, leggere questo file, `README.md`, i test della release e il codice interessato.
Non ricostruire il progetto da memoria e non perdere le funzioni già approvate.

## Obiettivo del prodotto

WebApp per progettare preliminarmente un vigneto: disegno di uno o più campi su mappa,
simulazione dei filari, stima di barbatelle e pali, gestione capezzagne, passaggi e zone escluse,
scelta del materiale vegetale, salvataggio, proposta PDF e richiesta preventivo.

Vincolo fondamentale: **la versione desktop stabile non deve cambiare** durante il lavoro mobile.
La UI mobile deve comportarsi come un'app cartografica, prendendo spunto dal video OneSoil fornito
il 17/09/2026 (`ScreenRecording_09-17-2026 15-14-32_1.mp4`), senza copiare marchi o asset.

## KPI e criteri di successo

- Apertura mobile: l'utente vede immediatamente la mappa e i campi già disegnati.
- Primo campo: mappa → `Aggiungi campo` → perimetro → parametri → salva → mappa.
- Tre destinazioni principali: **Mappa / Campi / Progetti**. Salva è un'azione contestuale.
- Un campo salvato deve mostrare: anteprima, superficie, superficie netta, filari, metri lineari,
  barbatelle, quantità commerciale ×25, pali intermedi, pali di testa, pali totali, sesto,
  capezzagne, orientamento, vitigno, clone, portainnesto, meccanizzazione, esclusioni e note.
- Tutti gli editor devono conservare: chiusura esplicita, ultimo punto, modifica/aggiunta/rimozione
  vertici, quote dei lati, passaggio 1,50 m, zone escluse modificabili/eliminabili, orientamento filari.
- Passaggi ed esclusioni sono tagli netti: nessuna capezzagna interna.
- Ogni segmento di filare risultante genera due pali di testa.
- Anteprima mobile senza testi introduttivi; solo logo Vivai Obice in alto a sinistra e filigrana.
- Navigazione e pulsanti principali con target touch di almeno 44 px; supporto verticale e orizzontale.
- Nessuna perdita di dati durante cambio campo, rotazione o ritorno dalla modifica.
- La pubblicazione è statica e non richiede build. GitHub Pages/Wix possono ospitare i file.

## Cronologia delle richieste e decisioni

### Base ricevuta

- Il file iniziale era `configuratore-vivai-obice-github-v14(1).zip`.
- L'utente ha chiarito che la versione precedente consegnata era la V14.
- Le release successive sono state restituite come ZIP, mantenendo lo stesso progetto.

### V15 — modifica perimetro

- Richiesto di spostare i punti del perimetro per correggere posizione e forma.
- Attivato il comando esplicito `Modifica punti`.
- Corretto il flusso di chiusura/conferma del passaggio.

### V16 — vertici, esclusioni e tagli netti

- Le maniglie Mapbox Draw risultavano visibili in modo intermittente, soprattutto cambiando campo.
- Sostituite/rafforzate con maniglie HTML esplicite: trascinamento vertici e pulsanti `+` intermedi.
- Zone escluse rese modificabili e cancellabili.
- I pulsanti delle aree escluse sono stati richiesti più piccoli e proporzionati.
- Corretto il calcolo: le capezzagne si applicano al bordo esterno prima delle sottrazioni;
  passaggi e zone escluse non aggiungono capezzagne.
- Aggiunti al riepilogo pali totali e pali di testa.

### V17 — primo editor mobile

- La mappa piccola doveva essere solo un'anteprima dei campi.
- Nell'anteprima restano: Satellite, Stradale, Catasto, GPS, centra campo e zoom.
- Tutti gli strumenti di disegno/modifica sono destinati alla mappa a tutto schermo.
- Aggiunta gestione touch dedicata per evitare il doppio punto causato dal click sintetico iOS.
- Richiesto di non modificare desktop.
- Problemi segnalati: apertura mappa e ritorno al progetto non funzionanti; landscape non scorrevole;
  riepilogo flottante troppo grande; anteprima troppo piccola.

### Correzione pali

- Ogni intersezione con passaggio o zona esclusa deve produrre nuovi pali di testa.
- Formula attuale: `headPosts = numero_segmenti_filare × 2`;
  pali intermedi per segmento `max(0, ceil(lunghezza / distanzaPali) - 1)`.
- Test di regressione: passaggio 1,50 m trasversale raddoppia i pali di testa senza introdurre
  capezzagne e sottrae soltanto 1,50 m a ogni filare intersecato.

### V18 — tentativo mobile ispirato a OneSoil

- Analizzate documentazione e registrazione dell'app OneSoil.
- Soluzioni osservate: mappa full screen, pannelli dal basso, scheda campo, conferma evidente,
  navigazione inferiore e strumenti contestuali.
- La V18 introdusse pannelli mobile e riepilogo compatto, ma l'utente l'ha rifiutata perché
  continuava a sembrare una pagina web e non apriva direttamente nell'app mappa.
- Lezione: non basta spostare i controlli dentro pannelli; servono vere schermate e transizioni.

### V19 — architettura mobile corrente

Richiesta esplicita:

1. Aprendo il link mobile si entra direttamente nella mappa con tutti i campi segnati.
2. Logo Vivai Obice in alto a sinistra e filigrana sulla mappa.
3. Pulsante `Aggiungi campo` apre l'editor.
4. Confermato il perimetro, si passa a una nuova schermata con tutti i parametri impianto.
5. Salvando si torna alla mappa.
6. Menu inferiore ben definito; decisione: `Mappa / Campi / Progetti`.
7. `Campi` mostra il riepilogo aggregato e le schede di tutti i campi.
8. La scheda specifica contiene anteprima, dati completi, PDF/preventivo e modifica.
9. `Progetti` archivia e riapre impianti completi sul dispositivo.
10. Il calcolatore rapido è un pulsante flottante della mappa.

Implementazione V19:

- `src/mobile-ui.js`: shell mobile a schermate; riusa gli input originali tramite ancore DOM.
- `mobile.css`: layout app mobile isolato dai CSS desktop.
- `src/local-projects.js`: archivio locale versionato dei progetti completi.
- Home mappa, editor, parametri, elenco campi, dettaglio e archivio progetti.
- Snapshot transazionale: Annulla ripristina lo stato precedente di campo/progetto.
- Il salvataggio locale non richiede i dati di contatto; PDF e preventivo mantengono il flusso contatti.
- Il gestore responsive desktop non può ricollocare la mappa mentre la shell mobile è attiva.

### V20 — fix dei comandi mobile

Segnalazioni ricevute dopo la V19: `Aggiungi campo` inattivo, impossibilità di aprire la
configurazione dei campi, rotazione assente e comandi della sezione Mappa inattivi.

Correzioni:

- aggiunto inoltro esplicito `pointerup` touch → attivazione pulsante, con soppressione del click
  sintetico successivo per evitare azioni doppie su Safari;
- resi espliciti livello e `pointer-events` dei controlli sopra la superficie MapLibre;
- riabilitata la rotazione a due dita esclusivamente quando il chiamante è mobile;
- aggiunta selezione delle geometrie renderizzate: il tocco su un campo passa il relativo ID,
  carica il campo e apre la scheda;
- mantenuto il comportamento desktop precedente, compresa la rotazione con comandi/trackpad.

## Errori già incontrati e correzioni

- **Download ZIP non partiva:** consegnare sempre link `sandbox:` diretto a `/mnt/data/...zip` e
  salvare anche una versione persistente dello stesso file.
- **Punti intermittenti:** non affidarsi soltanto allo stato visuale di Mapbox Draw; usare maniglie
  esplicite e ripulirle al cambio campo.
- **Modifica punti non funzionante:** mantenere API separate `beginVertexEditing` / `finishVertexEditing`.
- **Passaggio non confermato:** su mobile, dopo due punti attendere il pulsante `Conferma passaggio`.
- **Click sintetico iOS:** sopprimere il click successivo al `touchend` per 700 ms.
- **Capezzagne interne errate:** generare capezzagne sul poligono esterno, poi sottrarre esclusioni.
- **Pali sottostimati:** contare due pali di testa per ogni tratto di filare, non per ogni filare logico.
- **Landscape interpretato desktop:** il mobile usa anche `(max-width:1100px) and (pointer:coarse)`.
- **Pulsanti apri/chiudi mappa inaffidabili:** V19 elimina quel passaggio; la mappa è la home.
- **Mappa spostata fuori dalla shell dopo resize:** `placeMapForViewport()` non deve ricollocarla
  quando `mobileUi.isActive()` è vero.
- **V18 troppo simile a pagina web:** V19 nasconde interamente topbar e configuratore desktop sul mobile.
- **Tasti V19 inattivi su iOS:** attivazione touch non più dipendente esclusivamente dal click sintetico;
  controlli sopra la mappa con stacking e puntamento espliciti.
- **Campo sulla mappa non apribile:** aggiunto hit-test sulle geometrie renderizzate e apertura scheda.
- **Rotazione mobile assente:** abilitato `touchZoomRotate.enableRotation()` solo sul layout mobile.
- **Archivio locale corrotto o quota esaurita:** non sovrascrivere dati illeggibili e mostrare errore.

## Regole di calcolo da non cambiare accidentalmente

- Barbatelle teoriche: superficie netta / (distanza piante × distanza filari).
- Quantità commerciale: arrotondamento sempre per eccesso al multiplo di 25.
- I filari sono generati geometricamente e tagliati da passaggi/zone escluse.
- Passaggio lineare standard: corridoio largo 1,50 m.
- Capezzagna: esclusivamente sul bordo esterno del campo.
- Pali di testa: due per ogni segmento di filare risultante.
- Pali intermedi: calcolati separatamente per ciascun segmento.
- Le stime restano preliminari e devono riportare disclaimer.

## File principali

- `index.html`: interfaccia desktop originale e dipendenze.
- `styles.css`: CSS desktop storico; non modificare per la V19 salvo bug dimostrato.
- `mobile.css`: interfaccia mobile V19.
- `src/app.js`: stato, eventi, collegamento UI/mappa/cloud e transazioni mobile.
- `src/mobile-ui.js`: router e schermate mobile.
- `src/map.js`: disegno, modifica, quote, passaggi, esclusioni, catasto e mappe base.
- `src/geometry.js`: geometria e taglio filari.
- `src/project-calculator.js`: KPI quantitativi.
- `src/fields.js`: campi multipli e campo attivo.
- `src/local-projects.js`: archivio progetti locale.
- `src/report*.js`, `src/pdf-model.js`: proposta/PDF.
- `tests/`: regressioni e contratti di release.

## Checklist obbligatoria per la prossima release

1. Leggere questo journal e identificare la release di partenza.
2. Non modificare desktop senza una nuova richiesta esplicita.
3. Scrivere prima un test che riproduce ogni bug.
4. Eseguire `npm test` e `npm run check`.
5. Verificare nell'archivio ZIP almeno `index.html`, `mobile.css`, `src/app.js`,
   `src/mobile-ui.js`, `src/map.js`, `PROMPT_JOURNAL.md` e `README.md`.
6. Aggiornare questo journal con richieste, decisioni, errori, test e limitazioni.
7. Aggiornare numero release e cache busting.
8. Non dichiarare “testato su iPhone” senza prova reale su Safari iOS.
9. Conservare lo ZIP precedente tramite cronologia versioni; sostituire l'identità persistente corrente.

## Stato di verifica e limitazioni alla V19

- Test unitari/DOM automatizzati: vedere l'output dell'ultima esecuzione e `README.md`.
- Test nativo Safari iPhone: ancora necessario dopo la consegna della V19.
- Il browser remoto non può raggiungere il server locale del workspace; una verifica DOM automatizzata
  non sostituisce la prova tattile su dispositivo.
- L'archivio `Progetti` è locale al browser/dispositivo. La sincronizzazione cloud esistente resta
  utilizzata dalle azioni finali, ma non è stata estesa a un nuovo elenco account nella V19.
