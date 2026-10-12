# Configuratore Vivai Obice — V51

## Contenuto della release

- Località per campo: il comune viene ricavato dal punto interno del perimetro, salvato con il campo
  e mantenuto distinto dagli altri campi dello stesso progetto. In amministrazione resta modificabile.
- Mappa amministrativa: formato più compatto e centrato, vista iniziale più ravvicinata, controllo GPS,
  perimetri gialli trasparenti e messa a fuoco automatica del campo scelto in tabella.
- Dettaglio campo: estratto satellitare con perimetro, esclusioni e filari calcolati dallo stesso motore
  del configuratore, comprese curve, capezzagne ed equidistanza.
- Archivio progetti: più progetti e più campi possono restare aperti contemporaneamente. Ogni pannello
  si chiude in modo indipendente e conserva nel proprio contesto stato CRM, revisioni e note interne.
- Compatibilità: i progetti storici senza località di campo vengono completati una sola volta; i dati
  geografici a livello progetto restano come fallback per i record precedenti.

## Database TEST

Le migrazioni `20260925134413_v51_admin_field_location.sql` e
`20260925195500_v51_admin_field_location_hardening.sql` sono state applicate al progetto Supabase
collegato all'ambiente TEST. La RPC amministrativa è idempotente, crea una revisione e aggiorna
soltanto il campo identificato dalla coppia progetto/campo.

Permessi verificati: esecuzione negata ad `anon` e consentita ad `authenticated`; la funzione interna
controlla inoltre `private.is_admin()` prima di qualsiasi modifica. Gli advisor non hanno segnalato
nuove anomalie imputabili alla V51; restano gli avvisi già presenti e documentati nella V50.

## Ordine di pubblicazione

1. La migrazione TEST è già applicata. Per un ambiente differente, applicarla prima dei file statici.
2. Pubblicare integralmente il contenuto del pacchetto V51 mantenendo cartelle e nomi.
3. Forzare il ricaricamento della cache e verificare il badge `AMBIENTE TEST · V51`.

Rollback: ripristinare i file statici V50. Per bloccare immediatamente le correzioni amministrative,
revocare l'esecuzione di `public.admin_set_field_location` senza rimuovere i dati già salvati.

## Collaudo consigliato

1. Disegnare o modificare un campo, salvare e verificare la località nella tabella amministrativa.
2. Correggere manualmente comune, provincia, regione e descrizione completa dal dettaglio campo.
3. Selezionare campi diversi in tabella e verificare l'inquadramento automatico sulla mappa principale.
4. Aprire due progetti, aprire più campi e chiuderli in ordine diverso senza perdere gli altri pannelli.
5. Verificare nell'estratto satellitare filari rettilinei, curvi, esclusioni e capezzagne.
6. Ripetere un controllo essenziale da Safari; la revisione generale mobile resta la release successiva.

## Verifica automatica

- `npm test`: **599/599** test superati, nessun test saltato.
- `npm run check`: controllo sintattico completo superato.
- Prova RPC sul database TEST eseguita in transazione: aggiornato soltanto il campo selezionato,
  campo fratello invariato, riga normalizzata creata se assente, retry idempotente senza seconda revisione;
  rollback verificato senza dati residui.
- Il browser conserva e riutilizza lo stesso `operation_id` anche quando il database ha completato
  l'operazione ma la risposta di rete viene persa.
- Il pacchetto di pubblicazione viene estratto e ricontrollato prima della consegna.
