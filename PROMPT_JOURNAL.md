# PROMPT JOURNAL — Configuratore vigneto Vivai Obice

Documento di continuità per agenti e sviluppatori. Aggiornato alla **V42 WebApp TEST**.
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

### V21 — anteprima satellitare e grafica mobile

Richieste ricevute:

- nella schermata `Imposta l’impianto` mostrare sempre il satellite per valutare l’orientamento;
- rendere modificabili Nome campo e tutti gli altri parametri su iOS;
- barra inferiore traslucida, arrotondata, con icone e testi bianchi in stile app;
- pulsante `+ Aggiungi campo` in basso al centro, più compatto e squadrato;
- eliminare `+ / −` dello zoom mobile e lasciare un solo comando per riportare il Nord in alto;
- non modificare la versione desktop.

Implementazione:

- l’anteprima parametri usa la stessa istanza MapLibre dell’editor, bloccata all’interazione e forzata
  temporaneamente sul satellite; uscendo ripristina la base scelta dall’utente;
- il modulo parametri è isolato sopra la mappa e input/select/textarea ricevono puntamento e selezione
  testo espliciti per Safari iOS;
- introdotto dock mobile flottante traslucido e riposizionato il CTA di aggiunta campo;
- nascosti solo su mobile i controlli zoom MapLibre; il pulsante Nord originale viene riutilizzato;
- `styles.css` desktop resta alla V18 e non è stato modificato.

### Roadmap futura — terreno 3D e pendenze

- Integrare in futuro un DEM/DTM per vista 3D, quote, dislivello, pendenza ed esposizione.
- Prima fase: informativa e visuale, senza modificare automaticamente le quantità.
- Seconda fase: campionamento altimetrico lungo i filari per lunghezze reali, barbatelle e pali.
- Mantenere separati valori planimetrici e valori sul terreno, indicando risoluzione e affidabilità del dato.
- Preferire DTM/LiDAR ad alta risoluzione; un DEM da circa 30 m non è adeguato ai dettagli di vigneto.

### V22 — correzioni mobile dopo prova iPhone

Screenshot e problemi segnalati:

- `+ Aggiungi campo` scomparso;
- dock inferiore visivamente opaca anziché liquid glass;
- mappa interrotta sopra il fondo dello schermo;
- strumenti Mappa ancora visibili in Campi e Progetti;
- conteggio/riepilogo Campi non affidabile in presenza di bozze incomplete;
- vincolo ribadito: desktop intatto.

Cause e correzioni:

- la regola che mostrava il CTA aveva specificità CSS inferiore alla regola che lo nascondeva;
- `#mobile-map-host` conservava il vecchio margine inferiore di 72 px;
- la visibilità degli strumenti non era legata allo stato della schermata;
- il filtro Campi considerava valida qualsiasi `geometry` truthy, anche un anello incompleto.

La V22 assegna lo stato direttamente alla shell mobile, estende la mappa a tutto il viewport,
mostra il CTA con selettore non ambiguo, nasconde gli strumenti fuori da Mappa/editor, applica
blur+saturazione e maggiore trasparenza alla dock e conteggia solo perimetri chiusi validi.
`styles.css` desktop resta invariato alla V18.

### V23 — controlli modulo iOS e Satellite nella sezione Campi

Segnalazioni:

- tutti i campi testo/numerici e i menu a elenco di `Imposta l’impianto` non rispondevano su iPhone;
- nella schermata Campi non era visibile lo sfondo satellitare;
- desktop da mantenere invariato.

Correzioni:

- ripristinato `touch-action:auto` per input, select e textarea;
- isolati `touchstart`, `touchend`, `pointerdown` e `pointerup` dei controlli del modulo senza
  chiamare `preventDefault`, così Safari mantiene tastiera e selettori nativi;
- innalzato e isolato lo strato del modulo rispetto alla superficie MapLibre;
- in Campi la mappa sottostante viene forzata su Satellite e il pannello elenco diventa traslucido;
- aggiunti test DOM per propagazione touch, Satellite, conteggi e regressione desktop.

### V24 — controlli iOS globali, eliminazione campi e rifinitura mobile

- Inserita l’icona WebApp/Favicon fornita dall’utente e aggiunto il manifest installabile.
- Estesa la protezione degli eventi touch a tutti gli input, select e textarea della UI mobile,
  compresi ricerca mappa e calcolatore rapido, senza annullare il comportamento nativo iOS.
- Aggiunta l’eliminazione con conferma: pulsante `−` nella schermata Campi e pulsante
  `Elimina campo` nella scheda specifica.
- Se viene eliminato l’unico campo, il progetto conserva la propria identità locale ma torna a una
  bozza vuota pronta per un nuovo disegno.
- Sostituita la lettera `N` del comando Nord mobile con una freccia a bussola; tornando al layout
  desktop viene ripristinato il contenuto originale.
- Barra mobile più trasparente e arrotondata; pulsante Campo quadrato e centrato; scala e controlli
  cartografici sollevati sopra la barra per evitare sovrapposizioni.
- Aggiunta in mobile la dicitura `AMBIENTE TEST · V24`.
- Nessuna modifica al foglio desktop `styles.css`; la presentazione resta confinata a `mobile.css`.

### V24.1 — fix isolato dei controlli nativi iOS

- Segnalazione su Safari iPhone: i pulsanti rispondevano, mentre input e menu (`Superficie`,
  distanze, nome campo, vitigno, clone e altri select) restavano completamente inattivi.
- Causa: la protezione touch V24 era installata sulla radice mobile e intercettava troppo tardi il
  gesto nativo; i pulsanti funzionavano perché disponevano di un inoltro sintetico separato.
