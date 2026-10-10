# Pubblicazione — piattaforma Vivai Obice 1.3.7

Il pacchetto contiene Configuratore e Conteggi. Destinazioni: `https://progettaimpianto.vivaiobice.com/` e `/conteggi/`. Repository e impostazioni GitHub Pages restano quelli esistenti. Nessuna pubblicazione remota è stata eseguita in questa consegna.

## Stato dei servizi

Versione e cache sono coordinate a **1.3.7 · LIVE**. Il codice browser prepara sincronizzazione e trasmissione; Admin resta disabilitato. **I servizi Conteggi non sono attivi sul server:** all’ultimo controllo del 9 ottobre, documentato nella 1.3.6, le tabelle risultavano assenti e i tentativi di installazione tramite il collegamento Supabase restituiscono `Invalid or expired requestState`. Non sono stati applicati SQL, distribuite funzioni, modificati secret o inviati messaggi reali.

Il salvataggio locale è disponibile. Le letture aperte sono bozze sul dispositivo; diventano righe sincronizzabili con «Salva lettura». Quando il server sarà attivo, una sessione registrata potrà sincronizzarle anche senza campo associato. Un ospite deve accettare l’avviso corrente e scegliere esplicitamente il trasferimento durante l’accesso a un account esistente. Sincronizzazione e trasmissione sono operazioni distinte: la prima non invia email.

«Adatta al terreno» non viene modificato in questa revisione. La navigazione 3D approvata dall’utente resta invariata. Esiti e limiti in [README_RELEASE_1.3.7.md](README_RELEASE_1.3.7.md), [QA_RELEASE_1.3.7.md](QA_RELEASE_1.3.7.md) e `manifest-piattaforma.json`.

## Pubblicare il codice unico

1. Conservare il checkout e lo ZIP della versione pubblicata. Non cancellare gli archivi personali del browser.
2. Estrarre `Vivai_Obice_Piattaforma_v1.3.7.zip` in una cartella separata. `index.html`, `CNAME`, `src/`, `conteggi/`, `assets/`, `admin/`, `tests/` e `supabase/` sono alla radice.
3. Copiare l’intero contenuto nella radice del checkout `vivaiobice/configuratore`; non aggiungere una cartella contenitore. Non servono `node_modules` sull’hosting. Conservare `CNAME`, ramo e impostazioni Pages.
4. Controllare le modifiche e pubblicare un unico commit con il flusso già utilizzato. Versione attesa in entrambi gli strumenti: **1.3.7 · LIVE**.
5. Chiudere le vecchie schede Conteggi, riaprire online e poi provare l’avvio offline. Il Service Worker controlla soltanto `/conteggi/`. Conservare IndexedDB/localStorage e la stessa origine HTTPS.

Il caricamento statico non installa il backend. Attivare e verificare i servizi sotto prima di considerare conclusi salvataggio nel profilo e trasmissione.

## Completare l’attivazione Conteggi

Usare il progetto Supabase esistente `lnclwslcjufwdbmsxljf` (configuratore-vivai-obice). Non creare un altro sistema Auth né modificare il servizio preventivi.

1. Verificare le migrazioni già presenti. Se assenti, applicare in ordine i sorgenti esatti di questo pacchetto:
   - `supabase/migrations/20261002025102_counts_v1.sql`
   - `supabase/migrations/20261002084108_counts_verified_guest_transfer.sql`
   - `supabase/migrations/20261002220000_counts_reading_moves.sql`

   Il 9 ottobre risultavano tutte da installare. Le funzioni `counts_apply` confrontano correttamente l’enum dell’ambiente dei progetti con il testo ricevuto. Non rieseguire migrazioni già applicate e non eliminare tabelle per installarle.
