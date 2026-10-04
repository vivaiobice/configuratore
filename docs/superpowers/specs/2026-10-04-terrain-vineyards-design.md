# Altimetria automatica e filari sul terreno — progetto

Data: 4 ottobre 2026. Base applicativa: piattaforma unica Vivai Obice 1.2.6, commit `7b1e0165e559cbd66864af1751dfc6fa7b2617a5`. Stato: progettazione; nessuna implementazione o distribuzione della funzione.

## Obiettivo e scelte dell’utente

Marco vuole considerare il rilievo del terreno per progettare numero, lunghezza e curvatura dei filari, con una semplice vista 3D. L’interfila serve alle macchine operatrici: è la misura a terra fra gli assi dei filari. La funzione deve conservare la semplicità dell’interfaccia e le porzioni indipendenti separate dai passaggi.

Scelte confermate il 4 ottobre:

- Solo altimetria automatica; nessun inserimento manuale della pendenza e nessun import di rilievi nella prima funzione.
- Fonte regionale Piemonte per cominciare e soluzione nazionale ove possibile.
- Funzione **Segui il terreno** approvata.
- Interfila misurata sul terreno, non sulla proiezione orizzontale della mappa.

La proposta tecnica usa Piemonte DTM 5 m e TINITALY 1.1 a 10 m. La distanza richiesta ha priorità rispetto all’aderenza perfetta alle curve di livello. Il risultato è una stima di progettazione basata sul modello altimetrico disponibile: la risoluzione del dato, i confini disegnati e l’epoca del rilievo limitano la precisione sul campo.

## Significato delle misure

| Voce | Contratto nel nuovo modo terreno |
|---|---|
| Interfila | Distanza minima lungo la superficie del modello, tra assi di filari adiacenti della stessa porzione, localmente normale alla direzione del filare sulla superficie. |
| Distanza fra piante e pali | Misura cumulata lungo il filare appoggiato al terreno. |
| Metri filari | Somma delle lunghezze sul terreno dei frammenti coltivabili effettivi. Conservare anche la lunghezza orizzontale come dato distinto. |
| Superficie | Conservare la superficie orizzontale attuale; aggiungere superficie del terreno come valore distinto. Non sostituire area orizzontale/catastale con area inclinata. |
| Numero di filari | Conservare `rowCount` come conteggio dei frammenti fisici del motore attuale. Identificare separatamente gli assi continui per non creare nuove teste a ogni campione del modello. |
| Pali di testa | Due per ciascun frammento fisico valido, secondo il comportamento attuale. |
| Capezzagne | Nel modo terreno, arretramento misurato lungo il filare sul terreno, una sola volta sulle estremità al perimetro originario. Nessuna capezzagna aggiunta ai passaggi interni. |
| Passaggi e aree escluse già salvati | Il poligono reale salvato resta l’autorità per il taglio. L’attivazione dell’altimetria non allarga né sposta una strada già disegnata. |

La minima interfila è un vincolo geometrico scelto dall’utente; la funzione non deduce ingombri o idoneità di una macchina specifica. La verifica va eseguita sulla superficie senza amplificazione visiva del rilievo.

## Fonti automatiche e accesso verificato

| Fonte | Copertura e risoluzione | Accesso e limiti |
|---|---|---|
| Regione Piemonte, ICE DTM 5 | Piemonte; terreno LiDAR, passo 5 m; rilievo 2009–2011. Precisione in quota dichiarata ±0,30 m, ±0,60 m in aree di minore precisione. | CC BY 4.0. WCS e GeoTIFF numerici disponibili; prova di piccola finestra riuscita. |
| INGV TINITALY 1.1 | Intero territorio italiano; terreno, passo 10 m; versione gennaio 2023 che corregge dati precedenti. | CC BY 4.0. WCS e GeoTIFF numerici; prova su finestra in Toscana riuscita. Non risulta una precisione verticale uniforme dichiarata nella presentazione del dataset. |

Il selettore di fonte non compare nel normale flusso utente. Regole:

1. Cercare una copertura completa dell’intero campo e del margine necessario al calcolo nella fonte Piemonte quando applicabile.
2. Negli altri territori italiani, oppure quando quella copertura è incompleta/indisponibile, usare TINITALY per l’intero campo.
3. Usare una sola fonte per la superficie di calcolo di un campo. Le porzioni dello stesso campo condividono quella superficie; non fondere quote di fonti diverse senza una futura procedura di raccordo validata.
4. Una volta salvato, il modello resta congelato. La disponibilità di una fonte migliore non modifica un progetto esistente in modo silenzioso.
5. Se entrambe le fonti mancano, segnalare l’indisponibilità e offrire **Riprova**. Nessun riempimento delle celle mancanti con quota zero o conversione nascosta a un modello piatto.

Richiedere valori numerici nel CRS dichiarato dal servizio, mantenendo allineamento e passo originali. WMS/WMTS colorati non sono utilizzabili come quote. I due WCS testati dichiarano EPSG:32632; la conversione fra coordinate geografiche, raster e coordinate metriche locali deve essere esplicita e verificata. Nessuna trasformazione viene dedotta dal nome del file.

Gli endpoint verificati sono:

- Piemonte: `https://geomap.reteunitaria.piemonte.it/ws/taims/rp-01/taimsdtmwcs/wcs_ice_2009_2011_dtm`, WCS 1.0.0, coverage `DTM`, formato richiesto `GEOTIFF_16`. La risposta provata contiene realmente float32, nodata −99, celle native 5 m.
- Italia: `https://tinitaly.pi.ingv.it/TINItaly_1_1/wcs`, WCS 1.0.0, coverage `TINItaly_1_1:tinitaly_dem`, formato `GeoTIFF`. La risposta provata contiene float32, nodata −9999, celle native 10 m.

Le risposte di prova includono CORS `*`. Questa è prova di accessibilità, non un impegno del fornitore su disponibilità o traffico. L’implementazione deve collaudare fetch e decodifica nel browser sul dominio dell’applicazione. Partire con accesso diretto e cache locale; nessuna API a pagamento obbligatoria. Un eventuale proxy/cache remota richiede una scelta successiva motivata da un limite effettivamente misurato.

## Esperienza utente

La funzione si colloca in **Affina progetto**, in una scheda compatta **Terreno**. Comfortaa, colori e controlli rimangono quelli del configuratore.

- A perimetro confermato, acquisire automaticamente l’altimetria candidata in background. Un indicatore mostra caricamento, disponibilità o errore. Il dato candidato resta nella cache della proposta e non entra nell’autosalvataggio del progetto prima di **Applica**.
- Mostrare dislivello e pendenza sintetica; fonte, risoluzione ed epoca si aprono da una piccola icona informativa.
- **Segui il terreno** propone la guida automatica nella porzione selezionata e mostra un’anteprima delle quantità. Alla prima attivazione, la metrica sul terreno si applica all’intero campo: preparare e validare tutte le porzioni, mantenendo le altre guide come riferimento e adattando la distanza dove necessario. Il riepilogo indica chiaramente le variazioni di ogni porzione e del campo intero; **Applica** salva tutto insieme. Se una porzione non è validabile, conservare il campo precedente e la proposta, senza applicazione parziale.
- Dopo l’attivazione sul campo, **Segui il terreno** modifica solo la guida della porzione selezionata, sulla stessa superficie congelata. Le altre porzioni conservano geometria, quantità e identità.
- **2D / 3D** cambia solo la vista. La prima vista 3D è consultabile, con campo, filari, esclusioni e passaggi sul terreno; tornare in 2D prima di modificare perimetro o strada. Prima di Applica, segnare la vista della proposta come **Anteprima** e mantenere distinti i suoi totali da quelli salvati.
- Per un campo con più porzioni, mantenere i pulsanti di selezione già presenti. Ogni porzione ha guida, direzione e curvatura indipendenti; il terreno è comune.
- Conservare la modifica manuale delle curve come controllo del disegno. La scelta “solo automatica” riguarda i dati altimetrici, non la possibilità attuale di correggere i filari.
- I progetti precedenti restano con il loro disegno e le loro quantità fino all’applicazione della proposta. Il caricamento del dato o l’apertura del 3D non cambiano il progetto salvato.

Il riepilogo dell’applicazione della proposta contiene filari/tratti, metri, piante e pali prima/dopo. Evitare un nuovo flusso a più schermate, selettori di dataset o input della pendenza.

## Modello altimetrico e riproducibilità

