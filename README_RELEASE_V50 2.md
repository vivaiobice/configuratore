# Configuratore Vivai Obice — V50

## Contenuto della release

- Profilo: ripristinato il salvataggio dei dati personali e aziendali; la preferenza del tema compare
  soltanto nella scheda Profilo.
- Campi: aggiunto lo stato `Da realizzare` / `Impianto realizzato`, salvato per singolo campo e
  riportato nelle viste condivise e nei documenti.
- Amministrazione: nuovi KPI Progetti, Campi totali, Preventivi, Clienti/Utenti, Barbatelle da
  piantare e Superficie archivio; tabelle separate Campi, Progetti e Clienti con filtri e dettaglio.
- Mappa amministrativa: mostra contemporaneamente i campi filtrati con etichetta campo e progetto.
- Archivio progetti: righe espandibili, dati dei campi e spostamento fra progetti tramite trascinamento
  o `Sposta in…`, sempre con conferma. Lo spostamento è atomico, idempotente e crea una revisione per
  entrambi i progetti.
- Mappe satellitari: aggiunto il livello Esri con località, confini e riferimenti geografici sopra le
  immagini in editor, amministrazione, progetto condiviso e acquisizione per la stampa.
- Preventivi: predisposto il numero preventivo umano facoltativo e univoco per ambiente.

## Database TEST

La migrazione `supabase/migrations/202609250002_v50_admin_archive.sql` è stata applicata al progetto
Supabase collegato all'ambiente TEST. Sono stati verificati:

- `project_fields.planting_status` e relativo vincolo;
- `quote_requests.quote_number` e indice univoco parziale;
- RPC `public.move_project_field(uuid,uuid,uuid,text)`;
- esecuzione consentita a `authenticated` e negata ad `anon`;
- prova di spostamento completa in transazione con `ROLLBACK`, senza modificare dati reali.

Gli advisor non hanno rilevato nuove segnalazioni introdotte dalla V50. Restano segnalazioni già
presenti: accesso anonimo intenzionale alle RPC di consultazione tramite codice/token, RLS della
tabella report senza policy dirette e protezione password compromesse non attiva nel progetto.

## Ordine di pubblicazione

1. La migrazione TEST è già applicata. Per un ambiente differente, applicarla prima dei file statici.
2. Pubblicare integralmente il contenuto del pacchetto V50 mantenendo cartelle e nomi.
3. Forzare il ricaricamento della cache e verificare il badge `AMBIENTE TEST · V50`.

Rollback: ripristinare prima i file statici V49. Le colonne V50 sono additive e possono restare nel
database; revocare la nuova RPC se si vuole disabilitare immediatamente lo spostamento campi.

## Collaudo consigliato

1. Accedere, modificare il Profilo e riaprire la scheda per verificare la persistenza.
2. Impostare due campi, uno `Da realizzare` e uno `Impianto realizzato`, quindi controllare KPI e
   tabelle amministrative.
3. Espandere un progetto nell'archivio, annullare uno spostamento e poi completarne uno verso un altro
   progetto; riaprire entrambi.
4. Verificare nomi geografici su editor, amministrazione, progetto condiviso e anteprima stampa.
5. Generare un PDF multi-campo e verificare mappa, dati, stato impianto e QR.
6. Ripetere il controllo essenziale da Safari iPhone; il redesign mobile generale resta previsto per
   una release successiva.

## Verifica automatica

- Suite completa: `568/568` test superati, nessun test saltato.
- Controllo sintattico: `npm run check` superato.
- Contratti SQL, permessi RPC e transazione di rollback: verificati sul database TEST.
