# Collaudo 1.3.10

La suite seriale completa comprende 2017 test: 2012 passati, cinque falliti, nessun test saltato o cancellato. I cinque titoli falliti coincidono con quelli della versione 1.3.9. Il comando termina con exit code 1: la suite non viene dichiarata interamente verde. Durata osservata: 481,288 secondi.

Il codice e i file di test sono rimasti invariati per tutta l’esecuzione finale. La ricevuta dell’inventario verificato ha SHA-256 `d05225affed2722790c4642a16ab60c03b5c17145217eea708c36765ec1cfa74`. Il manifest del pacchetto contiene i conteggi, i titoli delle failure, la ricevuta browser e gli hash di tutti i file ordinari, escluso il manifest stesso.

## Caso reale: Cascina Elena Chardonnay 775P

È stata usata la configurazione salvata confermata dall’utente: una sola sezione, interfila 2,50 m, capezzagne 4 m, nessun passaggio o zona esclusa. È stato acquisito il modello regionale Piemonte dal servizio ufficiale già previsto nella piattaforma, senza modificare la geometria salvata. Il modello nativo comprende 28 × 54 campioni a passo di 5 m. Le coordinate, il modello e le ricevute dettagliate restano separati dal pacchetto pubblico.

I due tentativi uniformi della 1.3.9 falliscono una verifica esatta dopo il taglio delle capezzagne: sono state trovate distanze di circa 1,306 m in facce native condivise, inferiori a 2,30 m. Il precedente certificato sufficiente era inoltre inconcludente a causa delle pendenze dell’altimetria acquisita fuori dal campo.

La nuova progressione dipendente dalla pendenza propone 20 quote. Si interrompe dopo tre quote perché una coppia obbligatoria presenta un percorso di superficie esatto di **[2,2647253714914526; 2,264725371491453] m**. Non viene restituita una famiglia parziale. La replica finale usa 62.675 nodi e 1,387 secondi. Esito: `review-required`, nessuna applicazione, progetto invariato.

Una verifica separata del filare connesso a quota 500 m trova un conflitto continuo fra due suoi tratti. Un incremento di quota fino a 0,70 m produce un collegamento in una stessa faccia nativa lungo al massimo 1,861247678 m, sotto il minimo di 2,30 m e conservato dopo le capezzagne. Nell’altro tratto, un percorso di superficie lungo al massimo 2,70 m può guadagnare al massimo 0,564810610 m di quota. Non esiste un incremento successivo compatibile per questo filare. La prova usa 61.948 nodi e 2,738 secondi. Non dimostra l’impossibilità globale di ogni fase o di ogni suddivisione.

Un taglio esplorativo a metà fra i tratti problematici non ha risolto le incompatibilità numeriche campionate. Non è stato trasformato in una proposta certificata o applicato al progetto. La progettazione di una suddivisione efficace rimane aperta.

## Interfacce reali

Chromium locale, applicazione, controller, worker e solver reali. Autenticazione, servizi esterni e immagini sono simulati; il modello del campo è quello acquisito. Nessuna richiesta esterna o scrittura cloud durante il collaudo browser.

| Schermata | Controlli | Schermata pronta | Tempo worker | Nodi worker |
|---|---:|---:|---:|---:|
| Desktop 1440 × 1000 | 27/27 | 1,270 s | 0,961 s | 62.679 |
| Mobile 390 × 844 | 27/27 | 1,218 s | 0,867 s | 62.679 |

Entrambe le interfacce mostrano «2,26 m — minimo 2,3 m» nella mappa e nel pannello; nessun limite di calcolo, proposta applicabile o tasto Applica. Progetto completo, campo salvato e righe della mappa rimangono identici. Sono provati modifica manuale, pan della mappa, nomi, passaggio 3D/2D, profilo, navigazione Conteggi e ritorno con rilettura. Nessun errore JavaScript o console. Gli hash dei sorgenti serviti corrispondono ai file verificati.

SHA-256 della ricevuta browser: `8a40390f7ca7a981fea32dc2ef4bc3cd382fa304085245ed47344310b1007eb7`.

## Correttezza e compatibilità

I test nuovi includono una famiglia completa valida su un pendio con altimetria esterna molto più ripida, verifica indipendente alla rilettura, operazioni reali delle capezzagne, rifiuto di sorgenti alterate, rispetto dei budget, impossibilità di riutilizzare un certificato pubblico copiato e distinzione fra un percorso troppo corto dimostrato e un limite euclideo inconcludente. Le quote numeriche del generatore non concedono autorità per applicare un disegno.

La verifica inferiore considera tutte le coppie di filari. La verifica superiore usa percorsi continui sulla superficie nativa, partizioni razionali complete e controlli dei confini fisici. L’area servita è una unione conservativa verificata, vincolata a un certificato privato della stessa operazione. La rilettura ricostruisce la prova dai dati effettivi.

La suite comprende i confronti manuali storici, 3D, Conteggi, profilo, visibilità e nomi dei campi, report, salvataggio e ripristino. Sintassi e build offline passano; la build Conteggi conserva 49 risorse. Limiti numerici, precisione dei contatti e formati di salvataggio non sono allentati.

## Cinque failure preesistenti

- native nonsplit replacement keeps original width and restores the complete previous split group
- actual canonical cut child finite closed physical caps certify A and B on regular plane boundary
- current V2 replacement preserves owner width and cached foreign result while retiring all old split children coherently
- scoped cut candidate seam certifies a real complete single level when heterogeneous progressions fail
- actual native five-metre crease cut certifies the constructive filled families and fixed-reference gain

In questi casi complessi i tagli automatici non producono ancora una famiglia completa certificata. Il disegno precedente viene conservato. Nessuna pubblicazione remota, modifica dei dati dell’utente o migrazione è stata eseguita. Safari e telefoni fisici non sono stati provati in questa sessione.

Per ripetere il collaudo del pacchetto:

    npm ci --ignore-scripts --no-audit --no-fund
    npm ci --prefix conteggi --include=dev --ignore-scripts --no-audit --no-fund
    npm run check
    npm run offline:build
    node --test --test-concurrency=1 tests/*.test.mjs
