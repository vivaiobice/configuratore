# Release 1.3.2 — vista 3D e navigazione

Aggiornamento dell’8 ottobre 2026. Pacchetto statico completo Configuratore + Conteggi, versione pubblica coordinata **1.3.2 · LIVE**. Nessuna pubblicazione remota o modifica del backend è inclusa nell’operazione.

## Vista e comandi

Il pulsante 3D resta sulla mappa condivisa fra pagina principale, Campi ed editor mobile. Disegna il terreno e i filari usando tutti i vertici e le facce del modello congelato, a scala verticale ×1. I filari curvi, le esclusioni e i confini delle porzioni seguono le quote dello stesso modello. Il riferimento grafico è la quota del centro del campo; le quote assolute del modello restano inalterate.

Su desktop: trascinamento per spostare, tasto destro e trascinamento per ruotare/inclinare, trackpad per spostare, Shift + scorrimento per ruotare, pinch per ingrandire. Su touch: un dito per spostare, due dita per zoom/rotazione, due dita che si muovono insieme per inclinare.

Il pulsante 2D ripristina esattamente camera, padding e gesti precedenti. Durante la preparazione il pulsante permette di annullare l’apertura. Cambio campo, cambio proprietario, modifiche del disegno e invalidazione della proposta chiudono la vista precedente; risposte tardive non la riaprono.

L’occhio conserva tre scelte indipendenti: Campo, Schema vigneto e Quote. Nomi e dimensioni seguono la superficie durante la navigazione. Nascondere un elemento non cambia il progetto. Il ritorno in 2D ripristina i layer secondo le scelte dell’utente.

L’anteprima 3D usa passaggi, porzioni e filari della proposta corrente. Un passaggio disegnato oltre il campo viene ritagliato soltanto per la visualizzazione, senza modificare i suoi input o il calcolo. La camera del workspace salvato rimane quella 2D anche quando si naviga in 3D.

## Verifiche

Il browser reale esegue l’applicazione con MapLibre 4.7.1, Worker e WebGL; solo autenticazione, provider e immagini sono fixture anonime. Il modello di prova ha 4.225 punti e 8.192 facce, tutti conservati e disegnati. Le prove controllano tutte le quote, i disegni effettivi WebGL, camera e gesti, visibilità, quantità immutate, chiusura, riapertura, annullamento e cambio verso un campo distante.

Nella prima prova completa del nuovo renderer, il massimo intervallo fra fotogrammi è 50,1 ms su desktop e 66,7 ms su touch emulato, contro circa 383 ms del renderer precedente. Le finestre ferme, il ridisegno continuo e ciascun gesto devono rispettare il limite di 150 ms: il runner applica il limite a ogni fase. Non sono prove su Safari/iOS o dispositivi fisici.

Le regressioni includono i risultati completi dei 144 campi manuali della 1.2.6, replay dei progetti 1.3.0, controller e storico, editor e coordinate, Conteggi, documenti, versione e precache. Le ricevute associate al manifest e all’archivio distinguono verifica dei sorgenti e verifica dei byte estratti. Non si estendono questi esiti ai casi geometrici nativi ancora aperti nella [revisione 1.3.1](README_RELEASE_1.3.1.md), né al pilot reale Cascina Elena, che resta da collaudare con il suo modello acquisito.

## Versione e caricamento

APP_CONFIG, package e lock dei due strumenti sono coordinati a 1.3.2. Schema, identità del modello, algoritmo e envelope restano invariati. Le query dei moduli modificati sono allineate a `v=1.3.2`; il precache Conteggi contiene le 41 risorse esatte raccolte dal grafo reale e usa il namespace 1.3.2.

Conteggi resta locale; sincronizzazione, amministrazione, invio e trasferimento ospite mantengono i flag disattivati. Il worker ha scope `/conteggi/` e non controlla il configuratore alla radice. Comfortaa resta nell’interfaccia e i font precedenti restano nel documento. Hover, filigrana non ruotata e logo nel contatore sono conservati.

`Vivai_Obice_Piattaforma_v1.3.2.zip` contiene la piattaforma completa con `index.html` e `conteggi/` alla radice. Il manifest identifica il commit sorgente e gli hash dei file ordinari consegnati; dipendenze installate, dati privati, appunti interni e archivi annidati sono esclusi. Conservare lo ZIP precedente, caricare tutti i file e chiudere le vecchie schede prima di riaprire online. Conservare IndexedDB e localStorage.

Per le istruzioni di caricamento leggere [LEGGIMI_CARICAMENTO_UNICO.md](LEGGIMI_CARICAMENTO_UNICO.md). Non servono migrazioni SQL per questa revisione.
