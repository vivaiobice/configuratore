# Fase A — Archivio cloud e storico progetti

Data: 21 settembre 2026  
Baseline applicativa: V29  
Stato: specifica da approvare, nessuna implementazione applicativa eseguita

## 1. Obiettivo

Trasformare il salvataggio locale della WebApp in un archivio centrale affidabile per Vivai Obice,
senza cambiare in questa fase l'esperienza di progettazione mobile o desktop.

Il sistema deve:

- conservare nel database i progetti Guest, degli utenti registrati e degli amministratori;
- mantenere una copia locale utilizzabile in caso di rete assente o instabile;
- permettere a Vivai Obice di consultare tutti i progetti;
- conservare lo storico delle versioni salvate senza sovrascriverle;
- distinguere progetto, singoli campi, revisioni e anno/campagna;
- predisporre i dati per la successiva schermata Profilo e per la migrazione una tantum da FieldArea
  Measure;
- preservare integralmente le funzioni e i calcoli della V29.

## 2. Ambito della Fase A

### Incluso

1. Identità tecnica Guest anonima.
2. Archivio cloud di progetti e campi.
3. Autosalvataggio dello stato corrente dopo modifiche significative.
4. Revisioni permanenti create con il comando esplicito `Salva`.
5. Coda locale delle modifiche non ancora sincronizzate.
6. Recupero dopo perdita temporanea della connessione.
7. Accesso Admin Vivai Obice a tutti i progetti.
8. Anno/campagna e provenienza dei dati.
9. Cancellazione logica recuperabile.
10. Predisposizione tecnica per importazioni FieldArea eseguite da Vivai Obice.

### Escluso

- nuova voce `Profilo` e relative schermate;
- registrazione e login visibili agli utenti;
- piani PRO, pagamenti o controllo degli abbonamenti;
- importatore self-service nella WebApp;
- migrazione effettiva dei file FieldArea;
- modifiche grafiche mobile o desktop;
- modifiche ai calcoli di filari, pali, barbatelle, passaggi o capezzagne.

## 3. Principi di comportamento

### Guest

- Alla prima apertura viene creata una sessione Supabase anonima persistente nel browser.
- Il Guest continua a usare la WebApp senza registrazione e senza schermate aggiuntive.
- La prima bozza cloud nasce quando viene confermato il primo perimetro valido.
- Le modifiche significative aggiornano lo stato corrente del progetto.
- Il Guest ritrova i propri progetti sullo stesso browser finché conserva la sessione locale.
- Se cancella i dati del browser, il progetto resta nell'archivio Admin ma non è più recuperabile dal
  Guest senza un collegamento sicuro o un futuro account.

### Utente registrato futuro

La Fase A non espone ancora il login, ma il modello deve già permettere due casi:

1. conversione del Guest in nuovo account mantenendo lo stesso proprietario e gli stessi progetti;
2. accesso a un account esistente con trasferimento controllato dei progetti Guest, senza duplicazioni.

### Admin Vivai Obice

- Un amministratore autenticato vede progetti Guest, registrati e amministrativi.
- Gli utenti normali, quando verrà attivato il Profilo, vedranno soltanto i propri dati.
- Il ruolo Admin deriva da metadati non modificabili dall'utente e viene verificato anche dalle regole
  Row Level Security del database.

## 4. Momenti di salvataggio

### Creazione della bozza cloud

La bozza viene creata una sola volta, dopo la chiusura del primo perimetro valido. Un campo vuoto o un
disegno non concluso non produce un progetto nel database centrale.

### Autosalvataggio

L'autosalvataggio viene richiesto dopo questi eventi:

- conferma o modifica del perimetro;
- aggiunta, modifica o eliminazione di passaggio/area esclusa;
- modifica dei parametri dell'impianto;
- modifica del materiale vegetale;
- aggiunta, rinomina o eliminazione di un campo;
- modifica del nome progetto o dell'anno/campagna.

Gli aggiornamenti ravvicinati vengono accorpati con un ritardo breve. Il trascinamento di un punto non
deve generare una scrittura per ogni movimento: viene sincronizzato soltanto lo stato finale stabile.

### Revisione storica

Il comando esplicito `Salva`:

1. sincronizza lo stato corrente;
2. crea una nuova revisione immutabile numerata;
3. registra data, autore tecnico, origine e riepilogo dei KPI;
4. non cancella le revisioni precedenti.

Il salvataggio automatico non crea revisioni permanenti e non affolla lo storico.

## 5. Modello dati

### `profiles`

Contiene esclusivamente le informazioni applicative minime associate all'identità Auth:

