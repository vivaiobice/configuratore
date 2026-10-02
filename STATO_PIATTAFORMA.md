# Piattaforma Vivai Obice — stato unico

**Versione codice: 1.2.0 — 2 ottobre 2026.** Ambiente configurato: LIVE; pubblicazione di questa consegna non eseguita. Progetta impianto resta alla radice del dominio esistente, Conteggi in `/conteggi/`. Verifica rese è escluso. La consegna è un solo ZIP completo, con sorgenti, test, asset, funzioni e migrazioni consolidate.

## Baseline preservata

- Configuratore stabile: `Configuratore-Vivai-Obice-1.0.5.zip`, commit locale `2edb335`. Comprende le correzioni successive a V55.7; nessun file di V55.7 era stato rimosso.
- Integrazione recuperata: `c73fb83`, pacchetto `Configuratore_Conteggi_V1_unico.zip`; Conteggi confrontato anche con `Conteggi_V1_GitHub.zip` e il sorgente originale del modulo.
- Remoto inventariato: `vivaiobice/configuratore`, main `29eb69e6ba328de725c8604b2813d7c4940db08c`, messaggio 1.0.6. Tutti i **447 file condivisi** con il checkout unificato erano identici byte per byte. `.gitignore` era solo locale. Le 471 copie/archivi ulteriori del remoto erano materiale storico non usato dai percorsi correnti; non sono stati cancellati.
- Recuperabilità: archivi originali e commit baseline conservati, lavoro svolto in checkout isolato. Nessuna modifica ai checkout precedenti, al remoto o al database.
- Il confronto finale conferma identici alla baseline: formule/calcolatore, regole e geometria, catalogo varietà/cloni/portainnesti, report/PDF, UI preventivi, `submit-quote`, logo originale V14/lineare e `CNAME`. Le modifiche al configuratore riguardano collegamenti, identità, checkpoint e ripristino dell'editor.

## Modifiche completate nel codice

