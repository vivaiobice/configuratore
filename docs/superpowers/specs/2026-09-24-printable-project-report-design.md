# Studio preliminare stampabile, QR e storico versioni

Data: 24 settembre 2026  
Baseline applicativa: V40  
Stato: specifica approvata, nessuna modifica applicativa eseguita

## 1. Obiettivo

Creare un documento A4 professionale e condivisibile che riepiloghi un singolo campo oppure l'intero
progetto viticolo. Il documento deve essere riconoscibile come elaborato Vivai Obice, mostrare sia la
mappa satellitare sia lo schema tecnico, riportare tutti i dati già calcolati dal configuratore e
collegarsi tramite QR a una versione consultabile del progetto.

Il documento è uno strumento preliminare concreto e verosimile, ma non deve essere presentato come
progetto professionale firmato, rilievo topografico o pratica autorizzativa.

## 2. Nome del documento e linguaggio

Titolo ufficiale:

> **Studio preliminare ed esemplificativo di impianto viticolo**

Il termine `progetto` può essere usato per indicare il contenitore digitale nel configuratore, ma il
titolo e il disclaimer del documento devono usare `studio preliminare ed esemplificativo`.

Il testo deve essere in italiano, chiaro e non promozionale. Le grandezze usano unità metriche e
formattazione italiana. I dati assenti vengono mostrati come `Da definire`, non come zero quando zero
potrebbe essere interpretato come un valore reale.

## 3. Ambito

### Incluso

- scelta tra stampa dell'intero progetto e stampa di uno o più campi selezionati;
- dati del destinatario precompilati e modificabili soltanto per il documento;
- frontespizio, riepilogo generale, scheda completa per campo e pagina note/limitazioni;
- carta intestata Vivai Obice, logo e piè di pagina ripetuti;
- mappa satellitare con perimetro, misure lati, filari, Nord, passaggi e aree escluse;
- schema tecnico pulito della stessa geometria;
- QR locale, senza servizi esterni, verso la pagina condivisa del configuratore;
- visualizzazione Guest senza login e senza permesso di modifica;
- modifica soltanto dopo login del proprietario o di un Admin autorizzato;
- collegamento del documento a una revisione immutabile del progetto;
- storico versioni con data, autore e riepilogo delle modifiche;
- consenso esplicito al disclaimer prima di stampare o salvare in PDF;
- comportamento coerente su desktop e mobile;
- test automatici e prova di stampa A4.

### Escluso

- firma digitale o firma di tecnico abilitato;
- valore catastale, topografico, autorizzativo o asseverativo;
- preventivo economico e prezzi;
- invio automatico via e-mail o messaggistica;
- modifica anonima tramite QR;
- memorizzazione nel database del file PDF binario;
- aggiornamento del profilo con i dati modificati nella finestra di stampa;
- cambiamenti a formule, geometria, filari, pali, barbatelle, esclusioni o capezzagne.

## 4. Flusso utente

### Apertura

Il comando esistente `Proposta / PDF` diventa `Stampa / PDF` e apre una schermata di preparazione senza
generare immediatamente il documento.

La schermata contiene:

1. selezione `Intero progetto` oppure `Campi selezionati`;
2. elenco dei campi con checkbox, nome, superficie e materiale vegetale;
3. dati del destinatario;
4. riepilogo del documento che verrà creato;
5. anteprima;
6. checkbox obbligatoria di presa visione del disclaimer;
7. comandi `Stampa / Salva PDF` e `Copia link cliente`.

Se il progetto contiene un solo campo, `Intero progetto` resta disponibile ma non aggiunge una pagina
di riepilogo ridondante. Se nessun campo valido è selezionato, l'anteprima e la stampa restano
disabilitate con un messaggio esplicito.

### Destinatario

I dati vengono precompilati, in ordine di priorità, da:

1. contatto già associato al progetto;
2. nome visualizzato ed e-mail dell'account autenticato;
3. campi vuoti compilabili manualmente.

Campi previsti:

- nome e cognome;
- azienda;
- e-mail;
- telefono;
- indirizzo;
- località dell'impianto;
- referente.

Le modifiche fatte qui vengono conservate nello snapshot del documento e non aggiornano il profilo o
il contatto principale.

### Accettazione del disclaimer

Prima della prima stampa/salvataggio PDF viene mostrato il testo completo. La checkbox usa la formula:

> Ho letto e compreso la natura preliminare ed esemplificativa del documento.

Vengono registrati versione del disclaimer, data/ora, utente Auth quando presente e identificativo del
documento. Una modifica ai contenuti o ai campi selezionati invalida l'accettazione precedente e
richiede una nuova conferma.

## 5. Struttura del documento

### 5.1 Frontespizio

- logo Vivai Obice;
- titolo ufficiale;
- nome e codice del progetto;
- destinatario e referente;
- località dell'impianto;
- data di emissione;
- numero della revisione sorgente;
- codice univoco del documento;
- QR e breve istruzione `Inquadra per consultare il progetto`;
- disclaimer sintetico.

### 5.2 Riepilogo progetto

Presente quando sono inclusi almeno due campi:

- elenco campi selezionati;
- superficie lorda e netta totali;
- filari e metri lineari totali;
- barbatelle calcolate e quantità commerciale totale;
- pali intermedi, pali di testa e pali totali;
- varietà, cloni, portinnesti e annate presenti;
- note generali del progetto.

I totali sono somme dei risultati del motore esistente. Non vengono introdotte formule parallele.

### 5.3 Scheda campo — mappa satellitare

Ogni campo inizia su una nuova pagina e contiene:

- nome campo e località;
- immagine satellitare inquadrata sul campo;
- perimetro chiaro ma meno evidente dei filari;
- misure dei singoli lati;
- filari;
- aree escluse e passaggi;
- freccia del Nord;
- attribuzione della sorgente cartografica.

La mappa viene prodotta con un renderer separato dalla mappa di lavoro per non cambiare posizione,
zoom o stato dell'editor. La base satellitare viene catturata e l'overlay tecnico viene mantenuto
vettoriale sopra l'immagine, così testo e linee restano nitidi in stampa.

### 5.4 Scheda campo — schema tecnico

Lo schema senza satellite mostra la stessa estensione e gli stessi elementi cartografici. Usa sfondo
neutro, perimetro, filari, esclusioni, passaggi, quote laterali e Nord. Se la geometria non è valida,
non viene mostrata una mappa ingannevole: compare `Perimetro non disponibile` e la stampa richiede una
conferma specifica.

### 5.5 Dati campo

- superficie lorda e netta;
- perimetro e vertici;
- distanza piante e distanza filari;
- orientamento filari;
- capezzagna e distanza pali;
- numero filari e metri lineari;
- barbatelle calcolate;
- quantità commerciale, evidenziata come dato principale;
- pali intermedi, pali di testa e pali totali;
- vendemmia meccanizzata;
- vitigno, clone/selezione e portinnesto;
- annata dell'impianto;
- inquadramento dell'impianto;
- riferimenti e note.

### 5.6 Pagina finale

- disclaimer completo;
- versione e data del documento;
- revisione del progetto;
- utente che ha generato il documento;
- QR e URL breve leggibile;
- dati aziendali Vivai Obice.

## 6. Carta intestata

Il logo `assets/logo-vivai-obice-lineare.png` viene usato nell'intestazione di ogni pagina. Il piè di
pagina ripete:

> **VIVAI OBICE S.S.A.** · Via Cossano, 6 · 12058 Santo Stefano Belbo (CN)  
> info@vivaiobice.com · 393 892 9801 · P. IVA 01656710041 · SDI SUBM70N

Il piè di pagina include inoltre `Pagina X di Y`, codice progetto, revisione e codice documento. Il
layout usa A4 verticale, margini di stampa sicuri e regole `break-*` esplicite. Le immagini non vengono
spezzate tra due pagine.

## 7. Disclaimer

### Sintetico

