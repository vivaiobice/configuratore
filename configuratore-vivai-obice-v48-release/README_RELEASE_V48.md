# Configuratore Vivai Obice — V48

## Correzioni incluse

- **Carica progetto** è nella barra superiore desktop, sulla stessa riga di Campi, Progetti e Calcolo rapido; non occupa più una riga della mappa e non ne riduce l’altezza.
- Il salvataggio storico e la sincronizzazione a revisioni condividono ora lo stesso identificativo stabile, evitando che codice pubblico e progetto aggiornato finiscano su record differenti.
- Il codice `VO-5195947` è stato ricondotto alla revisione server aggiornata: la ricerca restituisce due campi.
- L’apertura tramite ID legge ogni volta l’ultima revisione disponibile dal server e genera anteprima e stampa con lo stesso modello A4 usato dalla prima generazione PDF.
- La struttura mobile e le formule di calcolo restano invariate.

## Pubblicazione

Caricare nella radice del repository, mantenendo le cartelle:

- `index.html`
- `shared-project.html`
- `report-preview.css`
- `v48-fixes.css`
- `src/app.js`
- `src/backend.js`
- `src/cloud.js`
- `src/shared-project.js`
- `src/shared-project-entry.js`

Le migrazioni `202609240007`, `202609240008` e `202609240009` sono incluse per tracciabilità. Le correzioni database necessarie sono già state applicate al progetto Supabase TEST.

## Verifica consigliata

1. Aggiornare la pagina forzando il ricaricamento della cache.
2. Controllare che **Carica progetto** sia nella barra superiore e che la mappa mantenga tutta la sua altezza.
3. Cercare `VO-5195947` e verificare che frontespizio e riepilogo indichino due campi.
4. Controllare entrambe le pagine campo nell’anteprima.
5. Dopo il login, stampare o salvare il PDF e verificare che impaginazione e contenuti coincidano con l’anteprima.
