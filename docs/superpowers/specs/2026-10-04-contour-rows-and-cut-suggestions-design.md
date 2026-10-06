# Filari a quota costante, passaggi suggeriti e 3D sulla mappa

Data: 4 ottobre 2026. Base: release 1.3.0, commit `5011c7e03d7a59201f7c50ae5e34171f4e7f2a15`. Stato: specifica approvata da Marco il 5 ottobre 2026; piano di implementazione in `docs/superpowers/plans/2026-10-05-contour-rows-and-cut-suggestions.md`. Nessuna modifica al prodotto o nuova release con la sola approvazione della specifica.

## Risultato concordato

Ogni filare generato da **Adatta al terreno** deve seguire la propria quota sul modello altimetrico. L'interfila è misurata a terra e può variare di **±0,20 m** dal sesto impostato: con 3 m, intervallo ammesso 2,80–3,20 m. La quota costante ha priorità; la tolleranza permette di cercare una buona copertura mantenendo distanze regolari. Questa scelta sostituisce, per il nuovo adattamento, il precedente vincolo di interfila mai inferiore al valore nominale.

Le porzioni separate da passaggi hanno famiglie di filari indipendenti. Dove i filari convergono troppo, il programma può suggerire un passaggio da **1,50 m o più**, ricalcolare le parti ottenute e mostrare il beneficio. Il suggerimento rimane un'anteprima: l'utente lo applica o lo scarta. Non si applicano tagli o esclusioni in modo automatico.

Su un versante uniformemente inclinato le curve di livello sono rette: l'adattamento deve produrre filari dritti e paralleli, con passo orizzontale ridotto rispetto al passo sul terreno. Sui terreni variabili si generano vere curve di livello per ciascun filare, anziché traslare una sola guida. L'obiettivo è la migliore copertura fra le disposizioni effettivamente valutate e valide, senza dichiarare un massimo globale dimostrato.

## Interfaccia

| Elemento | Comportamento |
|---|---|
| 3D | Icona sulla mappa comune a mappa principale, Campi ed editor, su desktop e touch; stato 2D/3D riconoscibile. |
| Navigazione 3D | Zoom, rotazione e inclinazione fluidi. Le gesture 3D si attivano temporaneamente; tornando in 2D, dopo errore o cambio campo/account, si ripristinano camera e stato precedente di ogni handler. Conservare pan del trackpad, rotazione con modificatori e policy touch della 1.2.6. Gli strumenti di modifica operano in 2D. |
| Curvatura filari | Scelta compatta **Manuale / Adatta al terreno** nella sezione esistente, riferita alla porzione selezionata. Manuale mantiene orientamento, punti curva e modifica sulla mappa. |
| Ripristino | Comando **Ripristina disegno precedente** della porzione, disponibile anche dopo Applica. Non coincide con Annulla della proposta. |
| Fonte e pendenza | Dati sintetici nei riepiloghi del campo/progetto, con fonte, risoluzione, epoca e licenza in dettaglio espandibile. Eliminare la scheda Terreno dedicata ai pulsanti. |
| Proposta | Anteprima sulla mappa e confronto sintetico di metri, barbatelle, filari/frammenti e pali; Applica/Annulla nello stesso contesto della curvatura. Nessuna schermata aggiuntiva obbligatoria. |
| Passaggio suggerito | Evidenziato sulla mappa, con larghezza e confronto superficie occupata/utile, filari, metri e barbatelle. Applicazione esplicita. |

Comfortaa, palette, selettore tool, Conteggi, profilo, stampa e gesti normali della 1.2.6 restano i riferimenti. Il font dei PDF resta quello precedente. I controlli della mappa devono avere nomi accessibili e bersagli touch adeguati senza grandi spiegazioni permanenti.

## Misure separate dalla forma

L'acquisizione altimetrica resta automatica, con DTM Piemonte 5 m e fallback nazionale TINITALY 10 m, una sola fonte congelata per campo. Acquisire quote o aprire il 3D non cambia disegno o quantità salvate.

