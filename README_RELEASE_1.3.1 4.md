# Release 1.3.1 — revisione terreno, filari e mappa

**Pacchetto di prova 1.3.1, aggiornamento 8 ottobre 2026.** I metadati dei due strumenti e APP_CONFIG sono coordinati a 1.3.1, ambiente LIVE; LIVE indica la configurazione, non una certificazione del rilascio. Le prove mirate descritte sotto appartengono alle rispettive snapshot. I controlli di cache sui sorgenti sono superati; le verifiche browser/PDF e ZIP finale estratto saranno registrate rispetto al suo hash effettivo. Restano difetti e controlli aperti: questo pacchetto non dichiara la piattaforma completamente pronta né pubblicata.

## Comportamento della revisione

La scelta **Manuale / Adatta al terreno** è raccolta nella curvatura filari, riferita alla porzione selezionata; non serve una sezione Terreno separata per i comandi. La fonte e i dati altimetrici restano nei riepiloghi. La proposta mostra le variazioni prima di Applica e non cambia il progetto salvato durante l'anteprima. Annullamento e ripristino devono conservare il progetto precedente anche in caso di errore o timeout.

Il contratto di Adatta al terreno richiede una curva di livello per ciascun filare e una distanza trasversale misurata sulla superficie, entro ±20 cm dall'interfila impostata. Su un versante piano inclinato le curve di livello sono rette: non si introduce una curvatura artificiale. Le porzioni divise dai passaggi mantengono i propri disegni; i tagli sono proposte da esaminare e applicare esplicitamente, con larghezza almeno 1,50 m e misure dei miglioramenti. I frammenti fisici risultanti devono avere due pali di testa ciascuno. La chiusura di questi requisiti richiede i controlli nativi e le regressioni finali; la presenza dei comandi non è una certificazione del disegno.

L'altimetria resta automatica: sorgente regionale Piemonte da 5 m quando disponibile e fallback nazionale da 10 m, con una sola fonte numerica per campo. Risoluzione, epoca, attribuzione e copertura sono conservate con il modello. Un DTM non è un rilievo centimetrico; inserire coordinate precise non ne aumenta la risoluzione. Copertura incompleta o risultati non verificabili conservano il progetto precedente e richiedono revisione, senza sostituire il terreno con un calcolo piano nascosto.

Il comando **3D** è sulla mappa comune. L'anteprima usa lo stesso modello con esagerazione verticale 1; camera e gesti non modificano quantità o geometrie. Alla chiusura si ripristinano camera, padding, gesti e visibilità 2D. La correzione della mappa evita riparazioni ripetute quando geometria, quote e ordine dei layer sono già aggiornati. La fluidità resta un problema aperto, distinto da queste verifiche funzionali.

I pulsanti hanno riscontro al passaggio del mouse. Il contatore mostra la filigrana senza rotazione e il logo Vivai Obice nel footer. Comfortaa rimane nell'interfaccia; il documento e l'esportatore nativo mantengono le famiglie precedenti. Selettore tool, Profilo, occhio, coordinate precise, conteggio autonomo e archivi precedenti rimangono parte dei controlli di compatibilità.

## Verifiche note e ancora necessarie

