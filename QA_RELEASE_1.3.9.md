# Collaudo 1.3.9 — Adatta al terreno

Adattamento, applicazione, riapertura e annullamento hanno superato 88 confronti esatti nelle interfacce desktop e mobile. La suite completa comprende 1985 test: 1980 passati e cinque failure già presenti nella 1.3.8. Nessuna nuova failure, nessun test saltato o cancellato. La suite non viene dichiarata interamente verde.

## Metodo e comportamento conservato

I filari seguono quote costanti sul modello altimetrico acquisito; l'interfila è misurata sul terreno con la tolleranza approvata di ±20 cm. Le porzioni rimangono indipendenti. Sono ridotte ricostruzioni e verifiche duplicate dello stesso contenuto esatto; le verifiche autorevoli prima di applicare, salvare, stampare o ripristinare restano complete.

La sola rappresentazione dei nuovi filari nativi marcati può eliminare punti ridondanti entro 1 cm. Assi, quote, distanze, lunghezze e quantità continuano a usare il modello completo. I progetti precedenti non marcati conservano il percorso storico.

I checkpoint grandi possono essere compressi senza perdita; le righe duplicate sono memorizzate una sola volta e ricostruite alla lettura. I confini di 1 MiB si applicano al campo effettivamente salvato e quelli di 4 MiB al progetto completo decodificato. Le prove includono accettazione esatta al confine, rifiuto di un byte aggiuntivo e di overflow UTF-8, confronto letterale di righe e storico, nessun salvataggio o cambiamento dei campi estranei dopo un rifiuto.

Il controllo leggero che mostra il tasto di ripristino è soltanto indicativo. Il click continua a eseguire una verifica numerica fresca: una geometria alterata non può avviare il worker o il salvataggio.

## Prove nelle interfacce reali

Campo a L sintetico, due porzioni separate da un passaggio da 1,50 m, modello nativo su griglia 65 × 65 con passo di 5 m. Il browser è Chromium 153.0.8010.0. Desktop e mobile sono eseguiti in sequenza; il mobile usa touch emulato a 390 × 844. Autenticazione, servizi e scritture cloud e acquisizione esterna di immagini/altimetria sono simulate; controller, solver, worker, salvataggio locale e replay sono quelli della piattaforma.

| Schermata | Confronti esatti | Nodi worker massimi | Tempo worker massimo | Proposta in schermata | Applica in schermata | Riapertura parziale |
|---|---:|---:|---:|---:|---:|---:|
| 1440 × 1000 | 44/44 | 476839 | 20,353 s | 42,294 s | 35,047 s | 12,847 s |
| 390 × 844 | 44/44 | 476839 | 19,712 s | 42,781 s | 34,257 s | 12,164 s |

Sono verificati proposta e annullamento, applicazione delle due porzioni, conservazione della porzione non modificata, salvataggio e riapertura reali, rilettura JSON con un budget nuovo, modifica manuale annullata, entrambi i ripristini alle rispettive basi effettivamente catturate, ordine originale delle porzioni e codec del salvataggio. Il controllo occhio nasconde e mostra entrambi i nomi; 3D e ritorno 2D lasciano invariati progetto, righe, quantità e dati della mappa.

Il replay fresco del progetto adattato richiede 383.962 nodi: 9,785 s su desktop e 10,306 s nel browser mobile. Il campo salvato misura 996.365 byte. Ogni operazione worker rimane entro 500.000 nodi e 30 secondi. I tempi complessivi della schermata includono più fasi e restano sotto la soglia di collaudo di 45 secondi. Questi sono tempi osservati nell'ambiente di prova, non una garanzia per ogni terreno o dispositivo.

188 SHA dei sorgenti serviti corrispondono al codice verificato. Nessun errore JavaScript non gestito, nessuna richiesta esterna reale o scrittura cloud nel collaudo. Le richieste catasto intenzionalmente bloccate generano messaggi di risorsa non caricata, registrati nelle ricevute di prova.

## Compatibilità della piattaforma

- 144 campi manuali indipendenti conservano i risultati completi della 1.2.6.
- Il report non adattato conserva metriche storiche e HTML rilasciato nella 1.3.8: SHA-256 053c24ecf754fd76031b6c825b4463bcf54c0cb77235e1c1aecd72fce0e59cef.
- Conteggi, accesso ai tool, sincronizzazione locale e gestione dei conflitti sono inclusi nella suite; il logo del contatore è verificato in Chromium su tre dimensioni di schermo.
- Sintassi, build offline e versione delle risorse passano. La build contiene 49 risorse e non cambia i byte del service worker collaudato.
- Tutti i 738 file originali sono conservati; lo ZIP contiene 765 file ordinari della piattaforma, inclusi i test e le licenze.

La base è lo ZIP completo 1.3.8 con SHA-256 33c0aedc381a328c419662954a7d2569dcb9b5e6fb872bec759b72d408f2f07d. Il runtime verificato nel browser è il commit 7e2993608fafa710d8bfb06551bccdc0c6eccc14. La suite completa verifica 1b04f5d93bbbe60123880a91ca297f2957f02ab6; la differenza riguarda soltanto quattro file di supporto ai test, senza modificare codice applicativo o criteri numerici. I documenti finali e il manifest vengono aggiunti dopo questa verifica.

## Limite ancora aperto

Cinque test di certificazione costruttiva dei tagli nativi automatici falliscono anche sulla base 1.3.8. In questi casi complessi non è disponibile una famiglia completa certificata: la proposta viene respinta e il progetto precedente è conservato. I criteri esatti di contatto non sono stati allentati e non vengono applicate famiglie parziali.

- native nonsplit replacement keeps original width and restores the complete previous split group
- actual canonical cut child finite closed physical caps certify A and B on regular plane boundary
- current V2 replacement preserves owner width and cached foreign result while retiring all old split children coherently
- scoped cut candidate seam certifies a real complete single level when heterogeneous progressions fail
- actual native five-metre crease cut certifies the constructive filled families and fixed-reference gain

La suite termina con exit code 1 per queste cinque failure preesistenti. Il manifest riporta conteggi, confronti con la base, limiti, hash delle ricevute e controlli di integrità.

## Ambito della prova e caricamento

Non erano disponibili geometria e DEM privati di Cascina Elena Chardonnay 775P. Non sono stati provati Safari o un dispositivo mobile fisico. Nessuna pubblicazione, migrazione o attivazione server è stata eseguita. Lo stato corrente dei servizi server Conteggi non è stato verificato; l'ultimo stato documentato del 9 ottobre 2026 indicava attivazione pendente.

Il formato nuovo richiede 1.3.9 o successiva per riaprire, stampare e annullare i salvataggi che lo utilizzano. Conservare backup ed export precedenti e gli archivi del browser. Caricare il contenuto completo dello ZIP nella radice, come nei rilasci precedenti.

Per ripetere i controlli locali, installare le dipendenze di test usando entrambi i lock e poi eseguire:

    npm ci --ignore-scripts --no-audit --no-fund
    npm ci --prefix conteggi --include=dev --ignore-scripts --no-audit --no-fund
    npm run check
    npm run offline:build
    node --test --test-concurrency=1 tests/*.test.mjs

Il collaudo completo è durato 457,159 secondi. I file delle dipendenze di test non fanno parte del pacchetto pubblicabile.