- Correzione: protezione spostata sui soli pannelli modulo (`mobile-pages` e foglio strumenti),
  propagazione fermata senza annullare l’evento e focus iOS esplicito su input/textarea al `touchstart`.
- Nessuna modifica grafica, ai calcoli o al desktop.

### V24.2 — sostituzione icona WebApp e favicon

- Sostituito esclusivamente `assets/vivai-obice-app-icon.png` con la nuova icona trasparente
  fornita dall’utente.
- Aggiornato il cache-busting di favicon, Apple Touch Icon e manifest a `v=24.2` per impedire a
  Safari/iOS di mantenere l’asset precedente.
- Nessuna modifica a interfaccia, interazioni, calcoli o desktop.

### V25 — menu iOS, eliminazione a scomparsa e scheda Campo LIVE

- Richiesta: tutti i menu a tendina mobile devono tornare utilizzabili su Safari/iOS.
- Il primo intervento ha rimosso l'intercettazione touch/pointer dai `select` per lasciarli al percorso
  nativo del browser. Le prove successive dell'utente su iPhone hanno però mostrato che il problema
  persisteva: non considerare quindi quella diagnosi come causa definitivamente dimostrata.
- Nell’elenco Campi il comando elimina non è più sempre visibile: compare trascinando la scheda verso
  sinistra, in stile Mail, e mantiene la conferma prima della cancellazione.
- La scheda del singolo campo resta invariata nei dati e nelle azioni, ma l’anteprima SVG statica è
  sostituita dalla mappa satellitare LIVE, navigabile con pan, pinch-zoom e rotazione gestuale.
- Il riquadro mappa della scheda non espone pulsanti, toolbar o strumenti di modifica. Per modificare
  il progetto si entra nell’editor oppure si torna alla Home Mappa.
- Modifiche confinate a `src/mobile-ui.js`, `mobile.css`, cache/versione e test mobile; `styles.css`,
  calcoli, geometrie e comportamento desktop restano invariati.

### V26 — fix numerati 1–13 e adattatore controlli mobile

Richieste ricevute tramite quindici screenshot, tutte limitate alla versione mobile:

1. rendere la selezione del dock conforme alla curvatura del contenitore e aumentare la trasparenza;
2. evidenziare con immediatezza il numero di barbatelle nel calcolatore rapido;
3. presentare Satellite, Stradale e Catasto come tre comandi equidistanti e coerenti;
4. mantenere sempre visibile sopra la tastiera il campo testo/numerico in modifica;
5. spostare il Nome campo sopra l'anteprima LIVE, avvicinando mappa e orientamento filari;
6. correggere tutti i menu a tendina bloccati, problema indicato come grave;
7. rendere attivabile la checkbox `Vendemmia meccanica prevista`;
8. correggere in particolare Vitigno, Clone/selezione e Portainnesto (stesso problema del punto 6);
9. rendere LIVE la mappa anche nella prima configurazione successiva alla chiusura del perimetro;
10. secondo esempio del problema tastiera del punto 4;
11. sostituire la freccia Nord con la vera bussola MapLibre live, circolare e nella colonna strumenti;
12. schiarire il perimetro del campo, mantenendolo meno evidente dei filari;
13. usare l'ultima icona trasparente approvata per WebApp, favicon e installazione iOS.

Diagnosi e soluzione:

- Il blocco dei menu nativi non è stato riprodotto in modo attendibile nell'ambiente desktop e non è
  stato attribuito senza prova a una singola causa Safari. V26 introduce invece un selettore mobile
  controllato dall'app: legge le opzioni reali, aggiorna il `select` originale e invia gli eventi
  `input` e `change`. Il desktop conserva i controlli HTML originali e i relativi listener.
- La vendemmia meccanica usa un toggle mobile collegato al checkbox originale e alle stesse regole,
  compresa la normalizzazione della capezzagna.
- `visualViewport` aggiorna altezza e offset della shell e scorre il contenitore necessario per tenere
  l'input attivo sopra la tastiera; la chiusura ripristina lo stato normale.
- L'anteprima parametri usa la medesima istanza MapLibre LIVE anche al primo inserimento, forzata sul
  Satellite, navigabile e priva dei comandi cartografici. Toccare il campo nell'anteprima non cambia
  schermata: per modificare il perimetro si usa il comando dedicato.
- La bussola non è un'imitazione: viene trasferito lo stesso nodo creato da MapLibre, quindi rotazione
  live, handler e ripristino Nord restano quelli della libreria. Uscendo dal mobile torna al suo posto.
- I perimetri mobile usano un tratto chiaro, sottile e semitrasparente. All'uscita dal mobile vengono
  ripristinati esattamente i valori di stile precedenti.
- Il nuovo file icona conserva i pixel RGBA dell'immagine trasparente approvata. Per Apple Touch Icon
  è stata prodotta una variante 180×180 su fondo verde, perché iOS non conserva la trasparenza delle
  icone Home e può altrimenti generare un alone bianco. I nomi file V26 evitano la cache precedente.
- È stato corretto anche un difetto riproducibile: trascinare un pulsante mobile poteva attivarlo come
  un tocco; oltre 10 px di movimento il gesto non genera più il click di fallback.

Vincoli rispettati:

- `styles.css` desktop resta byte-identico alla base approvata (SHA-256
  `a6ecdd2c230c382f8a3351f5755d93d7244719b6ad4a00f43acabbc7acaeee90`).
- Nessuna modifica a `src/map.js`, geometria, calcolo filari, barbatelle o pali.
- Il badge desktop resta V25 intenzionalmente; il badge interno alla shell mobile mostra V26.
- I filari curvi, pendenze e modello 3D del terreno restano una roadmap successiva, non parte di V26.

