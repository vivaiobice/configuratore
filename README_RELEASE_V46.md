# Vivai Obice · correzioni V46

Pacchetto incrementale da applicare sopra la V45 al repository `vivaiobice/configuratore`.

- Ricerca mappa: la località scelta nei suggerimenti usa il risultato ArcGIS selezionato.
- Apertura tramite codice: tutti i campi salvati sono consultabili, inclusi quelli con perimetro incompleto, e il totale è visibile.
- Dopo il login la stampa tramite codice genera la stessa struttura di documento dell'anteprima della prima emissione, con tutti i campi salvati e con il profilo del cliente come intestazione.
- «Stampa / salva PDF» apre la stampa del browser dal medesimo documento mostrato nell'anteprima; si può scegliere stampante o salvataggio PDF. Il titolo per il nome file è Progetto_VO..._NomeCliente.
- Il frontespizio usa il codice VO; i dati di indirizzo e località sono distanziati; la pagina di riepilogo presenta schede distinte.
- Dark mode: contrasto di schede e logo trasparente con sottile contorno bianco.
- «Carica progetto» è sopra la mappa a sinistra sulla versione desktop. Le schermate mobile rimangono da rivedere nelle prossime release.

La migrazione SQL `supabase/migrations/202609240006_public_project_all_saved_fields.sql` è già applicata nel database usato dal sito; il file serve a replicare in altri ambienti.

Verifiche: `npm test` (528/528), `npm run check`; PDF A4 renderizzato per ispezione. Sito online NON ancora aggiornato: l'integrazione GitHub nega le scritture con HTTP 403. Applicare solamente i file presenti in questo archivio sulla V45, poi verificare che il sito carichi `v46-fixes.css` e `src/app.js?v=46`.