2. Distribuire soltanto `counts-api` e `submit-counts` dal codice incluso. Conservare le importazioni relative e includere `conteggi/model.js`, `conteggi/submission.js`, gli helper `_shared/counts-*`, `quote-request.js`, `lot-lookup.js` e `production-lots-2026.js`. Entrambe verificano l’identità tramite Auth lato server; il proprietario non viene accettato dal browser. `counts-admin` resta fuori dall’attivazione richiesta.
3. Verificare i flag del server. I default pubblici sono sincronizzazione e trasmissione abilitate, Admin disabilitato, ambiente LIVE, avviso `counts-v1-2026-10-09`, origine ammessa `https://progettaimpianto.vivaiobice.com`. Eventuali `COUNTS_SYNC_ENABLED=false`, `COUNTS_SUBMIT_ENABLED=false` o `COUNTS_EMAIL_ENABLED=false` già presenti prevalgono sui default. Browser e server devono usare la stessa versione avviso.
4. Il mittente/provider già usati dai preventivi forniscono `RESEND_API_KEY` e `QUOTE_EMAIL_FROM`. Il codice li riusa senza richiedere nuovi secret; in loro assenza l’email resta indisponibile. Non inserire chiavi server nel frontend o nello ZIP. Non modificare `submit-quote`.
5. Con sessione autenticata eseguire soltanto la lettura capacità di `counts-api`, corpo `{"environment":"LIVE","action":"capabilities","input":{}}`. Verificare `sync`, `submit`, `emailReady`, `noticeVersion` e `environment`; questa verifica non invia email.
6. Provare salvataggio senza campo, logout/login e recupero su un altro browser, isolamento di un secondo proprietario, modifiche concorrenti e trasferimento ospite esplicito. Provare una trasmissione soltanto dopo una conferma volontaria con dati e recapiti di collaudo concordati; un retry deve conservare la stessa richiesta.

I test locali usano servizi simulati e non sostituiscono questi controlli LIVE. Non sono stati eseguiti invii reali nella preparazione del pacchetto.

## Ripristino

Conservare il pacchetto precedente. Se necessario disabilitare i flag dei servizi e ripubblicare quel pacchetto, senza cancellare dati, account o tabelle. Per rimuovere il worker annullare soltanto la registrazione con scope `/conteggi/` e le cache statiche `vivai-obice-counts-static-*`; non usare «cancella tutti i dati del sito». Un trasferimento già concluso non va invertito automaticamente.

## Cronologia: aggiornamenti delle versioni precedenti

Le istruzioni seguenti documentano le consegne indicate e non fissano la versione da pubblicare oggi.

## Aggiornamento del contatore 1.2.0

La lettura aperta si conserva localmente nello scope del proprietario e diventa una riga sincronizzabile soltanto con **Salva lettura**. Il titolo iniziale è Lettura; l’elenco automatico usa il giorno locale di apertura. Il salvataggio crea o riusa l’elenco aperto di quel giorno; i dettagli consentono poi di spostare la stessa riga in un altro elenco o in uno nuovo.

Se il backend Conteggi è già stato installato con la versione precedente, applicare soltanto `20261002220000_counts_reading_moves.sql`, quindi aggiornare le tre funzioni con i sorgenti di questo pacchetto. La migrazione preserva i permessi e consente lo spostamento di una riga solo tra elenchi dello stesso proprietario/ambiente. Non cancellare né rieseguire le migrazioni già applicate. Portainnesto è un dato facoltativo nella riga JSON e nel riepilogo; le vecchie righe restano valide. Finché i flag sono disattivati, il comando di trasmissione spiega che il servizio non è ancora attivo.

Collaudo aggiuntivo: ingresso senza form, tocchi rapidi, suono/vibrazione dove supportati, flash, −1 a zero, annullamento e conferma azzeramento, ricarica prima di salvare, due letture nello stesso elenco giornaliero, titolo, dettagli e campo, spostamento tra elenchi e creazione di un nuovo elenco, cambio account e proposta concorrente. `scripts/counts-browser.mjs` è aggiornato a questo flusso e richiede Playwright con Chromium installato.

## Correzione touch e Comfortaa 1.2.1

Pubblicare il pacchetto completo, incluso `fonts.css`, `assets/fonts/Comfortaa-Variable.ttf` e relativa licenza. Il font non richiede Google Fonts né una connessione esterna. Il worker usa una nuova cache `vivai-obice-counts-static-1.2.1`; il manifest offline include anche font e foglio condiviso. Nessuna nuova migrazione o funzione backend per questa correzione.