| Ambito | Evidenza disponibile | Limite attuale |
| --- | --- | --- |
| Riparazioni della mappa | 8 casi mirati e 68 regressioni superati sulla snapshot `032b937`; nel browser anonimo zero riscritture inutili, riordini ripetuti e sostituzioni delle quote nelle finestre ferme. | Verifica circoscritta, precedente al congelamento finale della revisione. |
| Funzioni 3D e camera | Gesti, camera, cambio campo e chiusura hanno prove funzionali con MapLibre 4.7.1 e Worker reali. | Touch emulato in Chromium; nessuna prova di fluidità su hardware o Safari/iOS. |
| Fluidità 3D | Chromium 153/SwiftShader: 366,7 ms fra frame nella finestra 3D caricata e ferma, 350 ms con ridisegno forzato; esperimento di solo maxzoom DEM ancora 333–416 ms. | Obiettivo locale inferiore a 150 ms fallito. Le prove funzionali non dimostrano fluidità; il cap sperimentale non è una modifica di produzione. |
| Storico e ripristino nativo | 8 ottobre: 8/8 casi mirati di storico, quantità e conservazione dei parametri e 5/5 casi di ripristino della sorgente esplicita o implicita superati sulle snapshot catturate. | Prove circoscritte; non sono la suite finale unica. Percorso manuale 1.2.6 e replay salvato 1.3.0 restano parte della compatibilità. |
| Estremo preciso e autorità della proposta | 8 ottobre: 1/1 caso Worker → anteprima parent → errore quota → retry → salvataggio/ricarica e 5/5 casi di policy superati. | Il confronto senza passaggio resta esplicitamente non valutato per la modifica dell'estremo; non è una prova generale di guadagno dei tagli. |
| Geometrie e ricerca dei tagli | Il baseline finito selezionato da 9 m ha superato 1/1 prova; il pacchetto SEARCH/area ha superato 7/7 casi dopo la correzione dell'oracolo indipendente di area per il baseline di un solo filare. | Casi nativi 8 e 17 e figlio canonico con estremi fisici finiti ancora irrisolti; nessuna accettazione generale di queste geometrie dichiarata. |
| Ripristino di un antecedente automatico dopo modifiche alle quantità | La validazione conserva il progetto corrente se il nuovo risultato non corrisponde al disegno automatico archiviato. | Questo caso non è certificato come ripristino riuscito; può richiedere un nuovo calcolo. |
| Campo e DTM reali | Campione richiesto non disponibile per il pilot congelato. | Pilot non eseguito; nessuna verifica specifica dichiarata per il campo reale. |
| Cache e navigazione Conteggi | Collector eseguito dopo l’allineamento delle query: 41 risorse uniche, uguaglianza ordinata con il precache e namespace finale 1.3.1; test di versione e cache superati. Scope limitato a `/conteggi/`. | Installazione reale, riapertura offline a freddo e tool handoff dello ZIP estratto ancora da verificare. |
| Documento, revisione e ZIP | Strumenti e controlli precedenti conservati. | QA browser/PDF, revisione dell'intero ramo, manifest e test sull'estrazione finale ancora da completare. |

I totali test e i risultati dei README precedenti appartengono alle release indicate; non sono il totale finale 1.3.1. Nessun deploy, migrazione SQL, modifica account/secret, invio commerciale o acquisizione privata è attestato da questa preparazione.

Le prove mirate dell'8 ottobre verificano il ripristino dopo creazione, sostituzioni ripetute, conservazione di porzioni estranee e ricalcolo delle quantità mutate. Anche dopo la modifica delle quantità vengono conservati i parametri originali e la presenza assente o vuota delle porzioni. La modifica locale della direzione di una porzione estranea forza il suo vero ricalcolo. Il ripristino dei baseline con `rowPortions` assente o vuoto completa il vero salvataggio e la riconciliazione della selezione dell'app, sia dalla sorgente originale sia dal figlio creato. Questi risultati sostituiscono i precedenti checkpoint ancora aperti per gli stessi casi, senza chiudere i difetti geometrici elencati sopra.

La prova dell'estremo preciso ha raggiunto l'anteprima reale del parent entro il limite condiviso di 500.000 nodi: 466.407 nodi nella transazione osservata. Un errore di quota conserva la proposta pronta; il retry salva una sola volta e la ricarica conserva il risultato. I cinque casi di policy verificano autorità e rifiuti, oltre all'uguaglianza dei figli, delle quantità e dell'envelope con la sostituzione generica. Non si sommano questi pacchetti come un totale finale; browser/PDF e integrità dello ZIP effettivo richiedono le proprie ricevute.