### V27 — navigazione durante l'editing e ritorno dalle esclusioni

Segnalazioni dopo la prova della V26:

- nell'editor perimetro funzionava lo zoom, ma la porzione satellitare restava fissa e non si poteva
  navigare in tutte le direzioni;
- la checkbox della vendemmia meccanizzata risultava visivamente troppo grande;
- percorso riproducibile bloccante: creare campo → creare area esclusa → aprire Modifica esclusione;
  a quel punto non era possibile spostare la mappa né tornare indietro correttamente.

Cause verificate:

- `src/map.js` disabilitava esplicitamente `dragPan` sia nel disegno manuale sia durante la modifica
  dei vertici; lo zoom rimaneva invece disponibile;
- il pulsante `Modifica` dell'esclusione richiamava ancora il vecchio fullscreen responsive, che
  spostava fisicamente la mappa fuori dalla shell WebApp V26 e separava la mappa dai comandi mobile.

Correzioni V27:

- aggiunta l'opzione cartografica `allowPanWhileEditing`, attiva esclusivamente sul layout mobile;
  durante perimetro ed esclusioni il trascinamento dello sfondo muove la mappa, mentre le maniglie
  trascinabili continuano a modificare i punti;
- la shell WebApp attiva rifiuta il vecchio percorso fullscreen e mantiene la mappa nell'editor con
  `Annulla` in alto e `Fine modifica` in basso;
- checkbox visuale portata a 28×28 px dentro un target touch invariato di 44×44 px;
- desktop preservato: il pan resta bloccato durante il disegno come nelle release precedenti.

### V28 — comando unico nelle mappe LIVE e denominazione automatica

Richieste:

1. nelle mappe LIVE di `Imposta l’impianto`, sia in creazione sia in modifica, lasciare come unico
   pulsante quello che riporta al punto in cui si trova l'impianto;
2. correggere la checkbox della vendemmia meccanizzata, risultata troppo piccola e rettangolare;
3. rinominare automaticamente i campi ancora denominati `Campo 1`, `Campo 2`, ecc. usando Varietà e
   Portainnesto, senza sovrascrivere un nome impostato dall'utente.

Implementazione:

- il pulsante esistente `center-field-button` viene trasferito nel riquadro LIVE dei parametri; tutti
  gli altri controlli MapLibre/editor restano nascosti. Uscendo dalla schermata il medesimo nodo torna
  nella colonna strumenti, senza duplicare listener o logica cartografica;
- la checkbox conserva un target touch di 44×44 px, ma mostra un quadrato interno 34×34 px con
  rapporto 1:1 esplicito;
- ogni campo conserva `labelCustomized`. I dati precedenti vengono migrati senza intervento utente:
  un nome nel formato `Campo N` è considerato automatico, qualsiasi altro nome precedente è protetto;
- finché il nome è automatico, le selezioni producono `Varietà · Portainnesto`; con una sola selezione
  viene usato il valore disponibile e cancellando entrambe si ripristina `Campo N`;
- il primo evento di modifica manuale del Nome campo imposta `labelCustomized=true` e impedisce ogni
  successiva sovrascrittura automatica.

### V29 — correzioni esclusivamente visive

Screenshot iPhone hanno evidenziato:

- simbolo del pulsante `Torna al campo` non perfettamente centrato;
- checkbox vendemmia meccanizzata vuota e selezionata in due posizioni differenti.

Cause e correzioni:

- il ricentraggio usava il carattere tipografico `⌖`, la cui metrica varia con il font di sistema;
  è stato sostituito con un SVG 24×24 centrato tramite griglia nel pulsante 44×44;
- lo stato selezionato della checkbox generava sia il segno in `::before` sia un secondo `::after`.
  Il secondo elemento partecipava al layout flex e spostava il quadrato. V29 usa sempre un solo
  elemento 34×34 e cambia esclusivamente contenuto e colore nello stato selezionato;
- nessuna logica applicativa è stata modificata.

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
- `src/mobile-controls.js`: selettori/checkbox mobile e gestione della tastiera tramite Visual Viewport.
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

## Stato di verifica e limitazioni alla V29

- Test unitari/DOM automatizzati: **269 superati**, vedere `README.md` e `V29-VERIFICA.md`.
- Test nativo Safari iPhone: verificare visivamente centratura del ricentraggio e posizione identica
  della checkbox nei due stati.
- Il browser remoto non può raggiungere il server locale del workspace; una verifica DOM automatizzata
  non sostituisce la prova tattile su dispositivo.
- L'archivio `Progetti` è locale al browser/dispositivo. La sincronizzazione cloud esistente resta
  utilizzata dalle azioni finali, ma non è stata estesa a un nuovo elenco account nella V19.

## Studio successivo alla V29 — archivio cloud e storico

Decisioni approvate il 21 settembre 2026, senza nuova release:

- la WebApp dovrà conservare centralmente progetti Guest, utenti registrati e Admin;
- una bozza cloud nasce alla conferma del primo perimetro valido;
- le modifiche significative aggiornano automaticamente lo stato corrente;
- il comando esplicito `Salva` crea una revisione storica permanente;
- la copia locale resta come protezione offline e viene sincronizzata quando torna la rete;
- Vivai Obice dispone di accesso amministrativo a tutti i progetti e di un registro per anno/campagna;
- la voce `Profilo`, il login pubblico e i piani PRO saranno fasi successive;
- i vecchi progetti FieldArea Measure verranno migrati una tantum da Vivai Obice, preferibilmente da
  GeoJSON, senza un importatore pubblico nella prima fase;
- l'importazione autonoma potrà diventare successivamente una funzione PRO;
- nessuna modifica funzionale o grafica è autorizzata finché la specifica e il piano non saranno
  approvati.

