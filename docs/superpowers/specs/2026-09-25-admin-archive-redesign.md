# Amministrazione, archivio progetti e stato impianti

Data: 25 settembre 2026  
Prodotto: Configuratore vigneti Vivai Obice  
Stato: specifica pronta per revisione

## 1. Obiettivo

Rendere l'area amministrativa uno strumento operativo per consultare e analizzare campi, progetti e clienti, distinguendo gli impianti ancora da realizzare dagli impianti già eseguiti. La stessa release deve correggere il salvataggio del profilo, semplificare la preferenza del tema e rendere più funzionale l'archivio progetti dell'utente.

Il risultato deve permettere a Vivai Obice di:

- conoscere il potenziale commerciale reale in barbatelle dei soli impianti futuri;
- conservare anche lo storico completo delle superfici già impiantate;
- risalire rapidamente dal KPI al dato analitico;
- vedere contemporaneamente tutti i campi sulla mappa;
- consultare il dettaglio completo senza lasciare la pagina;
- organizzare i campi tra progetti senza perdita o duplicazione di dati.

## 2. Perimetro della release

La release comprende cinque blocchi coordinati:

1. correzioni Profilo e preferenza tema;
2. nuovo stato operativo del campo;
3. nuova amministrazione Campi, Progetti e Clienti/Utenti;
4. archivio progetti espandibile con spostamento dei campi;
5. nomi geografici sopra tutte le mappe satellitari interattive.

Il layout mobile generale non viene riprogettato in questa release; le funzioni nuove devono però restare utilizzabili su schermi piccoli senza introdurre blocchi.

## 3. Profilo utente e tema

### 3.1 Salvataggio profilo

Il difetto attuale è nel bridge di autenticazione: la UI invoca `updateProfile`, ma il bridge non inoltra il metodo al servizio. La correzione deve:

- esporre `updateProfile` nel bridge;
- conservare la normalizzazione già presente per provincia, CAP, partita IVA e telefono;
- mostrare un messaggio di successo soltanto dopo la risposta positiva del backend;
- mantenere i dati immessi e mostrare l'errore ricevuto se il salvataggio fallisce;
- aggiornare immediatamente nome e dati visibili dopo il salvataggio.

### 3.2 Preferenza tema

Il selettore `Modalità luminosa / Dark Mode / Automatico` deve comparire soltanto nella scheda Profilo. Deve essere rimosso dal menu a tendina superiore. La scelta continua a essere applicata immediatamente e memorizzata sul dispositivo; la sincronizzazione nel profilo cloud non viene introdotta in questa release.

## 4. Stato del campo

Ogni campo acquisisce la proprietà `plantingStatus` con due valori ammessi:

- `planned`: **Da realizzare**;
- `planted`: **Impianto realizzato / archivio storico**.

I campi esistenti senza valore vengono migrati in modo non distruttivo a `planned`. Nella scheda del campo il controllo è collocato accanto all'anno di impianto ed è presentato come selettore a due stati, più chiaro di una checkbox.

Il valore deve essere incluso in:

- stato locale e salvataggio cloud;
- revisioni del progetto;
- visualizzazione amministrativa;
- visualizzazione del campo;
- modello di condivisione e stampa solo come dato descrittivo, senza modificare il calcolo tecnico.

### Regole KPI

- **Barbatelle**: somma delle quantità commerciali dei soli campi `planned` non eliminati.
- **Superficie archivio**: somma della superficie di tutti i campi non eliminati, sia `planned` sia `planted`.
- **Campi totali**: numero di tutti i campi non eliminati, indipendentemente dallo stato.

## 5. Area amministrativa

L'amministrazione mantiene autenticazione e permesso `admin`. Il caricamento produce una vista normalizzata dei progetti e dei rispettivi campi, evitando di considerare un progetto multicampo come una sola riga tecnica.

### 5.1 KPI

Le card principali sono:

- Progetti;
- Campi totali;
- Preventivi richiesti;
- Clienti/Utenti;
- Barbatelle da piantare;
- Superficie archivio.

Le card Progetti, Campi totali, Preventivi e Clienti/Utenti sono pulsanti. La pressione attiva la relativa sezione e porta all'elenco filtrato. Guest, utenti registrati e importazioni FieldArea restano disponibili come filtri secondari, non come KPI principali.

### 5.2 Sezione Campi

Ogni campo genera una riga autonoma con queste colonne:

| Colonna | Origine |
|---|---|
| Data progetto | `projects.created_at` |
| Nome progetto | `projects.name` |
| Numero progetto | `projects.public_code` |
| Cliente | contatto del progetto o profilo proprietario |
| Località impianto | campo, con fallback sul progetto |
| Anno | anno del campo, con fallback sulla campagna del progetto |
| Stato impianto | Da realizzare / Realizzato |
| Vitigno | campo |
| Clone | campo |
| Portainnesto | campo |
| Superficie | metrica del campo |
| Barbatelle calcolate | metrica del campo |
| Quantità commerciale | metrica del campo |

La pressione della riga seleziona il campo, lo evidenzia e apre in fondo alla pagina un dettaglio completo. Il dettaglio contiene geometria, sesto, orientamento, filari, pali, materiale vegetale, contesto/note, località, stato, progetto e cliente. La pressione del poligono sulla mappa produce lo stesso risultato.

### 5.3 Sezione Progetti

La tabella Progetti contiene:

- data;
- numero progetto;
- nome progetto;
- azienda o nome cliente;
- stato CRM;
- numero campi;
- superficie totale dei campi;
- barbatelle commerciali totali;
- preventivo richiesto sì/no;
- numero preventivo, quando assegnato.

Il vitigno non compare nella tabella perché può essere multiplo. Selezionando il progetto si apre il dettaglio in basso, con riepilogo del progetto e lista di tutti i campi. Da questa lista è possibile aprire il dettaglio di un singolo campo.

La richiesta preventivo conserva un campo facoltativo `quote_number`. Finché non è assegnato, la tabella mostra **Richiesto · numero da assegnare** anziché un UUID tecnico.

### 5.4 Sezione Clienti/Utenti

La sezione riunisce:

- utenti registrati identificati dal profilo;
- clienti senza account identificati dal contatto del progetto.

Quando profilo e contatto condividono lo stesso proprietario o la stessa e-mail normalizzata vengono trattati come un'unica anagrafica. Ogni riga mostra i dati principali e gli aggregati:

- numero progetti;
- numero campi;
- superficie totale;
- barbatelle commerciali totali;
- barbatelle ancora da piantare.

La selezione apre in fondo il dettaglio anagrafico e la lista dei progetti collegati.

### 5.5 Filtri e navigazione

I filtri esistenti vengono mantenuti e applicati alla sezione attiva. Si aggiungono:

- stato impianto;
- ricerca libera per codice progetto, nome progetto, campo, cliente o località;
- intervallo anno/campagna.

Il cambio sezione non ricarica la pagina. Il dettaglio segue sempre l'elemento selezionato e viene chiuso quando il filtro lo esclude.

## 6. Mappa amministrativa

La mappa mostra contemporaneamente tutti i campi appartenenti al risultato filtrato. Ogni poligono espone:

- nome campo;
- nome progetto;
- codice progetto nei dati interattivi.

Le etichette usano il formato `Nome campo · Nome progetto`, sono collocate nel centro visivo del poligono e hanno alone chiaro per restare leggibili sul satellite. Alle scale molto ampie vengono nascoste o diradate per evitare sovrapposizioni; ricompaiono avvicinandosi. Il clic su poligono o etichetta apre il dettaglio del campo.

## 7. Nomi geografici sulle mappe satellitari

Sopra il raster satellitare viene aggiunto il livello Esri di riferimento geografico `World_Boundaries_and_Places`, separato dal livello immagini. Il livello deve:

- mostrare paesi, località, strade principali e confini disponibili;
- essere visibile soltanto quando è attivo il satellite;
- non intercettare clic, trascinamenti o gesture;
- non modificare geometrie, coordinate, catture o calcoli;
- essere incluso nelle mappe interattive principali, amministrative e condivise;
- essere incluso nelle immagini satellitari destinate al documento quando il servizio di rendering lo consente.

La costruzione dello stile satellitare viene centralizzata in un helper comune, così le diverse mappe non divergono nelle release successive.

## 8. Archivio progetti dell'utente

### 8.1 Progetti espandibili

La pressione sulla parte neutra della riga di un progetto apre o chiude la lista dei campi. I pulsanti Apri, Rinomina ed Elimina rimangono azioni separate e non attivano l'espansione.

Ogni campo mostra almeno nome, località, superficie, stato impianto e materiale vegetale principale.

### 8.2 Spostamento campo tra progetti

Su desktop ogni campo dispone di una maniglia di trascinamento. Durante il drag:

- i progetti di destinazione validi vengono evidenziati;
- il progetto di origine non è una destinazione valida;
- al rilascio non avviene subito lo spostamento.

Compare un popup:

> Spostare “Nome campo” dal progetto “Progetto A” al progetto “Progetto B”?

Azioni:

- **Annulla**;
- **Sposta campo**.

Su dispositivi touch viene fornita anche l'azione `Sposta in…`, che apre l'elenco dei progetti di destinazione e usa lo stesso popup.

### 8.3 Integrità dello spostamento

Lo spostamento è eseguito da una funzione database atomica che:

- verifica che l'utente possa modificare entrambi i progetti;
- blocca origine e destinazione durante l'operazione;
- conserva ID campo, geometria, esclusioni, filari, curvature, materiale e note;
- aggiorna snapshot e righe normalizzate di entrambi i progetti;
- crea una revisione per origine e destinazione;
- evita duplicazioni tramite `operation_id` idempotente;
- annulla interamente l'operazione in caso di errore.

Un progetto non può rimanere privo di campi: se viene spostato l'unico campo, nell'origine viene creato un nuovo campo vuoto predefinito. Il progetto di destinazione attiva il campo appena ricevuto soltanto quando viene poi aperto dall'utente.

## 9. Dati e migrazioni

La proprietà di stato è salvata nel JSON del campo per compatibilità con snapshot e revisioni. Il modello normalizzato `project_fields` riceve anche la colonna `planting_status` per query e aggregazioni amministrative efficienti.

`quote_requests` riceve la colonna facoltativa `quote_number` con vincolo univoco per ambiente quando valorizzata.

La migrazione:

- imposta `planned` per i record privi di stato;
- non riscrive geometrie o revisioni storiche;
- mantiene leggibili i progetti creati da versioni precedenti;
- aggiunge la funzione atomica di spostamento campo;
- conserva le attuali policy RLS e aggiunge controlli proprietario/admin alla nuova funzione.

## 10. Gestione errori

- Un errore profilo lascia il dialogo aperto e i valori immessi invariati.
- Un errore nel caricamento amministrativo mantiene visibili i dati già caricati e mostra un messaggio non distruttivo.
- Un errore nello spostamento lascia entrambi i progetti invariati.
- Geometrie mancanti non bloccano le tabelle; il campo viene mostrato con superficie zero e indicazione `Geometria non disponibile`.
- Record storici incompleti usano fallback espliciti `Da definire`, senza produrre stringhe tecniche o UUID all'utente.

## 11. Verifiche obbligatorie

### Test automatici

- bridge profilo inoltra `updateProfile`;
- il selettore tema non compare nel menu e compare nel dialogo Profilo;
- migrazione dei campi esistenti a `planned`;
- aggregazioni KPI con combinazioni planned/planted e progetti multicampo;
- tabelle Campi, Progetti e Clienti con fallback corretti;
- selezione riga/poligono apre il dettaglio corrispondente;
- FeatureCollection contiene tutti i campi e le etichette corrette;
- livello nomi geografici presente e non interattivo;
- spostamento campo riuscito, annullato, duplicato e fallito;
- autorizzazioni: un utente non sposta campi di altri utenti;
- nessuna regressione sui salvataggi, revisioni, PDF e progetti condivisi.

### Verifica manuale

- progetto con almeno due campi, uno planned e uno planted;
- conteggio KPI prima e dopo il cambio stato;
- apertura dettagli da tutte e tre le tabelle;
- mappa con più progetti e label leggibili;
- salvataggio profilo e riapertura della sessione;
- tema selezionabile solo dal Profilo;
- drag-and-drop desktop e `Sposta in…` touch;
- mappe satellite con nomi geografici e strumenti editor ancora funzionanti.

## 12. Criteri di accettazione

La release è accettabile quando:

1. il profilo viene salvato e ricaricato correttamente;
2. il tema è gestibile soltanto dalla scheda Profilo;
3. ogni campo è classificabile come futuro o già realizzato;
4. Barbatelle esclude gli impianti già realizzati, mentre Superficie archivio li include;
5. Campi, Progetti e Clienti/Utenti dispongono delle colonne e dei dettagli richiesti;
6. la mappa amministrativa mostra tutti i campi con nome campo e progetto;
7. i nomi geografici sono visibili sulle mappe satellitari senza compromettere editor e gesture;
8. un campo può essere spostato tra progetti soltanto dopo conferma e senza perdita di dati;
9. l'intera suite automatica passa e la verifica manuale non rileva regressioni.