La scelta Manuale mantiene gli assi disegnati. Una proposta misurata sul terreno può calcolarne lunghezze e quantità senza trasformarli in curve di livello. In Adatta al terreno, invece, si cambia esplicitamente la geometria della porzione. La proposta mostra le differenze e si salva con Applica. La prima conversione alla metrica terreno conserva il controllo atomico dell'intero campo e mostra le variazioni delle altre porzioni; soltanto la porzione richiesta passa alla nuova modalità automatica.

Conservare superficie orizzontale e superficie sul terreno come valori distinti. La seconda serve alla stima teorica di densità; le quantità definitive derivano dalle lunghezze coltivabili reali, dai sesti e dai tagli. Distanza piante/pali e capezzagne si misurano lungo il filare sul modello. Due pali di testa per ogni frammento fisico, senza nuove teste ai nodi del DTM. I passaggi interni non generano capezzagne aggiuntive.

Dislivello e pendenza visualizzati devono essere calcolati all'interno del campo o della porzione interessata, comprese le intersezioni del perimetro con la superficie. Non usare gli estremi dell'intera finestra acquisita, che contiene margini esterni. I dettagli della fonte rimangono riferiti al modello originario, con attribuzione e licenza conservate.

## Nuovo motore automatico

### Filari di livello

1. Usare la superficie triangolata continua del DTM congelato. Ogni asse automatico è identificato dalla quota `h`; tutti i suoi punti soddisfano `z=h`, con scostamento massimo numerico di 0,001 m sul modello, verificato su tutti i segmenti e non soltanto agli estremi. Questa soglia è un requisito di calcolo; la precisione reale rimane quella del rilievo.
2. Estrarre e collegare le intersezioni delle facce con quel livello. Clippare contro perimetro, porzione, esclusioni e passaggi reali. Le coordinate del filare sono continue attraverso le facce; un nodo della griglia non interrompe il filare.
3. Individuare famiglie aperte coerenti e non ramificate per la porzione. Valutare differenti quote iniziali e quote dei filari successivi per rispettare il sesto. Una sola quota iniziale centrale non è una ricerca sufficiente.
4. Su superfici pianeggianti, dove la direzione delle curve di livello è indeterminata, mantenere direzione, fase e disegno manuale compatibile. Su un piano inclinato usare il caso analitico rettilineo. Non incurvare un piano per effetto della costruzione del metodo numerico.
5. La direzione manuale è un riferimento di scelta fra famiglie compatibili; non è un obbligo che consenta di attraversare quote differenti mantenendo un filare di livello. Conservare i parametri manuali per il ripristino.
6. Anelli, biforcazioni, convergenze o copertura non verificabile producono una diagnosi localizzata e nessuna applicazione invalida. Dove possibile, la diagnosi alimenta la ricerca del passaggio suggerito.

Non introdurre una lisciatura nascosta del modello o curve grafiche che lascino la quota del filare. Un'eventuale futura generalizzazione del DTM o tolleranza altimetrica diversa richiede una scelta distinta; non è inclusa in questa revisione.

### Interfila ±20 cm

La verifica riguarda la distanza trasversale locale sulla superficie tra filari adiacenti, lungo i tratti in cui sono affiancati nella stessa zona coltivabile. La direzione trasversale parte normale al filare sul terreno e segue la normale alle isolinee sulla superficie continua. Verificare in entrambi i versi fra le file adiacenti; le componenti clippate mantengono la quota e l’ordine della famiglia originaria. Sono adiacenti i filari consecutivi per quota che delimitano la stessa fascia coltivabile senza un altro asse interposto. Conservare separatamente anche una verifica di non incrocio e distanza minima per evitare avvicinamenti obliqui non intercettati dal solo campionamento normale.