Introdurre una proprietà esplicita `terrain` nel campo e un’impostazione di disegno terreno nelle porzioni. Aggiungerle alle chiavi del campo, alla normalizzazione, alle revisioni e a tutti i chiamanti del calcolatore.

Il modello congelato contiene:

- versione del formato e dell’algoritmo;
- ID della fonte/dataset, rilascio noto, risoluzione nativa, epoca nota del rilievo, citazione e licenza;
- tempo di acquisizione del sottoinsieme, CRS, datum verticale quando dichiarato e trasformazione locale utilizzata;
- origine della griglia, dimensioni, passi, valori, maschera nodata e hash del contenuto;
- impronta del perimetro/supporto che il modello copre e stato della validazione;
- guida applicata, ancoraggio, fase degli offset, verso e identificativi della famiglia dei filari per ogni porzione;
- geometria autorevole dei filari applicati, metriche/quantità e rapporto di validazione, legati all’hash degli input e alla versione del calcolatore.

Conservare la griglia una volta per campo, non una volta per porzione o per ricalcolo. Decodificarla/cachearla per hash; la serializzazione usa un contenitore compatto lossless con dimensioni dichiarate. Gli snapshot già conservano il JSON di progetto e `design_data`; il nuovo formato deve attraversare salvataggio locale, cloud, ripristino, archivio Admin, condivisione e report senza dipendere da un fetch esterno successivo. Alla riapertura, una revisione usa geometria e quantità applicate dopo la verifica dell’hash, anche se è disponibile un nuovo algoritmo. Cambiare parametri o aggiornare algoritmo genera una nuova proposta; non ricalcolare una vecchia revisione con regole nuove in modo silenzioso.

Prima versione: limite esplicito di 262.144 celle native per modello e budget massimo iniziale di 1 MiB serializzato per campo, compresi griglia e risultato; 4 MiB per snapshot completo con terreno. Sono tetti applicativi iniziali da collaudare, non capacità assicurate dei servizi o del dispositivo. La bozza attuale usa localStorage: la quota può essere inferiore e l’archivio usa spazio aggiuntivo. **Applica** completa solo dopo la scrittura locale riuscita del nuovo checkpoint; se il salvataggio fallisce, mantenere il progetto precedente e la proposta recuperabile. Non assumere che la sola cache IndexedDB renda salvabile il progetto. Se i limiti sono superati, rifiutare il modo terreno con un messaggio comprensibile; non diminuire la risoluzione in modo nascosto.

Non aggiungere automaticamente Storage, tabelle o nuove autorizzazioni cloud. L’implementazione deve prima verificare trasporto e dimensioni nello schema JSON esistente. Una copia locale non sostituisce la griglia congelata necessaria a riprodurre una revisione su un altro dispositivo.

Cambio perimetro fuori dalla copertura: acquisire un nuovo modello e preparare una nuova proposta, conservando la revisione precedente. Cambio account/campo o risposta tardiva: applicare la risposta solo al contesto proprietario/campo/geometria catturato all’avvio.

## Motore geometrico

Separare tre responsabilità: acquisizione del terreno, calcolo del disegno e visualizzazione. Il calcolatore usa dati congelati e non fa richieste di rete.

La superficie è `z = h(x,y)` su coordinate metriche locali. Una griglia nativa genera una superficie triangolata con raccordi coerenti; l’integrazione può suddividere i segmenti ulteriormente per ridurre l’errore numerico, senza dichiarare una maggiore risoluzione del rilievo.

Per una polilinea, la lunghezza sul terreno si ottiene seguendo il suo attraversamento dei triangoli e sommando i segmenti XYZ. Due sole quote alle estremità non bastano per un terreno ondulato.

Su un piano `z = a*u + b*v + c`, dove `u` segue i filari e `v` è la normale orizzontale:

- lunghezza lungo filare = lunghezza orizzontale × `sqrt(1 + a²)`;
- interfila minima sulla superficie = passo orizzontale × `sqrt(1 + b²/(1 + a²))`;
- passo orizzontale per un’interfila richiesta `s` = `s * sqrt((1 + a²)/(1 + a² + b²))`.

Queste formule diventano test analitici. Una correzione unica con la percentuale media del campo non è il motore del terreno variabile.

### Guida automatica e offset