| Area | Comportamento |
|---|---|
| Piattaforma unica | Stesso repository, origine HTTPS e Auth; archivio progetti e archivio Conteggi distinti. Collegamenti tramite logo, Profilo, Campi, riepilogo desktop e ingresso admin riservato. Nessuna nuova dashboard. |
| Editor e cambio strumento | Checkpoint locale verificato prima dell'uscita, inclusi punti non confermati, passaggi/esclusioni, camera, transazione e schermata mobile. Un errore di storage blocca la navigazione. Se la mappa deve ancora caricarsi, si salva il workspace pendente e non l'editor vuoto. Durante il ripristino le mutazioni sono bloccate; il logo consente comunque di aprire Conteggi. Il restore controlla owner, progetto, campo e workspace corrente. Ripresa della modalità di modifica filari curvi. |
| Riepilogo desktop | Righe e quantità separate per categoria/campo nelle liste recenti. Correzione di titolo e quantità con lo stesso gateway di Conteggi, controllo delle revisioni e retry idempotenti. Una proposta concorrente resta conservata e segnalata. |
| Contatore a impulsi | Ingresso diretto a schermo intero, fondo scuro, numero grande, pulsante `+` inferiore e `−1` piccolo a sinistra. Audio/vibrazione a icone, tipo Viti/Pali/Altro a icone, titolo iniziale Lettura modificabile. Azzeramento con conferma; suono, aptica e flash dopo commit locale riuscito, secondo il supporto reale del browser. Nessun form prima di contare. |
| Salvataggio e dettagli | Lettura in corso persistita nello stesso IndexedDB e scope del gateway; ripresa dopo ricarica. Salva chiude la lettura e aggiunge una sola riga all’elenco del giorno locale di apertura. Dettagli dopo il salvataggio: titolo, quantità manuale, vitigno, portainnesto facoltativo, note e campo. Selezione grafica dell’elenco, anche oltre 100 elenchi, e creazione di una nuova destinazione mantenendo ID e quantità. Il portainnesto è incluso in snapshot, revisione e email; catalogo e formule del configuratore invariati. |
| Offline | Worker statico circoscritto a `/conteggi/`, senza cache delle API o di dati amministrativi. Dopo prima apertura online, ricarica offline e archivio locale. Identità recuperata solo se il marker coincide con `user.id` del record Auth locale esistente; non si salvano nuove credenziali e non si attribuiscono privilegi admin offline. Errori di trasporto sono distinti dai rifiuti di autorizzazione, anche se il browser dichiara di essere online. Rubrica indisponibile non impedisce conteggi autonomi. |
| Isolamento | Logout invalida immediatamente il recupero offline. Una risposta tardiva di profilo non riporta Auth al vecchio owner. Cambi account da altre schede sospendono archivio/gateway/sync, conservano la bozza nello scope precedente, nascondono le superfici private e riallineano la pagina. Le RPC progetto pendenti ricevono un segnale di annullamento; risposte tardive non aggiornano il nuovo contesto. |
| Ospite → account | Nuova registrazione mantiene lo stesso UID. Accesso a un account esistente richiede una scelta esplicita per trasferire gli appunti: wrapper SQL basato sul grant già verificato e consumato, senza ID forniti dal chiamante. Adozione IndexedDB atomica, backup guest conservato, proposte di recupero incluse; copie cloud equivalenti coalescenti, differenze conservate come conflitti. Vecchie schede non possono scrivere o sincronizzare nello scope già trasferito. Un trasferimento incompleto resta visibile e offre una riprova esplicita nel suo backend/ambiente originale. |
| Stato sync | UI distingue locale, attesa, errore e conflitto; nessun messaggio di sincronizzazione verificata quando non è avvenuta. Autosalvataggio e sincronizzazione non trasmettono richieste commerciali. |
| Admin e invio | Codice backend con verifica JWT/ruolo corrente e RLS. Appunti sincronizzati separati da richieste volontarie, nessuna copia nel profilo personale admin. “Trasmetti a Vivai Obice” richiede riepilogo e conferma; retry conserva ID e payload. Riutilizzo Resend/mittente esistente, senza nuovi servizi; preventivo stabile invariato. |
| Marchio e versione | Asset originali, titolo “Conteggi | Vivai Obice”, firma e copyright Vivai Obice. Versione 1.2.0 e ambiente LIVE visibili nei due strumenti, incluse le superfici mobile. |

## Verifiche effettivamente eseguite

- Baseline di questa modifica UX: **849 passati, 0 falliti, 0 saltati** (release unificata 1.1.0).
- Suite finale sul sorgente consegnato: **864 passati, 0 falliti, 0 saltati**, comando `node --test tests/*.test.mjs` (lo stesso eseguito da `npm test`). I test precedenti sono conservati; aggiornate soltanto le aspettative statiche di versione e i riferimenti agli adapter ora protetti dall'identità.
- `npm run check`: sintassi JS/MJS di `src`, `admin`, `conteggi`, `scripts` e helper server; esito positivo. Rigenerazione manifest statico worker: 32 risorse.
- Test comportamentali con DOM Linkedom, IndexedDB emulato e PostgreSQL PGlite: calcoli e archivi della suite stabile, PDF/report e preventivi, bozze parziali, checkpoint prima di `map.load`, CAS desktop, storage esaurito, isolamento/cambi account/risposte tardive, offline e mancata rete, guest transfer e proposte cloud/locali, permessi SQL, admin, riepiloghi e retry trasmissione. Queste sono prove locali con adapter, non chiamate reali di produzione.
- Revisione indipendente in sola lettura del nuovo contatore. Riprodotti e corretti con test prima falliti e poi passati: ciclo di aggiornamento tra schede, elenco eliminato durante una lettura, retry dopo spostamento già committato. Aggiunta paginazione del selettore destinazioni. Ulteriore verifica dell’autore: risposte tardive della rubrica e contesti campo locali non possono entrare nella lettura di un altro account. Nessuna seconda revisione indipendente dopo le correzioni.
- Controllo del pacchetto: integrità ZIP, presenza dei percorsi necessari, hash dei file, risoluzione dei riferimenti locali statici e import, nessun `node_modules`, `.git`, file secret, duplicato o archivio da sovrapporre. Hash e inventario in `manifest-piattaforma.json`.

