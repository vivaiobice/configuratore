# V36 — checklist di verifica

Ambiente previsto: **TEST**. La V36 non applica migrazioni e non modifica Supabase LIVE.

## Desktop

1. Verificare che la barra laterale inizi con **Nome campo**, **Aggiungi campo** ed
   **Elimina campo**.
2. Controllare l’ordine: GPS/Trova terreno, sesto d’impianto, orientamento filari.
3. Impostare **Annata impianto** con un valore tra 2000 e 2100.
4. Aprire **Calcolo rapido** dalla barra superiore, eseguire un calcolo e chiudere il dialogo.
5. Premere **Salva progetto** e verificare `Salvataggio…` seguito da `✓ Progetto salvato`.
6. Modificare un parametro e verificare che il pulsante torni allo stato da salvare.

## Mobile

1. Creare o aprire un campo e accedere alla schermata **Imposta l’impianto**.
2. Verificare che **Annata impianto** sia visibile e modificabile insieme al Nome campo.
3. Salvare, riaprire il progetto e controllare che l’annata sia conservata.
4. Verificare che mappa, editor, calcolatore rapido e barra inferiore mantengano il comportamento V35.

## Gate automatico eseguito

- `npm test`: **378/378**.
- `npm run check`: superato.
- Syntax check: `src/app.js`, `src/desktop-library-ui.js`, `src/desktop-ux.js`.
- `styles.css`, geometria, calcoli viticoli, schema database e Supabase LIVE: non modificati.
