# Collaudo 1.3.5 — Conteggi

## Suite mirata

Comando: `node --test tests/counts-*.test.mjs tests/release-version.test.mjs tests/portion-release-cache.test.mjs tests/auth-sync-integration.test.mjs tests/auth-transfer.test.mjs`.

**189 test superati, 0 falliti, 0 saltati.** Include dettagli e titoli automatici/manuali, isolamento proprietari, trasferimento ospiti, conflitti e revisioni, salvataggi locali, API, migrazioni SQL, snapshot degli invii e configurazione. Le fixture SQL usano il vero tipo enum dell’ambiente dei progetti. I controlli `npm run check` e `git diff --check` sono superati.

## Browser e offline

`scripts/counts-v135-browser.mjs` carica i moduli autentici in Chromium e simula esclusivamente SDK/account e servizi cloud con fixture locali. Verifica la corrispondenza degli hash dei moduli serviti. Tutti e quattro i formati 1365 × 960, 390 × 844, 320 × 568 e 320 × 667 superano 12 fasi ciascuno. Numero, −1, + e salvataggio sono visibili senza scroll; il riepilogo resta entro due righe. Selezione, dettagli, titoli, ricarica, salvataggio e recupero da un browser nuovo superano le prove. Quattro aperture dirette delle letture per formato conservano la categoria aperta, senza retry aggiunti o click forzati. Nessun errore browser/HTTP, 72 chiamate API locali simulate e zero richieste di trasmissione/Admin.

`scripts/counts-cold-offline-browser.mjs` verifica il Service Worker autentico, chiusura delle schede, riapertura offline a freddo, incremento, salvataggio e seconda riapertura. Le librerie cartografiche sono reali; account, satellite e fornitori sono fixture locali. Il grafo offline coordinato comprende 42 risorse. Gli esiti conclusivi del sorgente e del pacchetto estratto sono registrati nel manifest. Nel test originale sul sorgente desktop si sono verificati due timeout di 30 secondi nell’avvio MapLibre al ritorno al configuratore, dopo il corretto recupero offline del contatore e del proprietario; mobile completa tutte le sei fasi. La raccolta diagnostica desktop, con sole osservazioni e le stesse asserzioni/timeout, completa tutte le sei fasi. Registra avvisi WebGL ReadPixels di stallo GPU. Il manifest conserva distinti esiti originali e diagnostici; questa variabilità del renderer di collaudo non viene nascosta né corretta modificando la mappa. Lo stesso timeout si riproduce nel controllo isolato sul commit `118652b`, precedente agli ultimi fix del dialogo. Sullo ZIP estratto il test originale completa tutte le sei fasi desktop, mentre mobile si ferma allo stesso controllo MapLibre dopo il recupero del contatore/proprietario; la raccolta puramente osservativa mobile completa tutte le sei fasi, senza cambiare asserzioni o limite. Le prove del contatore sullo ZIP superano tutti e quattro i formati e i controlli di hash; non si dichiara uniformemente verde l’intero percorso cartografico del renderer software.

## Limiti e server

Il backend LIVE non è stato attivato: `counts_lists` e `counts_entries` risultano assenti dopo l’errore del collegamento Supabase `Invalid or expired requestState`. Nessuna migrazione applicata, funzione distribuita o email reale inviata. La verifica di sincronizzazione e recupero nei browser riguarda il backend simulato, non certifica il servizio LIVE.

L’utente ha approvato vista e navigazione 3D nella prova reale. Questa revisione le conserva; non interviene sul calcolo «Adatta al terreno». I precedenti rifiuti numerici restano documentati nelle note 1.3.4. Non sono stati ripetuti i collaudi numerici estesi né certificati dispositivi Safari/iOS fisici.