## Verifiche ancora necessarie e impedimenti reali

**Collaudo browser/visivo non completato.** In questa revisione la prova di lancio Chromium ha confermato che il binario richiesto da Playwright manca. Nella revisione precedente il tentativo di installazione aveva ricevuto un archivio vuoto e il browser integrato aveva rifiutato localhost. Il runner `scripts/counts-browser.mjs` è incluso, ma non è presentato come una prova riuscita. Va verificata la visibilità effettiva di tutti gli ingressi, andata/ritorno, indietro, ricarica, aggiornamento/controllo del worker e layout dei due strumenti sull'hosting reale.

**Dispositivi reali non provati:** iPhone, iPad, mouse/tocco/Pencil, audio, vibrazione, persistenza dello storage su Safari, stampa/PDF reali. Il supporto sonoro/aptico resta quello effettivamente disponibile nel browser e richiede un gesto utente; non si promette vibrazione su iOS. Nessuna simulazione è descritta come collaudo sul dispositivo.

**Backend Conteggi non attivato.** Sul progetto Supabase `lnclwslcjufwdbmsxljf`, l'elenco migrazioni letto il 2/10/2026 non includeva `counts_v1`. Non sono state applicate migrazioni, distribuite funzioni, modificate impostazioni Auth/secret/DNS o inviate email. Nel pacchetto `syncEnabled`, `adminEnabled`, `submitEnabled`, `guestTransferEnabled` sono false e `noticeVersion` è null. Il codice dei servizi è incluso e verificato localmente, ma non si dichiara funzionante in produzione. Finché il trasferimento è spento, un ospite con appunti può continuare o registrare un nuovo account; il login a un account già esistente è bloccato per conservare l'accessibilità del lavoro. Gli altri servizi restano esplicitamente locali/disattivati.

## Scelte del flusso corrente

La lettura non conclusa è locale fino a Salva: gli impulsi sono conservati, ma solo una lettura conclusa entra negli elenchi e nella sincronizzazione. Il giorno è quello locale di apertura; l’elenco predefinito è riusato quando è aperto e mantiene il titolo giornaliero. Se la destinazione implicita è stata eliminata, il salvataggio recupera la lettura in un elenco giornaliero valido senza riaprire la lista eliminata. Il cambio tipo mantiene la quantità. Il campo ricevuto dal configuratore resta legato al suo owner e ambiente. Portainnesto è facoltativo secondo l’ultima richiesta; non si aggiungono cloni.

## Dipendenze, attivazione e ripristino

Frontend statico e dipendenze cartografiche esistenti invariati. Test riproducibili con `npm ci`, `npm ci --prefix conteggi`, `npm test`, `npm run check`; dipendenze di sviluppo Linkedom, fake-indexeddb e PGlite nei lockfile esistenti. Esecuzione verificata con Node 24.19.0. Runner browser separato richiede Playwright/Chromium disponibili; non è necessario per pubblicare gli asset statici.

Le tre migrazioni additive Conteggi e le funzioni `counts-api`, `counts-admin`, `submit-counts` sono consolidate in `supabase/`. **PUBBLICAZIONE.md** contiene progetto, file SQL e ordine, opzioni CLI verificate, valori dei flag/avviso/origine, riuso dei secret server, collaudo e rollback senza cancellare dati. Il caricamento statico non installa il backend.

Nessuna rimozione di file obbligatoria. Per il rollback conservare tabelle, account, IndexedDB e localStorage; disattivare i servizi nuovi e ripubblicare il commit/pacchetto precedente. Non cancellare tutti i dati del sito. Gli archivi e le schede in `docs/conteggi/` e le note di vecchie release sono riferimenti storici; questo è l'unico documento di stato corrente.
