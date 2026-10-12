# Configuratore Vivai Obice — V47

## Correzioni incluse

- Il progetto aperto tramite ID usa la stessa impaginazione A4 dell’anteprima PDF generata dal configuratore.
- Anteprima e stampa condividono lo stesso modello e le stesse immagini satellitari.
- Tutti i campi presenti nella revisione salvata vengono inclusi, con riepilogo generale quando sono più di uno.
- Il recupero tramite ID sceglie la fonte server più completa tra revisione, campi normalizzati e salvataggio storico.
- Il pulsante **Carica progetto** è sopra la mappa e allineato a sinistra nella versione desktop.
- La struttura mobile resta invariata.

## Pubblicazione

Caricare nella radice del repository, mantenendo le cartelle:

- `index.html`
- `shared-project.html`
- `v47-fixes.css`
- `src/shared-project.js`
- `src/shared-project-entry.js`

La migrazione `supabase/migrations/202609240007_public_project_complete_preview.sql` è già stata applicata al progetto Supabase TEST ed è inclusa come archivio della modifica.

## Verifica consigliata

1. Creare o riaprire un progetto con almeno due campi.
2. Salvare nuovamente il progetto per sincronizzare tutti i campi.
3. Aprirlo tramite **Carica progetto** usando l’ID `VO-XXXXXXX`.
4. Verificare il frontespizio, la pagina di riepilogo e le due pagine dedicate a ciascun campo.
5. Eseguire il login, accettare l’avvertenza e stampare: l’impaginazione deve coincidere con l’anteprima.

I vecchi ID per i quali il server aveva memorizzato un solo campo non possono ricostruire un campo mai ricevuto dal server. Riaprendo la copia locale completa e salvandola di nuovo, lo stesso progetto viene aggiornato con tutti i campi disponibili.