Sul congelamento dei sorgenti con query finali sono superati 154 controlli mirati, senza skip: compatibilità dei 144 campi legacy, replay 1.3.0, controller e storico, contatore e archivi locali, coordinate, passaggi, visibilità, impaginazione, ciclo 3D, versione e cache. Anche il controllo sintattico è superato. Questi 154 controlli non comprendono i gate geometrici irrisolti né costituiscono l’accettazione completa della release.

## Versione, cache e salvataggio

La versione pubblica dei due strumenti proviene da APP_CONFIG. I sei campi package/lock e il valore canonico sono 1.3.1; schema dei progetti, versione del modello, envelope e algoritmo mantengono le proprie identità. Dopo il congelamento, tutte le query entranti dei moduli modificati devono usare la stessa identità `v=1.3.1`, conservando gli altri parametri funzionali. Il precache va generato dal grafo reale, non da un numero di risorse storico.

Conteggi rimane locale sul dispositivo; sincronizzazione, amministrazione, trasmissione e trasferimento ospite hanno flag disattivati. Il worker controlla soltanto `/conteggi/`, attende il normale aggiornamento delle schede e conserva corrispondenza esatta per gli script con query. Dopo l'aggiornamento chiudere le vecchie schede e riaprire online, senza cancellare IndexedDB/localStorage. Il configuratore alla radice non è dichiarato offline.

Le quantità terreno non verificabili rimangono indisponibili anche nei riepiloghi e documenti. Le proposte e il salvataggio devono restare atomici: un errore conserva i dati precedenti. Le prove finali devono coprire anche storico, cambio campo/proprietario, risposte tardive e geometrie già salvate.

## Riproduzione e confezionamento

Frontend statico, senza build per l'hosting. Per riprodurre i controlli usare Node compatibile con le dipendenze bloccate:

```sh
npm ci
npm ci --prefix conteggi
node --test --test-concurrency=1 tests/*.test.mjs
npm run check
```

Il comando della suite è da eseguire in una finestra senza altri carichi numerici o browser. I gate pesanti possono essere registrati separatamente, riportando gli skip della suite filtrata e gli esiti dei gate reali; non cambiare i limiti per ottenere un risultato positivo. La rigenerazione `node scripts/build-counts-offline.mjs` va eseguita dopo l'allineamento finale delle query, poi verificata senza riscrivere SW.

I runner browser richiedono Playwright/Chromium e gli asset locali MapLibre 4.7.1/Draw 1.5.0. Eseguire script e application root dalla medesima estrazione verificata, senza fallback al checkout; destinare log, PDF e immagini a una cartella esterna. Le fixture anonime di Auth/provider non provano servizi di produzione. La prova UI Conteggi che sostituisce il boot non certifica il worker reale o il ritorno al configuratore.

Il manifest riferisce il commit sorgente congelato e gli hash dell'inventario ordinario tracciato consegnato, esclusi il manifest stesso e tutti gli appunti interni `.superpowers/`. Specifiche pubbliche e fixture numeriche anonime restano incluse. `Vivai_Obice_Piattaforma_v1.3.1.zip` ha radice piatta con `index.html` e `conteggi/`; inventario, hash e byte sono confrontati di nuovo dopo estrazione e prove sui suoi file. Dipendenze installate, checkout, log correnti, dati privati e ZIP annidati sono esclusi. Gli esiti successivi di cache e browser/PDF sono associati all'hash dello ZIP verificato; non vengono dichiarati superati prima dell'esecuzione.

Per caricamento e rollback leggere [LEGGIMI_CARICAMENTO_UNICO.md](LEGGIMI_CARICAMENTO_UNICO.md) e [PUBBLICAZIONE.md](PUBBLICAZIONE.md). Conservare i pacchetti precedenti e gli archivi del browser; la pubblicazione statica non attiva il backend Conteggi.