Dopo la pubblicazione, chiudere le vecchie schede, riaprire online e controllare `1.2.1 · LIVE`. Su iPhone/iPad provare logo in alto → Conteggi, logo dell’editor → Conteggi e Profilo → Conteggi, da ospite e da utente: deve comparire subito il contatore. Non cancellare i dati del sito. Le prove locali in Chromium sono riuscite; il test Safari su dispositivo resta da eseguire.

## Correzione ripristino del configuratore 1.2.2

Pubblicare il pacchetto completo e verificare `1.2.2 · LIVE`. Correzione frontend in `src/app.js` e `src/map.js`, più disposizione dell’intestazione editor mobile in `counts-integration.css`: il ripristino della bozza e il cambio campo usano la disponibilità persistente dell’editor, senza attendere un nuovo evento `load` quando arrivano immagini satellitari. Nessuna modifica a migrazioni, database, account, archivio o associazioni tra campi.

Collaudo su hosting e Safari reale: aprire un progetto, modificare distanze/perimetro, tornare più volte da Campi alla mappa, ricaricare una bozza non conclusa e passare a Conteggi/ritornare al configuratore. Controllare che i punti siano conservati e che il messaggio di ripristino non blocchi i comandi dopo l’inizializzazione. Chiudere le vecchie schede e riaprire online; non cancellare IndexedDB/localStorage o tutti i dati del sito.


## Aggiornamento grafico e curvatura 1.2.4

Pubblicare l’intero pacchetto e verificare `1.2.4 · LIVE` nei due strumenti. Gli ingressi HTML, i moduli modificati e la cache statica Conteggi hanno riferimenti aggiornati; sono inclusi il font locale, il logo originale e tutti i test. Chiudere le vecchie schede e riaprire online. Non cancellare IndexedDB, localStorage o tutti i dati del sito.

Nessuna nuova migrazione SQL per la 1.2.4: tipo/materiale dei pali e componenti sono proprietà facoltative dei record JSON esistenti. Le righe precedenti restano valide. Se il backend è già attivato, aggiornare le tre funzioni Conteggi con i sorgenti inclusi, così validazione, snapshot ed email accettano i nuovi dettagli. Se resta disattivato, non servono operazioni backend per usare il contatore locale. Il pacchetto mantiene i flag cloud disattivati.

Collaudo dopo il caricamento:

- Documento generato e stampa: font precedente; controlli dell’app in Comfortaa.
- Nomi campo: visibili selezionando quel campo, un altro campo o nessuno; controllare anche campi parzialmente inquadrati. Il pulsante Conteggi aggiuntivo in alto a destra è rimosso; logo e Profilo aprono ancora lo strumento.
- Curvatura: creare un passaggio trasversale di 1,50 m, aggiungere un punto per lato, modificare il primo e verificare che il secondo tratto resti invariato. Provare anche un passaggio obliquo e uno vicino al bordo, trascinare due controlli sovrapposti, rimuovere il passaggio e ricaricare la bozza. Per passaggi che si incrociano dentro il campo resta una curva globale con esclusioni complete: i tratti laterali non hanno controlli indipendenti in questa release.
- Conteggi: logo/selettore in alto a sinistra e ritorno al configuratore, nome modificabile, `−1` sopra il `+` a tutta larghezza, watermark leggero, salvataggio e ripresa dopo ricarica. Archivio su una sola schermata con card e tre gruppi espandibili; popup per quantità, vitigno/portainnesto, tipo/materiale pali o componente personalizzato. Provare più elenchi, spostamento della lettura, nomi profilo lunghi e schermo 320 px.

Le prove automatiche e Chromium locali sono passate. Hosting, Safari su dispositivi reali, audio/vibrazione fisici e backend di produzione restano da collaudare prima di dichiarare attivi quei servizi.

## Nota storica della pubblicazione 1.2.5

La 1.2.5 aggiunge porzioni con direzione e curvatura indipendenti nello stesso campo e aggiorna i report: non richiede nuove migrazioni SQL. Prima di sostituire il pacchetto conservare la versione 1.2.4. Dopo il caricamento verificare la curvatura di un campo con passaggio trasversale da 1,50 m: un controllo per lato, indipendenza della modifica e due pali di testa per ciascun pezzo. Verificare Aggiorna progetto dalla pagina PDF e quote/nomi sulle sole immagini satellitari del documento.
