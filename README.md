# Vivai Obice — Configuratore

Web app autonoma per la progettazione preliminare di impianti viticoli.

Stato: ambiente TEST · release V19 WebApp.

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
223 test automatici verificati, compresi flusso mobile a schermate, archivio progetti,
navigazione sul DOM, ripristino desktop e calcolo dei tagli.
Il browser remoto di verifica non raggiunge la copia locale: resa visiva, gesti e rotazione vanno ancora verificati su Safari iPhone reale.

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