Specifica tecnica: `docs/superpowers/specs/2026-09-21-cloud-archive-history-design.md`.

La specifica è stata approvata dall'utente. Il piano TDD della Fase A è stato preparato in
`docs/superpowers/plans/2026-09-21-cloud-archive-history.md`. Il piano impone quattro checkpoint,
Ambiente TEST esclusivo e uno stop esplicito prima di qualunque incremento release o ZIP.

## Esecuzione Fase A — 21 settembre 2026

- Implementati snapshot cloud v2, schema additivo, RLS, RPC idempotenti e versionamento ottimistico.
- Guest, utenti permanenti e Admin sono classificati da claim protetti; nessun ruolo è ricavato da
  `user_metadata` modificabile.
- Implementata coda IndexedDB: un errore ambiguo conserva la stessa operation ID; i conflitti non
  sovrascrivono lo stato server.
- Il primo perimetro valido abilita il draft cloud; Salva crea una revisione immutabile.
- Migrazione locale V29 non distruttiva: envelope v1 letti, v2 scritti, progetti incompleti preservati.
- Admin esteso con campagna, origine, tipo proprietario, eliminati, KPI e ripristino tramite RPC.
- Preparato import FieldArea GeoJSON una tantum con validazione e fingerprint SHA-256; nessuna UI
  pubblica e nessuna importazione reale.
- Desktop e mobile non hanno ricevuto modifiche grafiche durante l'implementazione della Fase A.
- Gate locale finale: test e syntax check registrati in `FASE-A-VERIFICA.md`.
- Blocco deliberato: migrazione remota TEST, sonde RLS reali e prove Safari richiedono ambiente e
  autorizzazione operativa; LIVE non deve essere toccato.

## Collaudo remoto Fase A — 21 settembre 2026

- Applicate al solo progetto Supabase TEST le migrazioni archivio cloud e i follow-up di sicurezza;
  LIVE non è stato modificato.
- Corretto un difetto emerso dalla prima sonda: i wrapper RPC pubblici non potevano attraversare lo
  schema privato. Soluzione finale: wrapper `SECURITY INVOKER`, `USAGE` ristretto e `EXECUTE`
  esplicito sulle sole implementazioni autorizzate.
- Corrette due policy profilo segnalate dall'advisor per il ricalcolo per-riga del JWT e aggiunto
  l'indice della foreign key `sync_operations.project_id`.
- Abilitato e verificato Supabase Anonymous Sign-In per il flusso Guest. La prova ha creato un utente
  anonimo reale tramite API pubblica; il record di collaudo è stato eliminato subito dopo.
- Sonde SQL con identità separate superate: owner vede 1/1/1, secondo Guest vede 0/0/0, Admin vede
  1/1/1 per progetti/campi/revisioni.
- Verificati retry idempotente, conflitto di versione, revisione manuale, soft delete e restore,
  ripristino Admin di una revisione e archiviazione di una bozza Guest inattiva da 91 giorni.
- Pulizia finale confermata: 0 progetti, 0 campi, 0 revisioni, 0 operazioni e 0 profili di test.
- Gate locale ripetuto dopo le migrazioni: `npm run check` superato; `npm test` 317/317.
- Restano prima della release: prova offline reale su desktop e Safari iPhone, poi approvazione
  esplicita per incremento versione/cache bust e ZIP.

## Fix salvataggio offline differito — 21 settembre 2026

- Il nuovo test di accettazione ha riprodotto Save senza rete seguito da riavvio e ritorno online.
- RED verificato: la coda conteneva soltanto `autosave`; l'intenzione esplicita di creare la revisione
  manuale veniva persa quando il flush iniziale falliva.
- Correzione: Save conserva una `manual_revision` differita dietro l'autosalvataggio; project ID e
  versione vengono risolti soltanto dopo l'ack dell'operazione precedente.
- Il test simula anche il caso ambiguo più critico: il server ha già eseguito il commit, ma la risposta
  di rete si perde. Il retry riutilizza la stessa operation ID e produce un solo progetto e una sola
  revisione, anche dopo la ricreazione del coordinatore.
- GREEN verificato: test mirato 6/6; suite completa `npm test` 318/318; `npm run check` superato.
- Nessuna modifica grafica mobile/desktop nel fix offline.
- Resta distinta la prova visiva/tattile reale su desktop e Safari iPhone; non viene dichiarata come
  eseguita da un test Node.

## V30 — pubblicazione della Fase A in Ambiente TEST

- Approvazione esplicita ricevuta per incremento release, cache bust e creazione ZIP.
- Badge mobile e fallback desktop allineati a `AMBIENTE TEST · V30`; manifest, `mobile.css`, entrypoint
  `app.js` e import di `mobile-ui.js` hanno cache bust V30.
- Il foglio desktop `styles.css` resta invariato e mantiene il cache bust V18.
- Incluse le quattro migrazioni Supabase già applicate e collaudate sul solo progetto TEST.
- Gate obbligatorio: `npm run check`, suite completa 318/318 e controllo contenuto archivio.
- LIVE non è stato modificato. La verifica visiva/tattile su Safari iPhone resta da eseguire sulla V30.

## V31 — Profilo e autenticazione in Ambiente TEST

- Aggiunta la quarta voce `Profilo` alla navigazione mobile e il comando `Login` in alto a destra sul
  desktop. Dopo l'accesso il comando mostra il nome profilo e apre Profilo / Esci / Amministrazione.
- Identificatore di accesso: e-mail oppure username. Lo username può essere numerico e resta testo,
  quindi `000123` non viene trasformato in `123`; nessun flusso SMS o telefono è stato introdotto.
