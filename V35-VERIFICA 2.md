# V35 — checklist di verifica

Ambiente previsto: **TEST**. La V35 non applica migrazioni e non modifica Supabase LIVE.

## Mobile

1. Accedere con l’account Admin.
2. Aprire **Campi** e premere il pulsante di aggiornamento accanto al `+`.
3. Verificare il messaggio “Sincronizzazione completata” e la presenza dei campi dell’account.
4. Ripetere in **Progetti** e aprire un progetto sincronizzato.
5. Verificare che nella sezione Profilo non compaia il collegamento Amministrazione.

## Desktop

1. Accedere e usare i comandi **Campi** e **Progetti** nella barra superiore.
2. Aprire un campo e un progetto; l’editor principale deve restare disponibile.
3. In Progetti provare **Aggiorna**, quindi controllare che le bozze locali non scompaiano.
4. Dal menu profilo Admin aprire Amministrazione.

## Amministrazione

1. Verificare che la pagina scorra e che la mappa sia satellitare.
2. Controllare che siano visibili tutti i campi dei progetti, non soltanto il campo attivo.
3. Premere **Progetti** per tornare all’elenco completo.
4. Premere **Utenti registrati**, selezionare un profilo e verificare i relativi progetti.
5. Provare gli altri KPI selezionabili e il comando **Torna al configuratore**.

## Gate automatico eseguito

- `npm test`: **373/373**.
- Syntax check: `src/app.js`, `src/desktop-library-ui.js`, `admin/admin.js`.
- `styles.css` storico: non modificato; nuove regole desktop isolate in `desktop-library.css`.