Il rapporto di validazione contiene intervalli conservativi, estremi, posizioni dei tratti critici ed errore numerico. Per essere valido, il limite inferiore deve essere almeno `s−0,20 m` e quello superiore al massimo `s+0,20 m`. Verificare tutta la parte affiancata, non soltanto pochi campioni, la minima globale o la distanza di un solo segmento. Il limite superiore può essere esentato soltanto quando la misura trasversale incontra un confine reale della porzione, una capezzagna o un’esclusione prima del filare vicino. Un filare omesso, un tentativo fallito o un tratto non verificato all’interno non possono diventare un’esenzione. La verifica di avvicinamento rimane valida anche presso le estremità. Dichiarare i tratti irrisolti e non considerarli verificati.

Se il metodo non riesce a certificare il tratto entro il budget, il risultato resta non applicabile e la precedente geometria è conservata. Non dichiarare valido un risultato limitandosi a un'immagine plausibile.

### Ricerca e riempimento

Valutare quote iniziali e famiglie candidate con ricerca deterministica e potatura dei casi incompatibili. Ordinamento: conformità a quota/interfila e regolarità; poi maggiore superficie servita da una famiglia valida; poi maggiore lunghezza coltivabile e quantità; a parità minore scostamento dal sesto nominale e minore complessità. Conservare gli indicatori e la ragione della scelta. La superficie servita è l’area dell’unione delle fasce sulla superficie della famiglia, clippata al campo, con fasce laterali limitate a mezzo interfila nominale. Misurare l’area assoluta servita. Il denominatore della percentuale rimane la superficie coltivabile prima del taglio proposto, identica per tutti i candidati: ridurre il terreno con una strada non deve aumentare artificialmente la copertura. Non equivale automaticamente a tutta l’area della porzione.

Filari incompleti ai bordi, esclusioni e tagli possono cambiare il numero di frammenti senza aumentare gli assi: mostrare entrambi nei confronti tecnici. Non scegliere una soluzione solo perché un passaggio ha raddoppiato il conteggio dei frammenti.

## Passaggio suggerito

La convergenza viene localizzata dai tratti di verifica dell'interfila o dai punti critici delle curve di livello. Cercare tagli semplici che rimuovano la zona incompatibile e separino realmente la porzione in parti progettuali indipendenti. Il taglio deve raggiungere confini utili; un foro interno che lascia le parti collegate non è una divisione in porzioni.

Proposta iniziale per contenere ricerca e superficie sacrificata: un solo nuovo passaggio per suggerimento; larghezza iniziale 1,50 m e candidati più larghi fino a 5 m. Preselezionare geometricamente le posizioni, poi verificare al massimo tre soluzioni complete entro il budget complessivo. Il limite di 5 m riguarda i suggerimenti di questa prima revisione; non modifica i passaggi esistenti. Non eseguire una sequenza ricorsiva di nuovi tagli senza controllo dell'utente.

Per ogni candidato: creare una copia temporanea, aggiungere il corridoio, derivare le nuove porzioni, ricalcolare le loro famiglie indipendenti e validare quota, interfila, frammenti e pali. La larghezza nominale dei nuovi suggerimenti viene verificata sul modello lungo la normale all'asse del passaggio. La vista dall'alto può quindi avere larghezza apparente diversa. Conservare geometria autorevole, asse originale non clippato, larghezza, gruppo e porzione di applicazione; clippare contro la porzione interessata e le sue esclusioni, senza attraversare e modificare porzioni estranee; la modifica numerica degli estremi deve preservare la larghezza dichiarata. I vecchi passaggi continuano a usare i poligoni salvati senza riallargamento o conversione silenziosa.

Suggerire solo soluzioni completamente valide con migliore copertura rispetto alla migliore disposizione valida senza il nuovo taglio. Se senza taglio nessuna disposizione è valida, confrontare la proposta con il disegno salvato, indicando chiaramente che quel riferimento non è certificato con il nuovo criterio; non pubblicare quantità di un tentativo invalido. Mostrare sempre costo di superficie, metri, barbatelle e aumento delle teste reali.