- Registrazione Guest nello stesso UID; login verso un account esistente con grant temporaneo di 15
  minuti, conservato soltanto come hash nel database e consumabile una sola volta.
- Prima del cambio identità la coda cloud viene sospesa; dopo trasferimento riuscito l'app ricarica lo
  stato. Un esito di rete ambiguo conserva il grant e ripete in modo idempotente il consumo.
- Ruolo Admin derivato esclusivamente da `app_metadata.role`, mai da metadati modificabili dall'utente.
- Edge Function `login-by-identifier` con risoluzione privata username→e-mail, rate limit e messaggio
  generico. Nessun segreto viene incluso nel client o nello ZIP.
- Migrazioni `202609210005_v31_profile_auth.sql` e
  `202609210006_v31_profile_auth_advisor_fixes.sql` applicate al solo progetto TEST; Edge Function
  attiva con verifica JWT. LIVE non toccato.
- Sonda transazionale TEST superata: 1 progetto trasferito, username `000123` conservato, grant
  consumato una sola volta anche al retry. Record di prova eliminato; transazione dati annullata.
- Gate locale: `npm test` 353/353 e `npm run check` superati. Test visivo/tattile reale su Safari
  iPhone ancora necessario.

## V32 — hotfix cache autenticazione

- Collaudo reale V31: registrazione mobile ricaricava la Home ma lasciava Profilo nello stato Guest;
  login e registrazione desktop mostravano `projectSync?.suspend is not a function`.
- Root cause verificata: `app.js?v=31` importava `project-sync.js` senza query di versione. Il browser
  poteva quindi eseguire il vecchio modulo V30, privo del metodo `suspend` aggiunto dalla V31.
- La registrazione si arrestava nel hook `beforeIdentityChange`, prima di aggiornare l'utente: le
  credenziali provate su mobile non risultano quindi necessariamente create e vanno registrate di nuovo.
- Fix minimo: import `project-sync.js?v=32`; aggiornati shell, badge e cache bust della release.
- Test di regressione eseguito prima in RED e poi in GREEN; suite completa `354/354` e syntax check
  superati. Nessuna modifica al backend, al database, ai calcoli o al desktop V18.

## V33 — promozione Guest server-side

- Secondo collaudo reale: registrazione mobile tornava alla Home ancora come Guest; login con username
  mostrava il messaggio opaco `Edge Function returned a non-2xx status code`.
- Verifica diretta del database: `vivaiobice` era un profilo Guest con password hash presente, ma
  `email` nulla, e-mail ferma in `email_change` e `is_anonymous=true`.
- Root cause: per convertire un Guest Supabase occorre verificare prima l'e-mail e solo dopo impostare
  la password; la V31/V32 tentava entrambe con una sola `updateUser()`.
- Nuova Edge Function `promote-guest-account`, protetta da JWT e rate limit: autentica il Guest,
  controlla e riserva lo username, promuove lo stesso UID con e-mail confermata e password, aggiorna
  il profilo e restituisce la sessione permanente.
- Il client ora estrae il JSON degli errori Edge, quindi mostra messaggi come `Username già utilizzato`
  invece della stringa generica dell'SDK.
- Prova end-to-end sul TEST: promozione HTTP 200, login tramite username HTTP 200, UID Guest/account/login
  identico; utente temporaneo eliminato (`remaining=0`). Edge Function ACTIVE, LIVE non modificato.
- Gate locale: suite `356/356`, syntax check superato; cache bust V33 su `backend.js`,
  `auth-service.js` e `project-sync.js`.

## V33 hotfix — recupero sicuro della registrazione interrotta

- Il collaudo utente successivo alla V33 continuava a non creare l'account su mobile e desktop.
- Diagnosi sul TEST: il primo tentativo V31/V32 aveva già prenotato username `vivaiobice`, impostato
  `email_change` e password hash, ma l'utente era ancora anonimo e senza identità; possedeva inoltre
  1 progetto e 2 campi. I nuovi tentativi venivano quindi respinti come conflitto username.
- Non è stato cancellato alcun dato reale. La migrazione
  `202609220001_v34_pending_registration_recovery.sql` introduce una verifica service-role-only di
  username, e-mail e password dell'account parziale e un grant monouso per l'eventuale Guest corrente.
- `promote-guest-account` V2 recupera l'UID originale, completa la promozione e trasferisce gli
  eventuali progetti del Guest corrente. Password hash e controlli restano esclusivamente server-side.
- TDD: aggiunto test di regressione per la scelta sicura dell'UID; RED osservato per funzione assente,
  poi GREEN. Suite completa `357/357` e syntax check superati.
- Collaudo end-to-end TEST: account parziale simulato, recupero HTTP 200 da un secondo Guest, login
  username HTTP 200, UID originale preservato, progetto trasferito e classificato `owner_kind=user`.
  Utenti e progetto tecnici eliminati (`users_remaining=0`, `projects_remaining=0`).
- Edge Function e migrazione applicate esclusivamente al progetto TEST. LIVE non modificato.

## V34 — sincronizzazione account tra dispositivi

- Segnalazione reale: login Admin riuscito su iPhone e Mac, ma campi e progetti salvati non comparivano
  sull'altro dispositivo.
- Diagnosi: il backend conteneva i dati, mentre il client implementava soltanto il push/autosalvataggio
  e il recupero tramite link segreto; mancava la lettura dell'archivio del proprietario dopo login.
- Secondo difetto collegato: `loadMobileProject()` azzerava `state.cloud`; inoltre
  `writeLocalProject()` non archiviava metadati cloud. Riaprire e salvare poteva quindi generare un
  nuovo record anziché aggiornare quello esistente.
