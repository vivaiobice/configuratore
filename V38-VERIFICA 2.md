# V38 — verifica release desktop

Data: 23 settembre 2026  
Ambiente: TEST

## Modifiche verificate

- Barra laterale destra compatta con gruppi Editor mappa, Posizionamento e Gestione aree escluse.
- Tipo di mappa invariato.
- Etichette dei comandi espandibili da icona tramite hover/focus.
- Lente mappa collegata alla ricerca località esistente.
- Rotazioni in basso affiancate al controllo verticale zoom/bussola.
- Selettori Campi disponibili sincronizzati nella barra laterale e sopra la mappa.
- Caricamento e inquadramento del campo scelto da entrambi i selettori.
- Annata impianto nelle opzioni avanzate desktop, con controllo mobile originale preservato.
- Ordine richiesto per Affina il progetto e avviso meccanizzazione sotto la checkbox.
- Card rinominata Gestione aree escluse.
- Calcolo rapido con sesto indipendente dal progetto.

## Vincoli rispettati

- Nessuna modifica alle formule e ai conteggi.
- Nessuna modifica a geometrie, passaggi o aree escluse.
- Nessuna migrazione e nessuna modifica a Supabase LIVE.
- UI mobile protetta da breakpoint e verificata dalla suite completa.

## Gate automatici

- `npm test`: **397/397 PASS**.
- `npm run check`: **PASS**.
- Test specifici V38: **9/9 PASS**.
