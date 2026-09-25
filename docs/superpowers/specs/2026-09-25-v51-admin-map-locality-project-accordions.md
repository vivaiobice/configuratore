# V51 — Mappa amministrativa, località campo e dettagli progetto

Data: 25 settembre 2026  
Prodotto: Configuratore vigneti Vivai Obice  
Stato: specifica pronta per revisione

## 1. Obiettivo

Rendere l'amministrazione più leggibile e operativa senza modificare i flussi già stabilizzati nella V50. La release deve migliorare la mappa generale, collegare selezione tabellare e geometria, mostrare un'anteprima satellitare completa per ogni campo e rendere indipendenti i pannelli di progetto e di campo.

La località d'impianto diventa un dato canonico del singolo campo: viene ricavata automaticamente dalla geometria, salvata nel progetto, riutilizzata in ogni vista e può essere corretta manualmente da un amministratore.

La revisione mobile generale resta fuori perimetro e sarà affrontata nella release successiva.

## 2. Località canonica del campo

Ogni campo conserva questi valori:

- `locationLabel`: descrizione geografica completa;
- `municipality`: comune o località;
- `province`: provincia;
- `region`: regione.

Il singolo campo è la fonte primaria. I valori presenti a livello progetto restano disponibili soltanto come fallback per i progetti storici con un solo campo.

### 2.1 Compilazione automatica

Quando una geometria valida viene creata o modificata:

1. viene calcolato un punto interno affidabile al poligono, non una semplice media che potrebbe cadere fuori da forme concave;
2. il punto viene inviato al servizio Esri di geocodifica inversa;
3. comune, provincia, regione ed etichetta completa vengono normalizzati;
4. i valori vengono applicati al campo attivo;
5. il normale salvataggio del progetto li include nello snapshot e nella revisione.

La richiesta non deve bloccare il disegno o il salvataggio. In caso di errore di rete, la geometria resta valida e la località rimane modificabile manualmente.

### 2.2 Progetti storici

Quando l'amministrazione incontra un campo dotato di geometria ma privo di località:

- calcola la località in modo asincrono;
- aggiorna immediatamente la riga e il dettaglio;
- salva il risultato tramite un'operazione amministrativa protetta;
- non sovrascrive valori già presenti;
- evita richieste duplicate per lo stesso campo durante la sessione.

Il salvataggio deve aggiornare il campo dentro `field_plans`, la corrispondente riga normalizzata e, per un progetto storico moncampo, i fallback geografici del progetto. Deve inoltre generare una revisione riconoscibile come aggiornamento amministrativo della località.

### 2.3 Correzione manuale

Il dettaglio amministrativo del campo contiene campi editabili per:

- località/comune;
- provincia;
- regione;
- descrizione completa facoltativa.

Il pulsante **Salva località** usa la stessa operazione protetta del recupero automatico. Una correzione manuale ha precedenza sulla geocodifica e non viene sovrascritta finché la geometria non viene modificata nel configuratore.

### 2.4 Propagazione

Dopo il salvataggio, la località aggiornata viene usata da:

- tabella e dettaglio amministrativi;
- filtri e ricerca amministrativi;
- configuratore e archivio progetti;
- progetto condiviso;
- anteprima di stampa e PDF;
- caricamento successivo del progetto.

## 3. Mappa generale amministrativa

### 3.1 Layout

La mappa non occupa più tutta la larghezza disponibile sui monitor molto grandi. Il contenitore:

- è centrato;
- ha larghezza massima di circa 1.240 px;
- ha altezza desktop compresa tra 520 e 580 px;
- mantiene una forma più vicina a una finestra cartografica e meno a una fascia panoramica;
- torna fluido a larghezza completa sotto il breakpoint tablet.

### 3.2 Vista iniziale e GPS

Senza geometrie la mappa parte sull'area di Santo Stefano Belbo con uno zoom più ravvicinato rispetto alla V50. Con geometrie disponibili mantiene una vista d'insieme dei campi filtrati. Il clic su un campo, dalla mappa o dalla tabella, inquadra con precisione il relativo poligono.

Viene aggiunto il controllo MapLibre di geolocalizzazione con:

- alta precisione;
- indicatore della posizione;
- orientamento dell'utente quando disponibile;
- nessuna modifica automatica ai campi o alle geometrie.

### 3.3 Stile dei campi

Tutti i campi sono rappresentati con:

- bordo giallo ben visibile sul satellite;
- riempimento giallo a bassa opacità, sufficiente a distinguere il campo senza coprire l'immagine;
- etichetta `Nome campo · Nome progetto` con alone scuro o chiaro ad alto contrasto;
- stato selezionato con bordo più spesso e riempimento leggermente più intenso.

Lo stile selezionato viene applicato a una sorgente/livello dedicato o tramite feature state, senza riscrivere la geometria.

## 4. Sezione Campi

La pressione di una riga:

1. mantiene attiva la sezione Campi;
2. evidenzia la riga;
3. seleziona il medesimo campo sulla mappa generale;
4. esegue `fitBounds` sul perimetro con un livello di zoom adatto alla modifica visiva;
5. apre il dettaglio in fondo alla sezione.

Il dettaglio contiene i dati tecnici già presenti, la modifica della località e una nuova anteprima cartografica.

### 4.1 Anteprima cartografica del campo

L'anteprima è una mappa satellitare interattiva e mostra:

- perimetro del campo;
- eventuali aree escluse;
- filari retti o curvi calcolati con gli stessi parametri del configuratore;
- riempimento del campo trasparente;
- nomi geografici Esri;
- attribuzione cartografica.

