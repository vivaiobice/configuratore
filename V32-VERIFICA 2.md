# V32 — Rapporto di verifica hotfix profilo

Data: 22 settembre 2026  
Ambiente: TEST  
LIVE: non modificato

## Difetto riprodotto

La V31 caricava `app.js?v=31`, ma questo importava `project-sync.js` senza cache bust. Un browser che
aveva già visitato la V30 poteva riutilizzare il vecchio modulo, nel quale `suspend()` non esisteva.
Il hook eseguito prima di registrazione e login terminava quindi con:

`projectSync?.suspend is not a function`

## Correzione

- Import aggiornato a `project-sync.js?v=32`.
- Entry point, shell mobile, manifest e badge aggiornati a V32.
- Aggiunto test automatico specifico per impedire la regressione.
- Nessuna modifica a schema Supabase, Edge Function, editor, calcoli o `styles.css` desktop.

## Gate

- Test mirati autenticazione/sincronizzazione/release: 48/48.
- Suite completa: 354/354.
- Controllo sintassi JavaScript: superato.
- Test di regressione osservato prima in RED e poi in GREEN.