**Applica passaggio** salva insieme corridoio, nuove porzioni, disegno e quantità dopo un checkpoint riuscito. Annulla conserva tutti i dati precedenti. Le porzioni estranee al taglio conservano identità e risultati. Un passaggio più largo o una nuova inclinazione non sono considerati una soluzione finché il ricalcolo non lo dimostra.

## Ripristino del disegno

Conservare un solo livello di ripristino per porzione modificata: modalità, orientamento, punti manuali e assi/risultato precedenti, legati al modello e agli input comuni. Conservare anche l’identità della base di quantità e le impronte di modello, parametri comuni e topologia. Non duplicare la griglia DTM nel ripristino. La proposta annullata non sostituisce questo riferimento.

Ripristinare una porzione lascia inalterate le altre. Con modello e parametri comuni invariati, ripristinare esattamente la precedente geometria e il risultato compatibile. Se il contesto è cambiato, ricostruire una proposta dal riferimento manuale e richiedere una nuova applicazione; non ripristinare quantità obsolete. Il comando Manuale deve eliminare esplicitamente la guida automatica attiva, senza riutilizzarla perché i valori degli slider sono rimasti identici.

Per un suggerimento di taglio, conservare il precedente assetto dell'intero gruppo coinvolto come un'unica operazione: il ripristino rimuove il nuovo corridoio e ricostruisce le porzioni precedenti insieme. Se parti derivate hanno poi ricevuto modifiche indipendenti, segnalare il conflitto prima di rimuoverle. Non eliminare lavoro successivo in silenzio.

I progetti 1.3.0 già applicati non hanno una copia precedente garantita: non mostrare un ripristino esatto inesistente. Offrire Manuale dai parametri conservati tramite una nuova proposta, eliminando esplicitamente la guida automatica; conservare il ripristino esatto soltanto per le nuove operazioni che ne hanno registrato la base.

Salvataggio locale, cloud, esportazione e riapertura devono conservare il livello di ripristino disponibile. In caso di limite di spazio, non applicare l'operazione promettendo un ripristino non memorizzato.

## Architettura, compatibilità e tempi

Separare: modello e misure; estrazione di isolinee; costruzione/validazione delle famiglie; ricerca del passaggio; proposta/checkpoint/ripristino; comandi della mappa. Il nuovo disegno ha un'identità/versione distinta dal motore `terrain-face-chart-1` della 1.3.0. I suoi risultati salvati restano leggibili senza trasformazione automatica. Separare l’interpretazione per versione e conservare gli hash del vecchio envelope: aggiungere valori predefiniti ai rowPortions durante la lettura può invalidare gli input hash delle revisioni 1.3.0. La migrazione avviene solo con una nuova proposta applicata e tutti i riepiloghi riconoscono entrambe le versioni. Le nuove informazioni per porzione attraversano normalizzazione, archivio, Admin, report e condivisione senza duplicare il modello.

Conservare il ramo manuale senza terreno della 1.2.6 e i 144 confronti completi della baseline. Il nuovo algoritmo si usa solo su una nuova proposta esplicita. Nessuna pubblicazione o migrazione SQL fa parte della progettazione.

Il limite attuale di 10 secondi è imposto da controller, worker client e solver. Profilare ciascuna fase con griglie reali e fixture rappresentative prima di attribuire il timeout a una singola causa. Il motore deve usare indici spaziali e cache per la superficie e per i livelli, evitando scansioni di tutte le facce per ogni confronto fra segmenti.

Budget proposti della revisione: fino a 30 secondi per un adattamento e 60 secondi complessivi per la ricerca di un taglio, in worker cancellabile, con fasi visibili e risposte tardive scartate dopo cambio input/campo/account. I tre componenti devono condividere lo stesso limite configurato. Un timeout deve essere distinto dall'incompatibilità geometrica; nessuna quantità non verificata viene salvata. I budget sono proposte tecniche, da confermare con la specifica e collaudare; il risultato non è garantito solo aumentando il tempo.