- Correzione: query `listOwnedProjects()` filtrata sempre per `owner_user_id`, ambiente TEST e
  `deleted_at is null`; anche l'Admin importa nella propria sezione personale soltanto i propri record.
- I payload cloud vengono convertiti in elementi locali con `client_project_id`, `projectId`, versione
  e revisione. Il merge sostituisce la copia con lo stesso ID ma conserva ogni bozza soltanto locale.
- Su dispositivo senza disegni viene aperto il progetto cloud più recente. Un progetto locale con
  geometria non viene mai sovrascritto automaticamente.
- Selezione progetto e nuovo progetto riallineano sia il servizio cloud sia il coordinatore di sync;
  il salvataggio locale avviene dopo l'ack/retry e conserva la versione server aggiornata.
- Verifica diretta TEST al 22/09/2026: account Admin con 3 progetti attivi, versioni 23/6/5 e 11 campi
  complessivi. I dati erano integri; non è stata eseguita alcuna mutazione del database.
- TDD: 9 test inizialmente RED per mapping, query proprietario, merge, selezione e versione; poi GREEN.
  Gate completo: `366/366`, `npm run check` superato.
- Cache bust e badge portati a V34. Nessuna modifica a editor, calcoli, geometria o `styles.css` V18.
  Supabase LIVE non modificato.
- Collaudo richiesto dopo pubblicazione: aprire V34 su un dispositivo senza cache, fare login Admin,
  verificare 3 progetti in Progetti e 11 campi complessivi; aprire un progetto, modificarne solo il
  nome o un parametro, salvare e confermare sull'altro dispositivo che non nasca un duplicato.

## V35 — refresh manuale, archivio desktop e correzioni Admin

- Richiesta mobile: aggiungere un aggiornamento manuale accanto al `+` sia in Campi sia in Progetti.
  Il comando usa lo stesso archivio proprietario della V34, esegue prima il flush della coda e poi
  aggiorna la copia locale; non elimina le bozze presenti soltanto sul dispositivo.
- Decisione UX: la sezione Amministrazione resta desktop-only. Il collegamento non viene più mostrato
  nella scheda Profilo mobile anche quando l’utente ha ruolo Admin.
- Richiesta desktop differita dalla V34: aggiunti Campi e Progetti nella barra principale. Sono pannelli
  isolati in `desktop-library-ui.js` e `desktop-library.css`; l’editor esistente rimane montato e il
  foglio storico `styles.css` V18 non cambia.
- Diagnosi Admin: lo scroll era bloccato da `body{overflow:hidden}` ereditato dal configuratore; la
  mappa usava ancora OpenStreetMap e `projectsToFeatureCollection()` ignorava `field_plans`, mostrando
  soltanto i vecchi progetti dotati di `project.geometry`.
- Correzione Admin: override locale dello scroll, Esri World Imagery, una feature per ogni campo
  salvato e fallback alla geometria legacy. La tabella mostra anche il numero dei campi.
- I KPI Progetti, Preventivi, Clienti, Guest e FieldArea applicano filtri navigabili. Utenti registrati
  apre l’elenco reale dei profili; scegliendo un profilo vengono mostrati i suoi progetti tramite
  `owner_user_id`. Aggiunto il ritorno esplicito al configuratore.
- Sicurezza/ambiente: nessuna migrazione, scrittura manuale sul database o modifica a Supabase LIVE.
  Tutta la release resta `AMBIENTE TEST`.
- TDD: test RED iniziali per refresh, archivio desktop, immagini satellitari, scroll, profili e
  geometrie multi-campo; GREEN finale `373/373`. Syntax check superato.
- Cache bust portato a V35 per manifest, mobile CSS, entrypoint, mobile UI e nuovo foglio desktop.
- Collaudo reale consigliato: login Admin su iPhone e Mac, refresh in Campi/Progetti, apertura dello
  stesso progetto sui due dispositivi; su desktop verificare Campi/Progetti e Admin con mappa satellitare,
  selezione utente e ritorno al configuratore.

## V36 — riordino desktop, annata e feedback salvataggio

- Richiesta desktop: il pannello laterale deve iniziare con Nome campo e i comandi espliciti
  `Aggiungi campo` / `Elimina campo`; deve poi mostrare GPS/Trova terreno, sesto d’impianto e
  immediatamente sotto orientamento filari.
- Il Calcolo rapido desktop è stato tolto dalla barra laterale e spostato in un dialogo richiamabile
  dalla barra superiore. Il flusso mobile già esistente non è stato alterato.
- Aggiunta Annata impianto sia su desktop sia nella schermata mobile dei parametri. È un dato unico
  di progetto, memorizzato nell’esistente `campaignYear`, con intervallo ammesso 2000–2100 e anno
  corrente come valore iniziale per i progetti nuovi. Non serve alcuna migrazione database.
- Il pulsante Salva progetto desktop ora comunica lo stato: `Salvataggio…`,
  `✓ Progetto salvato` oppure errore. Una modifica ai dati lo riporta allo stato iniziale.
- Le aggiunte desktop sono isolate in `desktop-v36.css` e `desktop-ux.js`; `styles.css` storico,
  geometrie e formule non sono stati modificati.
- TDD: aggiunti contratti su ordine del pannello, etichette, validazione annata, dialogo calcolatore,
  stati di salvataggio e trasferimento del controllo condiviso nella schermata mobile. Gate finale
  `378/378`; `npm run check` e syntax check dei moduli modificati superati.
- Cache bust e badge portati a V36. Ambiente TEST; nessun intervento su Supabase LIVE.

## V37 — gestione archivio e riorganizzazione comandi mappa

- Richiesta: rendere l’elenco Progetti realmente gestibile con apertura, rinomina ed eliminazione;
  permettere inoltre di assegnare il nome del progetto direttamente nella schermata principale.