1. Per ciascuna porzione, individuare una guida semplice ispirata alle curve di livello sulla superficie disponibile. Selezionare deterministicamente la componente aperta che attraversa la porzione e si avvicina alla direzione di riferimento. La guida e il suo ancoraggio diventano dati salvati dopo l’applicazione.
2. Quando l’escursione del modello nella porzione è ≤ 1 cm, riusare la guida/direzione e le convenzioni di partenza del disegno attuale come riferimento, evitando una rotazione arbitraria per curve di livello indeterminate. Il modello altimetrico resta quello acquisito e viene comunque usato per le misure; questa soglia determina la guida, non appiattisce le quote.
3. Generare una famiglia di filari con offset di distanza sulla superficie. Usare propagazione della distanza sulla superficie triangolata con attraversamento delle facce; il solo cammino sui bordi della griglia non soddisfa il contratto di precisione.
4. La distanza richiesta è prioritaria. Le curve di livello guidano l’andamento, ma i filari adiacenti possono discostarsene per mantenere la distanza e una famiglia regolare.
5. La prima versione accetta una guida non ramificata e una famiglia senza incroci per porzione. Saddle, anelli, biforcazioni o offset non verificabili producono uno stato esplicito **Disegno da rivedere**; il vecchio disegno rimane disponibile. Non applicare in silenzio la traslazione/blending planare usata come ripiego dal motore precedente.
6. La guida deve estendersi oltre la zona coltivabile nel dominio di supporto, in modo che le estremità non generino archi di offset interni al campo. Il dominio e il margine sono parte dei dati di calcolo, con copertura verificata.

### Distanze minime e regolarità

La validazione misura l’interfila fra assi adiacenti distinti nella stessa porzione, sull’intervallo comune di ascissa della guida in cui entrambi i filari sono presenti dopo il clipping. L’ordinamento di famiglia determina l’adiacenza; una perdita di corrispondenza univoca fra rami invalida la proposta. I cammini di distanza attraversano la superficie coperta del dominio di supporto, anche oltre il perimetro o sopra il poligono di una strada: esclusioni e confine non sono barriere del campo di distanza. Se il cammino necessario esce dalla copertura, non è verificabile. Non confrontare come “interfila” le estremità dello stesso asse separate da una strada, né filari di porzioni diverse senza una fascia comune di lavoro.

Obiettivo numerico iniziale: errore di distanza ≤ 1 cm sul modello. Il solver deve fornire intervalli conservativi validati; la sola convergenza per raffinamento non prova un limite di errore. Nei casi numerici generare con margine di almeno due volte il limite d’errore verificato e accettare la minima solo quando il suo limite inferiore è almeno l’interfila richiesta. Nei casi planari risolti analiticamente non aggiungere un margine arbitrario che cambierebbe conteggi alle soglie. Se i limiti non sono verificabili entro il budget, non dichiarare la proposta valida. Un centimetro è un obiettivo del calcolo sul modello, non la precisione del rilievo 5/10 m.

Conservare un massimo di 500.000 nodi della superficie di calcolo per campo e un tetto di 10 secondi per operazione nel worker. Se il budget è raggiunto, interrompere con uno stato recuperabile; la UI resta interattiva. Questi budget sono criteri iniziali da collaudare su desktop/mobile prima di renderli definitivi nella versione distribuita.

Segnalare curve non regolari, filari incrociati o distanza insufficiente; non dedurre un raggio di sterzata universalmente valido senza dati della macchina.

## Passaggi, porzioni e pali

La famiglia dei filari si costruisce prima di ritagliare i poligoni fisici delle esclusioni. Non usare le strade come ostacoli del campo di distanza, perché deformerebbero la distribuzione dei filari attorno alla strada.

Applicare il clipping geometrico sui bordi reali, compresi quelli sottili fra due campioni. Le porzioni mantengono la titolarità per sovrapposizione introdotta nella 1.2.5. La normalizzazione topologica non diventa un taglio fisico aggiuntivo.

Ogni filare ha un ID di asse; ogni pezzo risultante ha un ID di frammento e un proprietario di porzione. La suddivisione per quote/triangoli è solo numerica. Il conteggio delle teste resta due per frammento fisico; piante e pali intermedi derivano dalla lunghezza effettiva di quel frammento. Conservare l’arrotondamento commerciale a 25.