> Elaborato preliminare ed esemplificativo basato sui dati inseriti nel configuratore. Non costituisce
> progetto tecnico firmato, rilievo topografico, pratica autorizzativa o asseverazione.

### Completo

> Il presente documento è uno studio preliminare ed esemplificativo di supporto alla valutazione di un
> possibile impianto viticolo. I dati, le quantità, le geometrie, le distanze e le rappresentazioni
> cartografiche derivano dalle informazioni inserite nel configuratore e da elaborazioni indicative.
> Il documento non costituisce progetto tecnico firmato, rilievo topografico o catastale, pratica
> autorizzativa, asseverazione, direzione lavori o garanzia di realizzabilità. Prima dell'esecuzione
> devono essere verificati sul posto confini, quote, pendenze, vincoli, accessi, distanze, sottoservizi e
> prescrizioni applicabili, ricorrendo quando necessario a professionisti abilitati e agli enti
> competenti.

Il testo deve essere sottoposto a verifica legale/tecnica aziendale prima del passaggio da TEST a LIVE.
La versione iniziale del testo è identificata come `VO-DISC-2026-01`.

## 8. QR, pagina condivisa e autorizzazioni

Il QR non usa il vecchio link di ripresa che trasferisce o reclama la proprietà del progetto. Usa un
token di condivisione dedicato, casuale e ad alta entropia. Nel database viene memorizzato soltanto
l'hash del token.

URL previsto:

`shared-project.html?report=<document-id>&token=<secret>`

Comportamento:

- un Guest può consultare la revisione collegata al documento senza login;
- il Guest non vede comandi di modifica e non può chiamare RPC di scrittura;
- i dati privati del profilo e del contatto non vengono restituiti dalla RPC pubblica;
- il proprietario autenticato e l'Admin vedono `Apri nel configuratore`;
- se la revisione corrente è successiva a quella stampata, la pagina distingue chiaramente
  `Versione del documento` e `Versione corrente`;
- la modifica avviene sul progetto corrente dopo login, mai dentro la revisione immutabile;
- il link può essere revocato e rigenerato senza modificare il progetto o la revisione;
- un link revocato restituisce una pagina neutra senza rivelare l'esistenza del progetto.

La pagina condivisa mostra anche il disclaimer sintetico vicino al titolo e quello completo nel fondo.
Qualsiasi comando di stampa presente nella pagina condivisa richiede la medesima checkbox.

## 9. Storico versioni e audit

Ogni salvataggio manuale continua a creare una revisione immutabile. Lo storico deve aggiungere:

- `created_by_user_id`: identità che ha materialmente creato la revisione;
- nome visualizzato dell'autore risolto dal profilo;
- data e ora;
- motivo della revisione;
- riepilogo strutturato delle categorie modificate;
- campi interessati;
- riferimento alla revisione precedente.

Le categorie iniziali sono: `geometry`, `exclusions`, `layout`, `material`, `identity`, `notes`.
L'Admin può ripristinare una revisione creando una nuova revisione; nessuna riga storica viene
sovrascritta o eliminata dall'interfaccia.

Un documento punta sempre a una revisione precisa. Se il progetto non possiede ancora una revisione
manuale, il flusso di stampa sincronizza lo stato e crea una revisione con motivo `report_issue` prima
di generare il documento.

## 10. Modello dati aggiuntivo

### `project_revisions`

Campi aggiuntivi:

- `created_by_user_id uuid`;
- `change_summary jsonb`;
- motivo `report_issue` ammesso dal vincolo;
- indice per progetto e data.

### `project_reports`

- `id uuid` — codice documento;
- `project_id uuid`;
- `revision_number integer`;
- `created_by_user_id uuid`;
- `selected_field_ids text[]`;
- `recipient_snapshot jsonb`;
- `disclaimer_version text`;
- `disclaimer_accepted_at timestamptz`;
- `disclaimer_accepted_by uuid` nullable per Guest;
- `share_token_hash text`;
- `share_revoked_at timestamptz`;
- `created_at timestamptz`.