- La gestione è disponibile su desktop e mobile. `renameLocalProject()` conserva ID, snapshot e
  identità cloud; `removeLocalProject()` rimuove soltanto l’elemento richiesto.
- Per un progetto sincronizzato la rinomina usa `apply_project_operation` con versione attesa e la
  cancellazione usa `soft_delete_project`. Il locale viene mutato soltanto dopo la conferma cloud:
  in caso di rete assente, conflitto o errore il progetto resta intatto e l’utente riceve il messaggio.
- Aggiunto `Nome progetto` prima di Nome campo nel pannello desktop. Salva progetto continua a usare
  `localProjectName`, quindi non è stato introdotto un secondo stato o un secondo archivio.
- I controlli della mappa desktop sono stati distinti senza sostituire i relativi handler: gruppo
  visualizzazione in alto; editor sul lato sinistro; esclusioni e posizionamento in gruppi separati
  sul lato destro; rotazione in basso a destra vicino a zoom e bussola.
- Precisazione utente: `Catasto` è il pulsante principale e `Trova particella` il suo sottomenù.
  Disattivando Catasto il sottomenù si chiude e il comando particella torna disabilitato.
- Il CTA compatto `Aggiungi campo` è centrato in basso. Se il campo corrente è vuoto lo riusa; se è
  già disegnato crea il campo successivo. Durante il perimetro diventa `Chiudi perimetro` e usa
  `finishDraw()` esistente; durante esclusioni/passaggi è disabilitato per evitare conflitti.
- Mobile: nessuna modifica a editor o mappa; è stata aggiunta soltanto la gestione rinomina/elimina
  nelle card Progetti. `styles.css` storico resta invariato; il layout desktop è isolato in
  `desktop-v37.css`.
- TDD: RED osservato per funzioni archivio, azioni UI, gruppi mappa, CTA, sottomenù Catasto e ordine
  cloud→locale; GREEN finale `388/388`. `npm run check` superato.
- Cache bust e badge portati a V37. Nessuna migrazione e nessuna modifica a Supabase LIVE.

## V38 — compattazione strumenti e selezione campi desktop

- Richiesta: conservare invariato il gruppo Tipo di mappa e riunire gli altri strumenti sul lato
  destro in tre gruppi, nell'ordine Editor mappa, Posizionamento, Gestione aree escluse.
- Realizzata una rail compatta a icone: i pulsanti partono larghi 44 px e si espandono verso sinistra
  mostrando il nome della funzione al passaggio del mouse o al focus da tastiera.
- Corretto il conflitto visivo tra rotazioni e controlli MapLibre: rotazioni orizzontali in basso,
  zoom e bussola nel gruppo verticale affiancato sulla destra.
- Aggiunta una lente sulla mappa che porta il focus alla ricerca località esistente, senza introdurre
  un secondo motore di ricerca.
- `Campo attivo` rinominato `Campi disponibili`; aggiunto un selettore gemello in alto al centro della
  mappa. Entrambi usano lo stesso controller, cambiano il campo una sola volta e lo inquadrano.
- L'annata è mostrata nelle opzioni avanzate desktop tramite un controllo sincronizzato; l'input
  originale resta nella posizione già approvata per il percorso mobile.
- Riordinata soltanto via CSS desktop la sezione avanzata: capezzagna/pali, vendemmia e avviso,
  materiale vegetale, Inquadramento dell'impianto, note, annata. In mobile resta l'ordine precedente.
- `Aree escluse` rinominato `Gestione aree escluse`, mantenendo la card e gli handler esistenti.
- Il Calcolo rapido usa ora propri input per superficie, distanza piante e distanza filari. Questi
  valori non leggono e non scrivono il sesto del campo selezionato; la formula resta
  `superficie / (distanza piante × distanza filari)` con quantità commerciale arrotondata a 25.
- TDD: RED osservato per controller, markup, contratto CSS e versione shell; GREEN finale `397/397`.
  `npm run check` superato. Nessuna modifica a formule, geometrie, schema database o Supabase LIVE.

## V41 — filari curvi multipunto e documento cliente

- Orientamento filari impostabile manualmente a decimi di grado, mantenendo cursore e scelte rapide.
- Punti di curvatura multipli salvati per campo; un punto produce un arco, offset alternati permettono
  una S. I punti sono trascinabili sulla mappa e regolabili/rimovibili dai controlli.
- Calcolo viticolo aggiornato sulle lunghezze reali delle polilinee curve, inclusi tagli per esclusioni,
  barbatelle e pali. Senza punti di curvatura viene richiamato il motore rettilineo storico.
- Curve propagate a mappa, anteprime, link condiviso e documento; il renderer SVG usa l’intera
  polilinea. L’orientamento nel documento conserva un decimale.
- Completato il documento intestato Vivai Obice con selezione campi, destinatario precompilato,
  immagini satellite, schema tecnico, dati, QR a revisione, disclaimer e stampa/PDF dal browser.
- Condivisione Guest in sola lettura; modifica consentita soltanto dopo autorizzazione server-side a
  proprietario permanente o Admin. Migrazioni report applicate esclusivamente all’ambiente TEST.
- Placeholder della richiesta materiale reso generico, senza combinazioni tratte da comunicazioni.
- TDD finale: `480/480`; controllo sintattico e verifica del pacchetto eseguiti prima della consegna.

## V40 — correzioni visuali raccolte dopo V39

- Richiesta: non avviare ancora il documento cliente; stabilizzare prima i fix visuali raccolti.
- Mobile: la nuova struttura interna icona/etichetta dei comandi desktop aveva alterato GPS e Vai al
  campo. Ripristinata una resa mobile dedicata, con GPS centrato e ricentraggio a sola icona.