Dopo la conversione iniziale dell’intero campo, modificare una guida di porzione non modifica l’altra. Tutte condividono esattamente la stessa altimetria, anche quando la strada divide un campo a L. La conversione iniziale ha invece un riepilogo esplicito dell’intero campo, perché cambia la metrica di tutte le porzioni.

## Vista 3D

La prima vista usa MapLibre già presente, con terreno raster-dem, camera inclinata e filari come linee. Non occorrono viti realistiche o migliaia di oggetti 3D.

Produrre il supporto di rendering del campo dalla stessa griglia congelata del calcolatore, con adapter locale per tile di quota e margine coperto. MapLibre può interpolare il raster in modo diverso dalla superficie triangolata: la prima vista è una rappresentazione grafica approssimata derivata dagli stessi dati, non un validatore delle distanze. Un eventuale rilievo esterno per il paesaggio circostante non diventa fonte delle misure del campo. Se la compatibilità della versione 4.7.1 richiede un aggiornamento, valutarlo in una prova isolata con regressioni dei gesti prima di cambiare la dipendenza.

Quote, camera e amplificazione grafica sono separate dai dati del calcolo. La vista parte con altezza reale, fattore 1. Cambiare pitch, zoom o un’eventuale amplificazione non modifica filari, quantità o revisioni. Non usare `queryTerrainElevation()` del renderer come fonte del calcolo autorevole.

Salvare/ripristinare pitch, bearing e gesti quando si apre/chiude l’anteprima; tornare alla vista dall’alto per l’editing. Conservare il pulsante occhio e le scelte di visibilità. Caricare le risorse 3D solo all’apertura, limitare la densità grafica mobile e rilasciare le risorse alla chiusura.

## Coerenza di app, archivio e documento

App, riepilogo, Admin, condivisione e stampa invocano lo stesso calcolatore con terreno e disegno applicato. Il PDF conserva il font precedente e riporta sinteticamente che le lunghezze sono sul terreno, insieme a fonte/risoluzione/epoca quando nota. Non introdurre una sezione tecnica lunga o la dicitura equidistanza sì/no.

Le aree orizzontali già presenti restano distinte dalle nuove aree di superficie. Il calcolo delle capezzagne non può mescolare lunghezze sul terreno con interfila orizzontale per produrre un’area senza significato: ricavare l’area della fascia dal modello appropriato, mantenendo separati i due valori.

Un progetto senza modo terreno conserva i risultati precedenti. Un progetto con modo terreno attivo ma dati invalidi produce uno stato esplicito, non quantità a zero presentate come definitive o stime planari sotto il nome del modello terreno.

## Unità di implementazione e ordine di consegna

| Unità | Responsabilità e uscita verificabile |
|---|---|
| Dati e stato | Provider Piemonte/TINITALY, decodifica GeoTIFF, modello congelato, cache/hash, errori e persistenza. |
| Geometria | Lunghezze e distanze sulla superficie, guida/offset, validazione, clipping e conteggi. |
| UI e 3D | Scheda Terreno, proposta/Applica, porzioni, camera 2D/3D e rappresentazione della stessa superficie. |
| Integrazione | Riepiloghi, Admin, report, condivisione, versioni/cache e pacchetto unico. |

Prima validare acquisizione e round-trip; poi piano analitico e metrica; poi terreno variabile e Segui il terreno; quindi anteprima e integrazione completa. Le prove intermedie non sono una release finale limitata alla sola grafica 3D.

## Criteri di accettazione

