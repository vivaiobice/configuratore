# V30 — Rapporto di verifica

Data: 21 settembre 2026  
Ambiente: TEST  
Ambito: pubblicazione Fase A archivio cloud e storico

## Contenuto

- Archivio cloud normalizzato per Guest, utenti e Admin.
- Revisioni immutabili create dal comando esplicito `Salva`.
- Autosalvataggio con coda IndexedDB, retry idempotente e conflitti ottimistici.
- Recupero progetti eliminati e ripristino revisioni tramite RPC protette.
- Preparazione migrazione una tantum FieldArea GeoJSON, senza UI pubblica.
- Migrazione locale V29 non distruttiva.

## Vincoli rispettati

- Il progetto Supabase LIVE non è stato toccato.
- `styles.css` e il relativo cache bust V18 sono invariati.
- Nessuna modifica grafica o funzionale al desktop.
- Badge, manifest e asset mobili/app aggiornati a V30 per evitare cache obsolete.

## Gate

- `npm run check`: superato, nessun errore sintattico in `src/` e `admin/`.
- `npm test`: 318/318 superati, 0 falliti.
- Archivio ZIP: deve escludere `node_modules`, contenere `PROMPT_JOURNAL.md` e mantenere meno di 100
  elementi alla radice.
- Safari iPhone reale: ancora da verificare; i test Node non sostituiscono il collaudo tattile.
