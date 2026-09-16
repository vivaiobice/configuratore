# Vivai Obice — Configuratore

Web app autonoma per la progettazione preliminare di impianti viticoli.

Stato: ambiente TEST · release V17.

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