1. Recupero automatico numerico Piemonte e almeno un campo fuori regione con TINITALY; fonte e passo nativo corretti, senza input manuali.
2. Completa parità con i risultati della 1.2.6 quando il modo terreno non è applicato. Su terreno piatto applicato, conservare guida, fase e quantità delle famiglie già conformi alla minima interfila; eventuali curve precedenti non conformi devono essere adattate e mostrate nel riepilogo, non mantenute sotto una falsa validazione. Il piano analitico non aggiunge inflazione numerica arbitraria.
3. Piani con pendenza trasversale, longitudinale e obliqua concordano con le formule analitiche. Al 30% trasversale, 100 m orizzontali sono circa 104,403 m sul versante e interfila 3 m corrisponde a circa 2,873 m orizzontali.
4. Minima interfila rispettata sul modello nei casi ondulati e curvi; raffinamento convergente, nessun incrocio occultato.
5. Guida ramificata, copertura incompleta e budget esaurito danno stati espliciti e conservano il disegno precedente.
6. Passaggio da 1,50 m sottile/obliquo e zone escluse tagliano i filari nei punti reali. Due teste per frammento; suddivisioni del DEM non creano teste.
7. Capezzagne solo sul perimetro originario, misurate una volta lungo il filare; aree coerenti e separate per piano/superficie.
8. Campo a L con due porzioni: prima attivazione con anteprima di tutto il campo; dopo l’applicazione una modifica locale lascia invariata l’altra. Griglia condivisa e identità stabili.
9. Salva/ricarica/offline, cambio dispositivo, revisioni e risposte tardive mantengono lo stesso modello e il risultato applicato, anche dopo un aggiornamento dell’algoritmo. Un salvataggio locale fallito non applica la proposta.
10. App, riepilogo, Admin, condivisione e PDF concordano su quantità e fonti.
11. Zoom, pitch, caricamento tile e amplificazione del 3D non cambiano le quantità. Touch e chiusura del 3D ripristinano editor/gesti.
12. 5 m e 10 m restano le risoluzioni dichiarate anche con interpolazione più fitta. Fonte aggiornata non cambia un progetto già applicato senza nuova proposta.

Caso pilota proposto: Cascina Elena, Chardonnay — 775P, campo a L con strada e due porzioni, dopo disponibilità autorizzata della geometria effettiva. Nel frattempo usare fixture anonime; non inventare risultati sul campo reale.

## Fonti primarie consultate

- Regione Piemonte, ICE DTM 5 e servizi: https://www.geoportale.piemonte.it/geonetwork/srv/api/records/r_piemon:224de2ac-023e-441c-9ae0-ea493b217a8e
- INGV TINITALY 1.1: https://tinitaly.pi.ingv.it/
- INGV servizio numerico WCS: https://tinitaly.pi.ingv.it/wcs_service.html
- INGV note del rilascio: https://tinitaly.pi.ingv.it/Tinitaly_1_1_AccompanyingNotes.pdf
- MapLibre configurazione del terreno: https://maplibre.org/maplibre-style-spec/terrain/
- MapLibre API e quota grafica: https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/

Le richieste WCS di prova, il codice attuale e le capacità pubblicate sono stati esaminati in sola lettura. Browser sul dominio pubblicato, prestazioni del solver e snapshot con terreno sono criteri futuri di implementazione, non verifiche già completate.

## Integrazione approvata per 1.3.0: coordinate dei punti

Marco ha autorizzato l'implementazione il 4 ottobre 2026, richiedendo esplicitamente di conservare il funzionamento raggiunto nella 1.2.6. La seconda aggiunta ipotizzata (ostacoli puntuali) è stata ritirata: usare le aree escluse esistenti.

- In Modifica punti, un tocco/click sul vertice numerato apre un comando Coordinate discreto e un popup compatto. Il trascinamento attuale resta disponibile; un trascinamento non deve aprire il popup. Applica e Annulla, accessibilità da tastiera e uso mobile.
- Coordinate WGS84 decimali e UTM WGS84 nelle zone italiane 32/33/34, con EPSG esplicito; nessuna deduzione automatica da due numeri, nessuna promessa di trasformazioni catastali arbitrarie. Conservare la precisione numerica, senza riscrivere dati invariati per arrotondamenti di visualizzazione.
- Perimetro e aree escluse condividono il percorso di aggiornamento esistente. Controllare coordinate finite/intervalli, almeno tre vertici distinti, area non nulla e assenza di auto-intersezioni prima dell'applicazione. Aggiornare la chiusura dell'anello.
- Nuovi passaggi lineari: conservare i due estremi originali e un'identità comune dei pezzi tagliati; il comando Coordinate sugli estremi rigenera il corridoio da 1,50 m e lo ritaglia in un aggiornamento atomico. I vecchi passaggi non contengono gli estremi: non inventarli; mantengono l'editing del poligono, distinguendo un'area rimodellata da un corridoio a larghezza garantita.
- Chiudere/invalida il popup quando terminano gli strumenti o cambiano campo/account. Una modifica della geometria o dei parametri invalida il risultato terreno applicato legato agli input, senza mostrare conteggi planari come conteggi sul terreno; una nuova proposta deve essere applicata esplicitamente.
