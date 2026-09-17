# Vivai Obice — Configuratore

Web app autonoma per la progettazione preliminare di impianti viticoli.

Stato: ambiente TEST · release V18 WebApp.

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
216 test automatici verificati, compresi navigazione sul DOM, ripristino desktop e calcolo dei tagli.
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
