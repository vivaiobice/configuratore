# Release 1.3.3 — satellite 3D e distanze sul terreno

Pacchetto completo Configuratore + Conteggi dell’8 ottobre 2026. Versione pubblica coordinata **1.3.3 · LIVE**.

## Vista 3D

Il rilievo conserva tutti i punti del modello altimetrico acquisito e ora riceve la stessa immagine satellitare della mappa, georeferenziata sulla superficie. La scala verticale resta ×1. Un errore di caricamento dell’immagine viene mostrato senza aprire una superficie verde sostitutiva.

Si può spostare, ruotare, avvicinare/allontanare e inclinare la vista fino a 85°. I piccoli comandi sulla mappa comprendono orientamento nord, rotazione, zoom, inclinazione, ricentratura sul campo e ritorno 2D. Su desktop funzionano trascinamento, tasto destro/Ctrl e trackpad; su mobile un dito sposta, due dita ruotano/ingrandiscono e il movimento congiunto inclina. I comandi hanno feedback al passaggio del mouse e al focus. La chiusura ripristina la camera 2D precedente e rilascia Worker e risorse grafiche.

## Calcolo

“Adatta al terreno” segue le curve a quota costante del modello e verifica l’interfila misurata sulla superficie, con tolleranza ±20 cm. Passaggi ed esclusioni separano i tratti e le porzioni; l’adattamento di una porzione conserva la direzione delle altre. Le quantità derivano dai tratti effettivamente ritagliati: due pali di testa per ogni tratto, barbatelle e pali intermedi secondo lunghezza sul terreno e sesto. La capacità teorica superficie/sesto è un riferimento, non un numero imposto al disegno.

Il motore evita ripetizioni della stessa ricostruzione nativa e semplifica soltanto nodi esattamente collineari; le altimetrie non sono appiattite né ricampionate. Il limite originale di 30 secondi e 500.000 nodi resta attivo. Una disposizione completa e già verificata può essere conservata interrompendo la ricerca facoltativa di una fase migliore, con un margine per completare il risultato: questo non garantisce un massimo globale. Gli errori distinguono il limite di lavoro dal limite di tempo e mantengono il progetto precedente.

Il comando Manuale con terreno acquisito tiene conto della distanza a terra per famiglie di filari diritti verificabili, conservando la direzione. Le curve manuali o variazioni che non permettono questa verifica ricevono un messaggio esplicito. I progetti manuali precedenti, il percorso senza altimetria, gli archivi e gli Undo conservano il comportamento già raggiunto. I nuovi disegni misurati vengono ricostruiti dal modello e dagli input durante il replay, usando lo stesso limite di calcolo del richiedente.

## Verifiche e limiti

Le prove del browser usano l’applicazione reale, MapLibre 4.7.1, Worker e WebGL, con autenticazione anonima e immagini/modelli sintetici locali. Il rilievo ha 4.225 punti e 8.192 facce; tutte le quote e le coordinate UV dell’immagine sono controllate. Le prove comprendono desktop, touch emulato, comandi, gesture, camera 2D, annullamento, cambio campo e rilascio delle risorse.

Il calcolo viene verificato anche su un campo di 100 × 25 m con una variazione effettiva della pendenza, e su un campo a L diviso da un passaggio da 1,50 m con porzioni indipendenti. Le prove dei filari manuali comprendono piani inclinati, variazioni native deboli e il rifiuto di un terreno non certificabile. L’esito delle regressioni, del controllo sintattico e delle verifiche dell’archivio estratto è riportato nel manifest.

Il controllo esteso conserva cinque rifiuti geometrici già riproducibili sulla 1.3.2: alcuni passaggi interni che non dividono il campo, contatti dei filari sui confini e una particolare piega del terreno. La suite nativa completa non è tutta verde; questi casi non vengono presentati come risolti. La strada da 1,50 m che divide il campo a L è invece verificata positivamente.

Le geometrie con contatti di confine o convergenze non verificabili possono ancora richiedere una revisione del disegno; non viene accettato un risultato parziale. Il campo reale Cascina Elena e Safari/iOS su dispositivi fisici richiedono le prove dell’utente. Le quote sono quelle del DTM, con la precisione e la risoluzione dichiarate dalla fonte.

## Caricamento

`Vivai_Obice_Piattaforma_v1.3.3.zip` contiene l’intera piattaforma con `index.html` e `conteggi/` alla radice. Leggere [LEGGIMI_CARICAMENTO_UNICO.md](LEGGIMI_CARICAMENTO_UNICO.md), conservare la versione precedente e caricare tutti i file. Riaprire online dopo aver chiuso le vecchie schede, conservando IndexedDB e localStorage.

Comfortaa nell’interfaccia, font precedenti nel PDF, strumenti occhio, coordinate precise, hover, filigrana non ruotata e logo del contatore sono conservati. Conteggi resta locale e il suo Service Worker controlla soltanto `/conteggi/`. Non sono necessarie migrazioni SQL.
