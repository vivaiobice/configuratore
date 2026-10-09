# Release 1.3.4 — terreno continuo e navigazione a gesti

Pacchetto completo Configuratore + Conteggi dell’8 ottobre 2026. Versione pubblica coordinata **1.3.4 · LIVE**; la consegna del file non esegue la pubblicazione sul server.

**Pacchetto per le prove: la fluidità 3D non è ancora certificata.** Le correzioni funzionali sono distinte dalle prestazioni: la navigazione caricata supera ancora la soglia di 150 ms nel renderer software del collaudo. Non si dichiara concluso l’obiettivo di una navigazione sempre fluida su mobile.

## Navigazione e vista 3D

I pulsanti manuali di navigazione sono rimossi. Sul trackpad due dita spostano la mappa; con Shift il movimento verticale inclina la camera e quello orizzontale ruota la vista. I movimenti diagonali combinano le due azioni. Zoom, trascinamento, rotazione e gesti touch restano disponibili. Chiudendo il 3D vengono ripristinate esattamente camera e impostazioni della mappa 2D.

Una sola superficie altimetrica nativa sostiene l’immagine satellitare, il campo e i filari. Il DTM acquisito del campo viene raccordato al rilievo di contesto, evitando il precedente rilievo locale circondato da una mappa piatta. La scala verticale è ×1. Il raccordo e il ricampionamento riguardano soltanto la visualizzazione; il calcolo usa sempre le quote originali del modello acquisito. Il contesto ha una risoluzione variabile e non costituisce un nuovo rilievo di precisione del campo.

Campo e filari seguono la stessa superficie e la stessa camera. Una collina può nascondere le parti realmente dietro il rilievo quando l’inquadratura è molto bassa; le prove distinguono questa occlusione naturale dalla scomparsa errata di elementi visibili. Durante la navigazione sono sospesi i punti inattivi di modifica che causavano render ripetuti. Le etichette delle quote restano disponibili con il comando occhio, usando una proiezione leggera; la scala metrica è temporaneamente rimossa in 3D. Tornando all’editor vengono ripristinati punti, etichette originali e scala.

Il rilievo di contesto proviene da [Terrain Tiles su AWS](https://registry.opendata.aws/terrain-tiles/). La fonte del DTM del campo, la relativa licenza e il contesto sono riportati nella mappa. Un errore di caricamento annulla la vista e conserva i dati e la camera precedente.

## Adatta al terreno

Per i terreni nativi con variazioni compatibili viene aggiunta una verifica delle distanze minime sulla superficie: un percorso trasversale verificato fornisce il limite superiore e la pendenza nativa fornisce il limite inferiore. Entrambi devono rispettare l’interfila impostata con tolleranza ±20 cm; le quote dei filari restano costanti entro 1 mm nel modello. Perimetri, fori, passaggi e porzioni sono controllati senza modificare le altimetrie o imporre un numero teorico di viti.

Il motore riusa le ricostruzioni già controllate nello stesso calcolo ed evita operazioni duplicate sulle facce interamente interne. Il limite resta **30 secondi e 500.000 nodi**, compresa la ricostruzione indipendente del risultato serializzato. Le porzioni non selezionate restano invariate. Ogni frammento fisico ha due pali di testa; le altre quantità derivano dalle lunghezze sul terreno.

La superficie effettiva del campo conserva il calcolo nativo. Per il nuovo metodo la superficie servita è una porzione conservativa certificata attorno ai filari, esplicitamente distinta dalla banda completa del metodo precedente. Non si confrontano guadagni fra queste due misure e non si dichiara un massimo globale. Un terreno o un contatto di confine non verificabile conserva il progetto precedente con un esito esplicito, anziché accettare un disegno parziale.

## Contatore

Il logo lineare in basso è centrato, con fondo trasparente e contorno chiaro aderente al disegno. La filigrana e il funzionamento del contatore, degli archivi e del salvataggio locale restano quelli precedenti. La versione e la cache vengono aggiornate insieme al Configuratore.

## Ricerca per coordinate

La ricerca esistente accetta anche `44°58'20.5"N 7°57'49.3"E` e coordinate decimali nell’ordine latitudine, longitudine, per esempio `44.972361, 7.963694`. Le lettere N/S ed E/W determinano gli assi e il segno; sono accettati anche i simboli tipografici di minuti e secondi. La mappa raggiunge il punto e mostra il marcatore senza interrogare un geocoder. Coordinate incomplete, fuori intervallo o con minuti/secondi non validi restano locali e mostrano un errore. La ricerca per indirizzo resta disponibile. Navigare tramite coordinate non modifica i dati di località del progetto o le richieste già in corso per i campi.

## Verifiche e limiti

I risultati conclusivi sul sorgente congelato e sull’archivio estratto sono registrati nel manifest. Le prove 3D utilizzano l’app reale con MapLibre 4.7.1, Worker e WebGL, DTM nativo Float32 da 5 m e immagini locali indipendenti. Comprendono terreno dentro e fuori il campo, più inclinazioni e orientamenti, gesti, errori di sorgente, annullamento, cambio campo e ritorno 2D. Il controllo del logo comprende desktop, formato mobile e riapertura offline a freddo del contatore.

La soglia di 150 ms riguarda la navigazione con terreno caricato e puntatore già sulla mappa. **Il controllo prestazionale resta fallito**: il collaudo completo conserva dieci fasi fallite e un intervallo massimo di 366,6 ms su desktop e 366,5 ms su mobile. Il manifest indica separatamente esito funzionale e prestazionale. Apertura a freddo e primo ingresso del puntatore sono misurati separatamente. Il collaudo usa Chromium con rendering software SwiftShader e touch emulato; questi tempi non certificano né smentiscono la fluidità su hardware accelerato reale. Un aggiornamento del renderer e una riduzione della risoluzione non hanno risolto gli scatti e non sono inclusi.

Il caso numerico principale è un campo irregolare a L di 140 × 70 m, diviso da una strada da 1,50 m, su un modello da 4.225 punti e 8.192 facce con variazioni native non appiattite. Sono verificati anche un terreno diagonale con foro, la conservazione della porzione manuale, il replay in un Worker indipendente e il rifiuto di risultati alterati. Le regressioni del percorso manuale precedente rimangono nel collaudo.

I rifiuti geometrici già documentati nella 1.3.3 non sono dichiarati risolti da questa revisione: alcuni contatti di confine, passaggi interni che non dividono il campo e una particolare piega nativa possono richiedere una revisione. La suite estesa non va confusa con i casi mirati superati. Il campo reale Cascina Elena e Safari/iOS su dispositivi fisici richiedono le prove dell’utente; le fixture anonime e il touch emulato non li certificano.

## Caricamento

`Vivai_Obice_Piattaforma_v1.3.4.zip` contiene l’intera piattaforma con `index.html` e `conteggi/` alla radice. Seguire [LEGGIMI_CARICAMENTO_UNICO.md](LEGGIMI_CARICAMENTO_UNICO.md), conservare il pacchetto precedente e caricare tutti i file. Chiudere le vecchie schede e riaprire online; conservare IndexedDB e localStorage. Conteggi rimane locale e il Service Worker controlla soltanto `/conteggi/`. Non servono migrazioni SQL.