RLS consente lettura al proprietario e all'Admin. L'accesso Guest avviene esclusivamente tramite una
RPC pubblica che verifica token e revoca e restituisce un payload sanificato. Le scritture avvengono
tramite RPC autenticata; nessuna `service_role` è presente nel browser.

## 11. Modello applicativo

Il vecchio modello per un solo campo viene sostituito da `buildProjectReportModel`, che produce:

- metadati documento e azienda;
- destinatario snapshot;
- riepilogo aggregato;
- array ordinato di campi;
- immagine satellitare e overlay per campo;
- URL condiviso e SVG del QR;
- disclaimer e accettazione;
- revisione sorgente e autore.

Il modello è puro e testabile. La cattura satellitare, il database, il QR e il rendering HTML sono
adattatori separati. Il renderer HTML non legge direttamente `localStorage`, Supabase o la mappa.

## 12. Gestione errori

- Se il cloud non è disponibile, l'anteprima locale può essere mostrata ma QR, link condiviso e stampa
  definitiva restano disabilitati: il documento non deve dichiarare una revisione inesistente.
- Se una tile satellitare non può essere acquisita, il sistema mantiene lo schema tecnico e segnala
  `Immagine satellitare non disponibile`; non stampa in silenzio una mappa bianca.
- Se un campo è stato eliminato dopo l'apertura della finestra, il modello viene ricostruito prima
  dell'emissione.
- Se la revisione cambia in un'altra sessione, l'emissione viene fermata e richiede il ricaricamento
  dei dati.
- Se il popup di stampa è bloccato, il documento resta disponibile nella stessa scheda con un comando
  manuale.
- Il QR viene generato localmente e non invia URL o dati a servizi QR esterni.

## 13. Sicurezza e privacy

- token di condivisione di almeno 256 bit, memorizzato solo come SHA-256;
- confronto del token lato database;
- payload pubblico limitato alla revisione, ai campi selezionati e ai dati tecnici;
- nessuna e-mail, telefono, indirizzo personale o metadato Auth nel payload pubblico;
- RLS su tutte le nuove tabelle esposte;
- `app_metadata` per il ruolo Admin, mai `user_metadata`;
- funzioni privilegiate nel namespace `private`, con `search_path=''`, grant minimi e wrapper pubblici;
- link revocabile;
- attribuzione della cartografia sempre visibile;
- log degli eventi `report_issued`, `report_shared`, `report_share_revoked` e
  `shared_report_viewed`, senza registrare il token.

## 14. Compatibilità

- nessuna modifica alle formule esistenti;
- nessuna modifica ai gesti o ai controlli delle mappe principali;
- desktop e mobile usano lo stesso dialogo logico con presentazioni responsive;
- il vecchio `report.html` resta l'entry point e viene evoluto senza rompere i link interni;
- i progetti locali restano leggibili;
- Ambiente TEST resta obbligatorio fino all'approvazione esplicita del passaggio LIVE;
- nessuna release ZIP viene prodotta senza una richiesta separata.

## 15. Criteri di accettazione

1. È possibile produrre il documento di un campo, di più campi selezionati o dell'intero progetto.
2. La quantità commerciale è evidenziata e non viene confusa con quella calcolata.
3. Ogni campo presenta mappa satellitare e schema tecnico coerenti.
4. Logo, intestazione e dati aziendali compaiono su tutte le pagine stampate.
5. Il destinatario è precompilato ma le modifiche restano limitate al documento.
6. Senza checkbox del disclaimer non si può stampare, salvare PDF o copiare il link cliente.
7. Il QR apre la revisione corretta senza login e non permette al Guest di modificare.
8. Proprietario e Admin possono aprire il progetto corrente per modificarlo dopo il login.
9. Lo storico mostra data, autore e categorie della modifica.
10. Revocando il link, QR e URL non restituiscono più il progetto.
11. I test esistenti continuano a passare e i calcoli non cambiano.
12. L'anteprima A4 è verificata visivamente su desktop e iPhone, inclusi documenti con più campi.