Mantenere i tetti iniziali: 262.144 celle native, 500.000 nodi, 1 MiB per campo canonico e 4 MiB per snapshot effettivo, includendo i ripristini. Un nuovo budget di tempo non autorizza aumenti impliciti di memoria o risoluzione. Il salvataggio atomico precede ogni cambio di stato applicato; errori di quota mantengono dati e proposta recuperabile.

## Collaudo richiesto

- Piano piatto: nessuna direzione inventata, disegno manuale compatibile conservato. Piano inclinato uniforme: filari dritti; con pendenza trasversale 20%, 3 m sul terreno corrispondono a circa 2,942 m in proiezione.
- Terreno variabile: quota costante lungo ciascun asse, anche fra i nodi, e certificazione continua dell'interfila nel range. Caso in cui una sola curva guida con offset fallisce questi criteri.
- Interfila: controllo bidirezionale, esclusione che interrompe realmente la misura, filare interno omesso che deve fallire, estremità troppo vicine e percorso con estremi alla stessa quota ma dosso intermedio.
- Convergenza: passaggio da 1,50 m sufficiente; passaggio da 1,50 m insufficiente ma più largo valido; nessun taglio valido; foro che non separa la porzione; beneficio apparente dovuto solo al numero di frammenti o alla riduzione del denominatore di copertura; larghezza e porzione del nuovo taglio conservate dopo coordinate precise, modifica estremi e riapertura.
- Campo a L con due porzioni: adattamento e ripristino di una porzione conservano l'altra. Applicazione e ripristino del taglio atomici; pali di testa corretti e nessuna capezzagna sulle estremità interne.
- Quote/dislivello/pendenza entro il campo: rilievo esterno più ripido non altera il riepilogo. Fonte e licenza disponibili in stampa e dettagli.
- Errore di quota, limite di budget, cambio account/campo/input e annullamento: nessuna mutazione parziale o risposta tardiva applicata. Ripristino mantenuto dopo riapertura e trasferimento fra dispositivi.
- 3D desktop/touch: gesture fluide, nessuna modifica alle quantità, ritorno 2D con camera/visibilità/gesti precedenti e strumenti utilizzabili. Interfaccia manuale e tool Conteggi conservati.
- Suite completa, 144 confronti 1.2.6, replay dei risultati 1.3.0, PDF/font/quote/tag, verifiche di archivio/Admin/condivisione e ZIP unico.
- Campioni reali indicati da Marco: Cascina Elena, Chardonnay - 775P (porzioni 1 e 2) e Pinot Nero. Geometrie, sesti e modello congelato non sono stati acquisiti in questa revisione: la riproduzione specifica del timeout e della curvatura resta subordinata alla disponibilità di questi dati. Le fixture anonime non sostituiscono questo collaudo.

## Riferimenti

- Decisioni di Marco nella conversazione del 4 ottobre 2026, ore 23:27–23:44 Europe/Rome: quota prioritaria, tolleranza ±20 cm e passaggio suggerito verificato.
- Specifica precedente: `docs/superpowers/specs/2026-10-04-terrain-vineyards-design.md`. Questa revisione sostituisce il criterio della singola guida e della distanza minima nominale, la collocazione dei controlli e la mancanza di ripristino; conserva fonti, persistenza e invarianti di compatibilità.
- USGS, curve di livello e quota: https://www.usgs.gov/ngp-standards-and-specifications/us-topo-cartographic-specifications-map-symbol-guide
- Regione Piemonte, metadati ICE DTM 5: https://www.geoportale.piemonte.it/geonetwork/srv/api/records/r_piemon:224de2ac-023e-441c-9ae0-ea493b217a8e