- `user_id`;
- tipo `guest`, `user` o `admin`;
- nome visualizzato, quando disponibile;
- date di creazione e ultimo accesso;
- stato dell'account.

### `projects`

Rappresenta il contenitore logico del progetto:

- UUID stabile generato dal client per operazioni idempotenti;
- proprietario Auth;
- nome progetto;
- anno/campagna;
- stato `draft`, `saved`, `archived` o `deleted`;
- origine `native`, `fieldarea` o altra sorgente futura;
- numero dell'ultima revisione;
- date di creazione, modifica e cancellazione logica;
- ambiente `TEST` o `LIVE`.

### `fields`

Una riga per ogni campo del progetto:

- UUID stabile;
- progetto di appartenenza;
- nome campo e indicazione se personalizzato;
- poligono geografico PostGIS in WGS84;
- aree escluse e passaggi;
- sesto, orientamento, capezzagna e distanza pali;
- varietà, clone e portainnesto;
- vendemmia meccanica e note;
- provenienza del perimetro;
- KPI calcolati: superficie lorda/netta, perimetro, filari, metri lineari, barbatelle e pali;
- ordine di visualizzazione;
- date di creazione, modifica e cancellazione logica.

I valori utilizzati frequentemente nei filtri Admin restano in colonne dedicate. Le strutture complesse
come esclusioni e informazioni accessorie possono restare in JSONB versionato.

### `project_revisions`

Ogni revisione conserva:

- progetto;
- numero progressivo univoco nel progetto;
- istantanea JSON completa e con versione di schema;
- autore e tipo di autore;
- motivo `manual_save`, `migration` o `admin_checkpoint`;
- KPI complessivi;
- data di creazione.

Le revisioni sono in sola lettura per Guest e utenti normali. Un amministratore non le modifica: può
soltanto crearne una nuova o ripristinarne una precedente generando una nuova revisione.

### `sync_operations`

Registro tecnico minimo per impedire doppie scritture quando la rete cade durante un salvataggio:

- identificativo univoco dell'operazione;
- progetto e dispositivo/sessione;
- tipo di operazione;
- data di ricezione;
- versione client conosciuta.

### Tabelle esistenti

Contatti, sessioni, eventi, richieste di preventivo e note Admin vengono mantenuti. Le relazioni devono
essere aggiornate verso il nuovo progetto normalizzato senza perdere i dati già raccolti.

## 6. Coda locale e funzionamento offline

- La bozza immediata continua a essere conservata localmente.
- Una coda persistente registra soltanto operazioni applicative non ancora confermate dal server.
- La coda usa IndexedDB; `localStorage` resta temporaneamente compatibile con la V29 durante la
  migrazione.
- Al ritorno della connessione, le operazioni vengono inviate in ordine e con chiavi idempotenti.
- Un indicatore tecnico di stato prevede `locale`, `sincronizzazione`, `sincronizzato`, `errore`.
- In Fase A l'indicatore può restare non invasivo; la schermata Profilo lo renderà esplicito in seguito.

La sincronizzazione non deve mai bloccare disegno, modifica o calcolo. Un errore cloud lascia intatta la
copia locale e viene ritentato senza duplicare progetto o revisione.

## 7. Conflitti

Nella Fase A un Guest lavora normalmente su un solo browser. La regola base è:

- aggiornamento accettato se parte dalla versione corrente conosciuta;
- se il server contiene una versione più recente, nessuna sovrascrittura silenziosa;
- il client conserva la modifica locale e registra un conflitto recuperabile;
- l'interfaccia di risoluzione completa verrà esposta con il Profilo.

Le revisioni manuali sono sempre aggiunte e non possono entrare in conflitto distruttivo.

## 8. Sicurezza e autorizzazioni

- Tutte le tabelle esposte attivano Row Level Security.
- Guest e utenti accedono soltanto ai record con il proprio `owner_user_id`.
- Gli amministratori possono leggere tutti i progetti e aggiornarne soltanto gli attributi gestionali
  autorizzati.
- Nessuna chiave `service_role` viene inserita nel browser o negli ZIP pubblici.
- Le operazioni privilegiate, inclusi trasferimento di proprietà e migrazione, passano da funzioni
  server protette.
- Il ruolo Admin non viene letto da metadati modificabili dall'utente.
- Eliminazione, ripristino e trasferimento di proprietà producono eventi di audit.

## 9. Eliminazione e conservazione

- `Elimina progetto` effettua prima una cancellazione logica.
- I record cancellati non sono visibili nell'elenco normale ma restano recuperabili dall'Admin per 30
  giorni.