- Desktop: il perimetro verde si perdeva sul satellite. Il layer attivo usa ora colore `#f5f6ed`,
  larghezza `1.1` e opacità `0.62`, quindi resta più discreto dei filari.
- Rimossi i numeri decorativi `01` e `02`, ritenuti ormai superflui nella nuova struttura laterale.
- Quantità: la card principale mostra in grande la quantità commerciale e in piccolo le barbatelle
  calcolate. Applicata la stessa gerarchia alle schede mobile senza modificare alcuna formula.
- TDD: 6 test V40 osservati RED e poi GREEN. Gate completo `411/411`; nessuna migrazione database e
  nessuna modifica a Supabase LIVE.
- Passo successivo concordato, fuori dalla V40: progettazione del documento cliente stampabile,
  salvabile in PDF e condivisibile tramite link controllato.

## Documento preliminare stampabile — confluito nella V41 TEST

- Specifica approvata il 24 settembre 2026: un campo, selezione multipla o intero progetto;
  carta intestata VIVAI OBICE S.S.A., mappe satellite e schema tecnico, QR a revisione datata,
  destinatario precompilato modificabile soltanto nel documento, disclaimer con accettazione.
- Guest consulta il link ma non modifica. Il controllo di modifica richiede account permanente
  proprietario o Admin e viene imposto dalla RPC, non soltanto dal pulsante della pagina.
- Non sono stati modificati calcoli, formule, geometrie o funzionamento dell'editor approvato.
  Il pulsante di stampa apre una nuova pagina e crea la revisione al momento della generazione
  dopo l'accettazione, non all'apertura del preflight.
- Realizzati modello multi-campo, proiezione comune per satellitare e overlay, cattura MapLibre isolata,
  QR locale vendorizzato, preflight, schema SQL, pagina condivisa, renderer A4 e test di contratto.
- Gate locale aggiornato il 24/09/2026: `npm test` 463/463, `npm run check` e parsing del QR locale
  superati. Tre migrazioni applicate solo a Supabase TEST: struttura report/audit, rimozione della
  policy di lettura diretta e correzione della RPC pubblica per il ruolo `anon`. Verificato con SQL
  nel ruolo `anon`: token inesistente → risposta nulla; lettura diretta della tabella → negata.
  L'advisor non segnala nuove vulnerabilità ERROR; la tabella report senza policy dà una nota INFO.
  Prove reali Guest/proprietario/Admin, Safari iPhone, stampa PDF A4 e scansione QR restano incluse
  nel collaudo manuale V41. Non si è passati a Supabase LIVE.

## V42 — equidistanza, trackpad, documento e ID progetto

- Pan desktop attivato sullo scroll pixel del trackpad, preservando pinch zoom e rotazione tramite
  modificatore.
- Aggiunta preferenza per campo `maintainRowEquidistance`, attiva di default: i filari curvi sono
  generati come offset normali della curva guida e i tratti localmente invertiti vengono scartati.
- Documento: overlay satellitare senza riempimento, filigrana su ogni pagina, URL esteso rimosso e
  distinzione esplicita fra QR della revisione e ID dell’ultima versione.
- Codici progetto migrati al formato casuale `VO-` + 7 cifre. Aggiunta ricerca Guest sanificata,
  neutra sugli errori e limitata a 12 tentativi ogni 10 minuti.
- `Carica progetto` disponibile sia nel desktop sia nel Profilo mobile; Guest in sola lettura,
  modifica riservata al proprietario o Admin verificato lato server.
- Migrazione applicata esclusivamente a Supabase TEST. Verifica SQL: 3 progetti, 3 codici distinti,
  nessun codice malformato, nessun accesso Guest diretto alle tabelle.
- Gate automatico V42: `495/495` test e controllo sintattico completati.

## V39 — rifinitura visuale desktop

- Ambito approvato: modifiche visuali desktop; nessuna variazione a calcoli, formule, geometrie,
  persistenza o funzionamento mobile.
- Difformità segnalate e corrette:
  - selettori Vitigno, Clone/selezione e Portainnesto non omogenei;
  - testo Vendemmia meccanica prevista troppo grande rispetto alla barra laterale;
  - nomi degli strumenti visibili anche nello stato compatto;
  - titolo Campo selezionato superfluo sopra il selettore della mappa;
  - Affina il progetto privo di card distinte per tipologia;
  - ricerca località mescolata al gruppo Posizionamento.
- La toolbar usa elementi separati `.tool-icon` e `.tool-label`. Le etichette hanno larghezza e
  opacità zero nello stato normale e si espandono soltanto sul singolo pulsante in hover/focus.
- Aggiunto `setToolButtonLabel()` per aggiornare i nomi dinamici senza rimuovere gli elementi necessari
  all'animazione. Coperti i cambi di stato Modifica punti e Chiudi perimetro/esclusione/passaggio.
- La lente è un controllo isolato in alto a destra. I gruppi nella rail restano Editor,
  Posizionamento e Gestione aree escluse.
- Il selettore campo centrale contiene soltanto il menu; sincronizzazione e inquadramento restano quelli
  approvati nella V38.
- Affina il progetto contiene tre card: Caratteristiche dell'impianto; Materiale vegetale;
  Informazioni. L'ordine della card Informazioni è Annata, Inquadramento dell'impianto, Riferimento/note.
- Gli override sono isolati in `desktop-v39.css`. Nel breakpoint mobile le card vengono appiattite e
  l'ordine precedente dei controlli viene preservato.
- TDD: 8 test specifici V39 scritti e osservati RED sulla V38; GREEN finale della suite `405/405`.
  Nessuna migrazione e nessun intervento su Supabase LIVE.
