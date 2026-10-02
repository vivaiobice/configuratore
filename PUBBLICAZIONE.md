# Pubblicazione — piattaforma Vivai Obice 1.2.0

Il pacchetto contiene **entrambi gli strumenti già consolidati**. Destinazioni: `https://progettaimpianto.vivaiobice.com/` e `https://progettaimpianto.vivaiobice.com/conteggi/`. Il repository resta `vivaiobice/configuratore`; si usa il flusso GitHub Desktop / GitHub Pages esistente, senza secondo repository, DNS o hosting.

## Cosa è stato eseguito

Inventario e confronto del codice corrente, integrazione locale e prove automatiche. **Non** sono stati modificati GitHub remoto, database, Edge Functions, secret, DNS o account; nessuna email reale inviata. Il backend Supabase esistente è `lnclwslcjufwdbmsxljf`; la migrazione Conteggi non risultava installata al controllo del 2 ottobre 2026.

Il pacchetto statico avvia Conteggi in modalità locale. Sincronizzazione, consultazione admin, trasmissione e trasferimento verso un account già esistente hanno flag disattivati: caricare lo ZIP **non installa** questi servizi. I passaggi sotto sono da eseguire.

## Pubblicare il codice unico

1. Conservare il checkout attuale e un commit/tag della versione pubblicata. Fare una copia dello ZIP precedente; non esportare o cancellare gli archivi personali del browser.
2. Estrarre il nuovo ZIP in una cartella separata. `index.html`, `CNAME`, `src/`, `conteggi/`, `assets/`, `admin/`, `tests/` e `supabase/` sono già nella radice corretta; non aggiungere un ulteriore livello di cartelle.
3. Copiare **l'intero contenuto** nella radice del checkout esistente, sostituendo i file omonimi con quelli del nuovo pacchetto. Non bisogna scegliere o fondere due versioni di `tests` o `supabase`. Su Mac è possibile usare, sostituendo soltanto i due percorsi:

   ```sh
   rsync -a "/percorso/pacchetto-estratto/" "/percorso/repository-configuratore/"
   ```

   Non aggiungere `--delete`; lo ZIP non contiene `.git` né dipendenze installate. Non copiare la cartella contenitore al posto della radice. La copia non cancella eventuali file storici remoti non presenti nel pacchetto.
4. In GitHub Desktop controllare le modifiche, creare un unico commit e pubblicarlo sul ramo già usato da Pages. Mantenere `CNAME` e impostazioni Pages correnti. Non serve una build frontend né `node_modules` sull'hosting. `npm ci` e `npm ci --prefix conteggi` servono solo per riprodurre i test.
5. Dopo il deploy verificare entrambe le destinazioni HTTPS, `/conteggi` con redirect allo slash e query preservata, `/conteggi/` direttamente sul contatore, l’icona elenco, ricarica e indietro. Versione attesa su entrambi: `1.2.0 · LIVE`. Eseguire il collaudo manuale indicato nello stato prima di qualificare il rilascio come verificato sui dispositivi.

**Rimozioni:** nessuna rimozione obbligatoria per questa versione. Il remoto contiene copie storiche con suffissi e vecchi pacchetti; non sono riferiti dai percorsi correnti e non vengono cancellati da questa consegna. Non cancellare cartelle o migrazioni per deduzione dal nome. Il nuovo ZIP non contiene cartelle duplicate da sovrapporre.

## Installare il backend Conteggi

Usare il progetto Supabase già esistente. Non creare un nuovo sistema Auth né modificare il servizio preventivi. Prima delle migrazioni conservare un backup del database con il metodo già usato. I file SQL sono additivi e non azzerano tabelle progetto, profili o conteggi.