I filari vengono ricalcolati dal modello del campo con `calculateProject`; non vengono ricavati da metriche aggregate né duplicati con una seconda formula. La mini-mappa viene creata soltanto quando il dettaglio è aperto e distrutta alla chiusura, evitando mappe nascoste e listener residui.

## 5. Sezione Progetti

La tabella resta l'elenco principale. Ogni riga progetto può essere aperta o chiusa in modo indipendente e più progetti possono rimanere aperti contemporaneamente.

### 5.1 Pannello progetto

L'espansione inserisce subito sotto la riga:

- riepilogo del progetto;
- elenco permanente dei suoi campi;
- azioni CRM, revisione e note già disponibili;
- comando esplicito **Chiudi progetto**.

L'apertura non scorre automaticamente al fondo della pagina e non chiude gli altri progetti.

### 5.2 Pannelli campo nidificati

Ogni campo dell'elenco ha il proprio comando di apertura. Il relativo pannello:

- compare sotto il campo selezionato, dentro il progetto;
- mostra dati tecnici, località editabile e anteprima satellitare;
- può essere chiuso senza chiudere il progetto;
- non nasconde gli altri campi;
- non trasferisce l'utente alla sezione Campi;
- può restare aperto insieme ai pannelli di altri campi o progetti.

Lo stato UI usa insiemi separati per progetti aperti e campi aperti. Filtri o ricaricamenti eliminano soltanto gli ID non più presenti nei risultati.

## 6. Dati e operazione Supabase

Viene introdotta una funzione database amministrativa dedicata all'aggiornamento geografico del campo. L'operazione:

- è eseguibile esclusivamente da utenti autenticati con ruolo amministratore in `app_metadata`;
- riceve progetto, campo, valori geografici e `operation_id` idempotente;
- blocca il progetto durante l'aggiornamento;
- verifica l'esistenza del campo;
- modifica `field_plans` e `project_fields` nella stessa transazione;
- aggiorna i fallback del progetto soltanto quando applicabile;
- incrementa la revisione e conserva uno snapshot coerente;
- registra l'operazione per evitare duplicazioni;
- revoca l'esecuzione a `anon` e `PUBLIC` e la concede soltanto ad `authenticated`.

La funzione non accetta geometrie, quantità o dati commerciali: il suo ambito è limitato ai quattro valori geografici.

## 7. Gestione degli errori

- Geocodifica non disponibile: compare `Località da verificare`, ma campo e mappa restano utilizzabili.
- Salvataggio automatico fallito: la località ricavata rimane visibile nella sessione e viene mostrato un avviso non bloccante.
- Correzione manuale fallita: gli input restano compilati e il pannello resta aperto.
- Geometria non valida: nessun tentativo di geocodifica o anteprima; viene mostrato `Geometria non disponibile`.
- Mini-mappa non inizializzabile: i dati del campo restano visibili e compare un placeholder.
- GPS negato o non disponibile: nessuna modifica alla vista corrente e messaggio standard del controllo cartografico.

## 8. Compatibilità

- I progetti V46–V50 senza dati geografici per campo restano leggibili.
- I progetti multicampo non condividono la località del primo campo.
- Il fallback geografico del progetto resta valido per i vecchi progetti moncampo.
- Nessuna modifica ai calcoli di superficie, filari, pali o barbatelle.
- Nessuna modifica al formato del codice progetto o ai permessi guest.
- Il comportamento mobile del configuratore non viene riprogettato in V51.

## 9. Verifiche obbligatorie

### Test automatici

- punto interno e normalizzazione della risposta geografica;
- nessuna geocodifica per campi senza geometria valida;
- deduplicazione delle richieste di località;
- aggiornamento canonico del singolo campo senza contaminare gli altri campi;
- autorizzazione e idempotenza dell'operazione Supabase;
- revisione creata con snapshot aggiornato;
- tabella Campi aggiornata dopo geocodifica e modifica manuale;
- clic riga → selezione mappa → `fitBounds` del campo corretto;
- controllo GPS presente;
- colori gialli e opacità del riempimento;
- mini-mappa con perimetro, aree escluse e filari retti o curvi;
- distruzione della mini-mappa alla chiusura;
- più progetti aperti contemporaneamente;
- più pannelli campo indipendenti;
- chiusura campo senza chiusura progetto;
- nessun cambio automatico dalla sezione Progetti alla sezione Campi;
- nessuna regressione su KPI, filtri, PDF e progetto condiviso.

### Verifica manuale

1. Aprire un progetto storico con almeno due campi privi di località e verificare che ciascuno riceva il proprio comune.
2. Correggere manualmente la località di un campo, ricaricare la pagina e verificare la persistenza.
3. Verificare lo stesso valore nel PDF e nel progetto condiviso.
4. Selezionare più righe Campi e controllare l'inquadramento della mappa principale.
5. Aprire due progetti, due campi del primo e un campo del secondo; chiuderli in ordine diverso.
6. Verificare perimetro, filari e trasparenza nelle mini-map.
7. Provare il GPS con permesso concesso e negato.
8. Verificare che la mappa resti leggibile a 1.920 px, 1.366 px e tablet.

## 10. Criteri di accettazione

La V51 è pronta quando:

- nessuna riga con geometria valida resta priva di località dopo il completamento della geocodifica;
- la località corretta resta presente dopo un nuovo accesso ed è visibile in ogni output;
- selezionare una riga porta la mappa sul campo corretto;
- ogni dettaglio campo mostra satellite, perimetro e filari coerenti;
- progetti e campi si aprono e chiudono indipendentemente senza perdere l'elenco;
- la mappa generale è proporzionata, usa il GPS e rende chiaramente visibili tutti i campi;
- l'intera suite automatica passa senza regressioni.
