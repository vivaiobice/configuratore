# Configuratore + Conteggi — caricamento unico 1.3.1

Usare questa procedura con il pacchetto completo 1.3.1 dopo la verifica del manifest e dei file estratti. La preparazione dei metadati non equivale alla consegna o alla pubblicazione dello ZIP; stato e limiti sono in [README_RELEASE_1.3.1.md](README_RELEASE_1.3.1.md).

1. Conservare la versione pubblicata e lo ZIP precedente. Estrarre il nuovo archivio in una cartella separata: `index.html` e `conteggi/index.html` devono essere nella radice, insieme a `src/`, `admin/`, `assets/`, `tests/` e `supabase/`.
2. Copiare tutto il contenuto estratto nella radice del repository `vivaiobice/configuratore` e controllare tutte le modifiche. Non caricare lo ZIP come file del repository e non aggiungere una cartella contenitore. La pubblicazione usa il ramo e le impostazioni Pages esistenti, con `CNAME` conservato.
3. Dopo la pubblicazione aprire il Configuratore e `/conteggi/`, verificando **1.3.1 · LIVE** in entrambi. Provare selettore tool e Profilo su desktop e touch, ingresso diretto nel contatore e ritorno all'editor con la bozza conservata.
4. Chiudere le vecchie schede Conteggi e riaprire online per consentire l'attivazione del worker aggiornato. Soltanto dopo verificare la riapertura offline di Conteggi. Conservare IndexedDB/localStorage e la stessa origine HTTPS; non cancellare tutti i dati del sito.

Il configuratore alla radice non è dichiarato offline. Sincronizzazione cloud Conteggi, invio a Vivai Obice e consultazione amministrativa restano disattivati e richiedono attivazione distinta. Il caricamento statico non esegue migrazioni o distribuzioni backend. I controlli della fluidità 3D e il pilot sul terreno reale restano aperti come descritto nella nota di release.

Per procedura completa, controlli dopo il caricamento e ripristino leggere [PUBBLICAZIONE.md](PUBBLICAZIONE.md).

<details>
<summary>Istruzioni storiche conservate della consegna 1.2.5</summary>

# Configuratore + Conteggi: caricamento unico

Questo archivio contiene il sito completo, con `index.html` e la cartella `conteggi/` allo stesso livello. Sostituisce i due ZIP separati consegnati in precedenza.

1. Estrarre lo ZIP sul computer. Caricare **il contenuto estratto** nella radice del repository GitHub `vivaiobice/configuratore`, sul branch da cui parte il sito pubblicato. Non caricare il file ZIP come file del repository e non inserire una cartella contenitore aggiuntiva.
2. Assicurarsi che nel repository siano presenti sia `index.html` sia `conteggi/index.html`, oltre a `src/counts-client.js`, `src/counts-desktop-gateway.js`, `src/config.js` e i restanti file dell'archivio. Quando GitHub propone il commit, includere tutti i file nuovi e aggiornati.
3. Dopo la pubblicazione, aprire `https://progettaimpianto.vivaiobice.com/conteggi/` direttamente, quindi aggiornare il Configuratore. Il menu del logo, gli accessi dal Profilo e dai Campi devono mostrare Conteggi; verificare un'andata e ritorno dall'editor con una bozza non confermata.

Se `/conteggi/` mostra 404, la cartella non si trova nella radice del branch pubblicato o la pubblicazione non è ancora conclusa. Se la pagina esiste ma i tasti non compaiono, controllare che `src/config.js` contenga `countsEnabled: true` e ricaricare la pagina; gli HTML di questo pacchetto usano un URL nuovo per gli script.

Conteggi salva in locale sul dispositivo. Sincronizzazione cloud, invio a Vivai Obice e consultazione amministrativa richiedono una distinta attivazione del backend e restano disattivati.

Release 1.2.5: dopo il caricamento chiudere le vecchie schede Conteggi e riaprire online prima della prova offline. Non cancellare i dati locali del sito. La versione visibile attesa è `1.2.5 · LIVE`.

</details>