1. Nel SQL Editor del progetto `lnclwslcjufwdbmsxljf`, verificare che le tabelle Conteggi e la funzione nuova non esistano già:

   ```sql
   select to_regclass('public.counts_lists') as counts_lists,
          to_regprocedure('public.counts_claim_guest(text,text)') as counts_claim_guest;
   ```

   Se entrambi sono null, eseguire integralmente e **in questo ordine**, una sola volta:

   - `supabase/migrations/20261002025102_counts_v1.sql`
   - `supabase/migrations/20261002084108_counts_verified_guest_transfer.sql`
   - `supabase/migrations/20261002220000_counts_reading_moves.sql`

   Se sono già presenti, confrontare l'installazione prima di eseguire di nuovo `CREATE`. Non eseguire `supabase/schema.sql` sopra il database esistente e non usare `db reset` o `db push` indiscriminato: le migrazioni storiche locali hanno versioni diverse da quelle registrate sul remoto. L'esecuzione nel SQL Editor non aggiorna automaticamente la tabella del registro migrazioni CLI; documentarla nella gestione già usata del progetto.
2. Verificare RLS delle sei tabelle `counts_lists`, `counts_entries`, `counts_operations`, `counts_notice_receipts`, `counts_submissions`, `counts_deliveries`. Utenti guest e registrati possono leggere soltanto il proprio owner. Le mutazioni e letture amministrative passano dalle funzioni server; il wrapper guest accetta soltanto una prova esistente già consumata dall'account destinatario. Nessun ruolo si assegna dal frontend.
3. Dal checkout completo, con CLI Supabase autenticato, distribuire **solo** queste funzioni (opzioni controllate con CLI 2.119.0):

   ```sh
   supabase functions deploy counts-api counts-admin submit-counts --project-ref lnclwslcjufwdbmsxljf --use-api --no-verify-jwt
   ```

   Non usare `--prune` né omettere i nomi. Non ridistribuire `submit-quote` o le funzioni del configuratore. I tre handler verificano ogni JWT con `auth.getUser(token)` e applicano i permessi attuali, incluso il ruolo admin permanente. `--no-verify-jwt` riguarda il controllo preliminare del gateway, non disattiva questa autenticazione nel codice. Riferimento ufficiale: [autorizzazione Edge Functions](https://supabase.com/docs/guides/functions/auth-headers).
4. Nei secret Edge Functions impostare i seguenti valori, inizialmente con i quattro flag falsi:

   | Nome | Valore |
   |---|---|
   | `COUNTS_ENVIRONMENT` | `LIVE` |
   | `COUNTS_ALLOWED_ORIGINS` | `https://progettaimpianto.vivaiobice.com` |
   | `COUNTS_NOTICE_VERSION` | `counts-v1-2026-10-02` |
   | `COUNTS_SYNC_ENABLED` | `false` |
   | `COUNTS_ADMIN_ENABLED` | `false` |
   | `COUNTS_SUBMIT_ENABLED` | `false` |
   | `COUNTS_EMAIL_ENABLED` | `false` |

   Riutilizzare i secret server esistenti `RESEND_API_KEY` e `QUOTE_EMAIL_FROM` e il valore corrente di `CONFIGURATOR_BASE_URL` (`https://progettaimpianto.vivaiobice.com/`). Non sostituire un mittente verificato o un provider già funzionante. `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sono variabili riservate del runtime server. Non inserirle in file frontend, GitHub o ZIP.
5. Per abilitare la sincronizzazione, impostare `COUNTS_SYNC_ENABLED=true` sul server; in `conteggi/config.js` impostare `syncEnabled:true`, `noticeVersion:'counts-v1-2026-10-02'`. L'avviso visibile deve spiegare salvataggio cloud e consultazione amministrativa; la sua lettura è distinta dalla trasmissione. Versione avviso browser/server deve coincidere.
6. Dopo la migrazione wrapper, abilitare `guestTransferEnabled:true` in `conteggi/config.js`. Il Profilo mostra una scelta esplicita, inizialmente non selezionata, per trasferire gli appunti ospite durante l'accesso a un account già esistente. Finché il servizio è disattivato, un ospite con appunti non può fare quel login: può continuare come ospite o registrare un nuovo account mantenendo la stessa identità. Un ospite senza appunti può accedere normalmente. Questo evita di rendere irraggiungibile il lavoro locale.
7. Per attivare la consultazione, impostare `COUNTS_ADMIN_ENABLED=true` sul server e `adminEnabled:true` nel file browser. Usare il ruolo admin **già autorizzato** in Auth `app_metadata`; non alterare profili o ruoli solo per far apparire un pulsante. Appunti e invii sono viste separate; nessuna importazione nel profilo admin.
8. Per attivare la trasmissione volontaria, dopo verifica del mittente/provider, impostare `COUNTS_SUBMIT_ENABLED=true`, `COUNTS_EMAIL_ENABLED=true` sul server e `submitEnabled:true` nel browser. Il pulsante è “Trasmetti a Vivai Obice”; richiede selezione, riepilogo e conferma. Gli esiti incerti si ritentano con lo stesso identificatore, senza nuovo invio automatico alla riconnessione.
9. Dopo le modifiche a `conteggi/config.js`, eseguire `npm run offline:build`, `npm test`, `npm run check` e pubblicare lo stesso pacchetto coordinato. Il worker usa rete prima della cache; gli aggiornamenti aspettano la chiusura delle vecchie schede. Non promettere che i file offline si aggiornino su un dispositivo rimasto senza connessione.

## Collaudo esterno prima dell'attivazione completa

Provare con dati dedicati guest, utente A, utente B e admin autorizzato: ripresa offline dopo prima apertura online; logout/cambio account senza dati incrociati; modifiche concorrenti da due schede/dispositivi; recupero cloud dopo logout e nuovo login; trasferimento guest esplicito con appunti locali e remoti; errore di salvataggio che blocca l'uscita. La sincronizzazione deve attendere l'avviso e non inviare email. Admin deve vedere appunti e richieste separate; utenti normali e guest devono essere respinti dalle rotte admin.

Provare una trasmissione **solo con conferma esplicita** e recapiti di collaudo controllati; verificare stesso riepilogo in un retry e stato email. Verificare anche PDF, preventivo, editor e navigazione mobile della parte stabile. Non sono prove già eseguite sul backend o su dispositivi reali in questa consegna.

## Ripristino senza perdita dei dati

Disattivare prima i flag Conteggi server/browser, conservando dati e tabelle. Ripubblicare il commit/pacchetto unificato precedente (`c73fb83` come baseline locale; remoto inventariato `29eb69e6ba328de725c8604b2813d7c4940db08c`). Non cancellare IndexedDB, localStorage, account o tabelle e non annullare una migrazione eliminando dati. Le aggiunte SQL possono restare inattive; un trasferimento già eseguito conserva la proprietà acquisita e non va invertito automaticamente.

Per togliere il worker durante un rollback, usare gli strumenti del browser e annullare soltanto la registrazione con scope `/conteggi/`; se necessario eliminare soltanto cache statiche `vivai-obice-counts-static-*`. **Non usare “cancella tutti i dati del sito”**, che eliminerebbe gli appunti locali. Conservare la stessa origine HTTPS: cambiare dominio separa gli archivi locali.

## Aggiornamento del contatore 1.2.0

La lettura aperta si conserva localmente nello scope del proprietario e diventa una riga sincronizzabile soltanto con **Salva lettura**. Il titolo iniziale è Lettura; l’elenco automatico usa il giorno locale di apertura. Il salvataggio crea o riusa l’elenco aperto di quel giorno; i dettagli consentono poi di spostare la stessa riga in un altro elenco o in uno nuovo.

Se il backend Conteggi è già stato installato con la versione precedente, applicare soltanto `20261002220000_counts_reading_moves.sql`, quindi aggiornare le tre funzioni con i sorgenti di questo pacchetto. La migrazione preserva i permessi e consente lo spostamento di una riga solo tra elenchi dello stesso proprietario/ambiente. Non cancellare né rieseguire le migrazioni già applicate. Portainnesto è un dato facoltativo nella riga JSON e nel riepilogo; le vecchie righe restano valide. Finché i flag sono disattivati, il comando di trasmissione spiega che il servizio non è ancora attivo.

Collaudo aggiuntivo: ingresso senza form, tocchi rapidi, suono/vibrazione dove supportati, flash, −1 a zero, annullamento e conferma azzeramento, ricarica prima di salvare, due letture nello stesso elenco giornaliero, titolo, dettagli e campo, spostamento tra elenchi e creazione di un nuovo elenco, cambio account e proposta concorrente. `scripts/counts-browser.mjs` è aggiornato a questo flusso e richiede Playwright con Chromium installato.
