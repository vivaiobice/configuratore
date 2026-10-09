# Collaudo 1.3.4

Le prove impiegano il Configuratore reale, MapLibre 4.7.1, Worker e WebGL in Chromium con rendering software SwiftShader. I dati di terreno, satellite e account sono fixture anonime locali. Non sono un rilievo del campo Cascina Elena né un collaudo su dispositivi fisici.

## Risultati numerici e regressioni

La suite seriale comprende 1.830 test: 1.824 superati e sei falliti nel primo passaggio. Cinque rifiuti geometrici risultano già presenti nella base `274f031`: due sostituzioni di passaggi interni senza divisione del campo, una topologia di confine del metodo precedente, una porzione eterogenea non coperta e una piega nativa da 5 m. Rimangono rifiuti espliciti, con progetto precedente conservato.

Il sesto errore era nel riferimento del test di budget: sommava costi di operazioni indipendenti anziché misurare la catena con cache condivisa. Il riferimento corretto misura la catena reale; una modifica di prova che omette il budget del replay fa fallire il controllo. Il codice di produzione e i limiti non sono stati allentati. Il successivo gruppo di integrazione terreno supera **10/10 test**.

Il campo anonimo a L di 140 × 70 m, diviso da una strada da 1,50 m, usa 4.225 quote Float32 e 8.192 facce native. Generazione, serializzazione e replay in un Worker nuovo consumano **473.284 nodi e 15,44 secondi**, entro 500.000 nodi e 30 secondi. Risultato: 13 filari automatici verificati, porzione manuale conservata. La superficie servita certificata dal nuovo metodo è conservativa e non equivale alla banda completa del metodo precedente.

## Conteggi

Desktop e mobile superano l’avvio reale con Service Worker limitato a `/conteggi/`: conteggio 7, chiusura delle schede, riapertura offline a freddo, incremento a 8, ritorno agli strumenti con bozza conservata, salvataggio e secondo riavvio offline dell’archivio. Sono controllati anche proprietario differente, bozze estranee e vertici non confermati.

Il logo reale è centrato con errore misurato di 0 px, fondo CSS trasparente, 1.104.763 pixel trasparenti nell’asset e contorno chiaro. Le prove grafiche dedicate includono desktop, mobile 390 px e mobile 320 px.

## Vista 3D e archivio

La fluidità rimane un limite aperto. La matrice completa supera 20 stati grafici desktop e 16 mobile, oltre ai gesti, errori, annullamenti e ripristini funzionali. Conserva dieci fasi oltre 150 ms: massimo 366,6ms desktop e 366,5ms mobile nel renderer software. L’esito funzionale e quello prestazionale sono distinti; il pacchetto è per le prove su terreno e dispositivi reali. Le alternative di renderer, risoluzione e dimensione delle tile che non miglioravano i gesti non sono state inserite.

I risultati conclusivi della matrice grafica, dei gesti, dei tempi, dell’annullamento, del cambio campo e della riapertura mobile sono registrati nel manifest della consegna. Il controllo della navigazione conserva la soglia di 150 ms: le fasi che la superano restano fallite anche quando le verifiche funzionali proseguono. Apertura a freddo e primo ingresso del puntatore sono misurati separatamente.

Il manifest elenca gli SHA256 dell’inventario sorgente congelato. Il pacchetto completo contiene quei file e il manifest alla radice; le verifiche sull’archivio estratto usano i suoi script e i suoi moduli, senza sostituire i sorgenti con il checkout di lavoro. La ricevuta dell’archivio riporta il suo SHA256 e gli esiti finali.

Le revisioni indipendenti hanno controllato la prova numerica, l’isolamento della visualizzazione, il ripristino dell’editor e la cache coordinata. Le prestazioni su hardware accelerato, il terreno reale e Safari/iOS fisici restano da provare.

## Ricerca per coordinate

Le prove mirate esercitano il parser e le vere funzioni di ricerca della mappa, preservando la ricerca per indirizzo. L’esempio fornito risolve longitudine 7.963694444444445 e latitudine 44.97236111111111 senza richieste al geocoder. Sono controllati assi e segni, simboli Unicode, limiti, componenti DMS non validi, notazioni miste e selezioni con chiave precedente. Un secondo passaggio RED/GREEN protegge i metadati di località e le richieste pendenti dei campi: la navigazione per coordinate non li cancella. Il collaudo dell’archivio esercita anche i controlli reali della ricerca nel browser.