- Le bozze Guest mai salvate e senza attività vengono archiviate dopo 90 giorni.
- La cancellazione definitiva e i tempi di conservazione aziendali saranno configurabili e verificati
  nell'informativa privacy prima dell'ambiente LIVE.
- Ambiente TEST e LIVE restano separati e filtrabili.

## 10. Predisposizione FieldArea Measure

La migrazione iniziale è amministrativa e una tantum; non richiede pulsanti nella WebApp.

Ogni campo importato conserva:

- origine `fieldarea`;
- nome file e impronta del contenuto per evitare duplicati;
- formato di origine;
- identificativo esterno, se presente;
- data del rilievo e data di importazione;
- geometria originale normalizzata;
- nome, superficie e note disponibili;
- stato `Importato — da completare`;
- prima revisione con motivo `migration`.

Il formato preferito è GeoJSON. KML viene usato come confronto su un campione. Shapefile richiede il
pacchetto completo e, quando disponibile, il file `.prj`. L'importazione futura self-service rimane una
funzione PRO separata.

## 11. Compatibilità V29

- Il formato locale V29 viene letto e migrato senza cancellarlo finché il salvataggio cloud non è
  confermato.
- Gli identificativi locali esistenti vengono riutilizzati o mappati una sola volta.
- I calcoli continuano a essere eseguiti dal motore attuale; il database memorizza i risultati ma non li
  ricalcola con formule differenti.
- La Fase A non cambia HTML/CSS visibile, controlli mappa o comportamento responsive.
- Desktop e mobile usano lo stesso servizio dati e le stesse regole di sincronizzazione.

## 12. Osservabilità e KPI

Eventi tecnici necessari:

- prima bozza cloud creata;
- autosalvataggio riuscito/fallito;
- revisione creata;
- coda offline svuotata;
- conflitto rilevato;
- progetto cancellato/ripristinato;
- progetto migrato.

KPI iniziali:

- percentuale di progetti con perimetro sincronizzati;
- tempo medio tra modifica e conferma cloud;
- errori di sincronizzazione per 100 salvataggi;
- numero di progetti Guest, utenti e Admin;
- progetti e superfici per campagna;
- revisioni per progetto;
- progetti FieldArea migrati e duplicati evitati.

Gli eventi analytics non necessari restano subordinati alla relativa scelta privacy; gli eventi tecnici
indispensabili al salvataggio non contengono coordinate duplicate o dati di contatto.

## 13. Strategia di rilascio

1. Migrazione e servizi soltanto in Ambiente TEST.
2. Test automatici di schema, RLS, idempotenza, offline e compatibilità V29.
3. Verifica con più Guest e un account Admin di prova.
4. Test di caduta rete durante autosalvataggio e salvataggio manuale.
5. Controllo che desktop e mobile producano la stessa struttura dati.
6. Migrazione pilota di un singolo progetto FieldArea, fuori dalla UI pubblica.
7. Revisione privacy, backup e criteri di conservazione.
8. Solo dopo approvazione esplicita, attivazione LIVE.

## 14. Criteri di accettazione

- Chiudendo il primo perimetro nasce una sola bozza cloud.
- Modifiche rapide producono un solo stato finale coerente.
- `Salva` crea esattamente una nuova revisione.
- Ricaricando la pagina sullo stesso dispositivo si recupera il progetto.
- Con rete assente il lavoro prosegue e viene sincronizzato al ritorno della connessione.
- Ritentare la stessa operazione non duplica progetti, campi o revisioni.
- Un Guest non può leggere progetti altrui.
- Un futuro utente normale non può leggere progetti altrui.
- L'Admin vede Guest, utenti e propri progetti senza usare privilegi nel client.
- La cancellazione è recuperabile per 30 giorni.
- Un progetto FieldArea di prova viene importato con provenienza e revisione iniziale.
- Tutti i test V29 continuano a superare senza regressioni di calcolo o interfaccia.

## 15. Sequenza di sviluppo proposta

1. Migrazione dello schema e politiche RLS.
2. Modulo repository cloud indipendente dall'interfaccia.
3. Coda IndexedDB e idempotenza.
4. Autosalvataggio per eventi significativi.
5. Revisioni manuali.
6. Adeguamento Admin e filtri per proprietario/campagna.
7. Migrazione compatibile dei dati locali V29.
8. Test integrati e pilota FieldArea.

Questa sequenza costituisce la Fase A. Profilo, login visibile e importazione PRO saranno specifiche
successive e non devono essere anticipati durante l'implementazione.
