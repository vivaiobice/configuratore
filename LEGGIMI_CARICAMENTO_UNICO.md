# Configuratore + Conteggi — caricamento unico 1.3.11

Consultare [README_RELEASE_1.3.11.md](README_RELEASE_1.3.11.md) e [QA_RELEASE_1.3.11.md](QA_RELEASE_1.3.11.md).

1. Conservare lo ZIP e il sito precedenti. Estrarre il nuovo archivio in una cartella separata.
2. Caricare **tutto il contenuto estratto** nella radice del repository `vivaiobice/configuratore`, senza una cartella contenitore. `index.html` e `conteggi/` devono restare allo stesso livello. Conservare `CNAME` e le impostazioni Pages.
3. Dopo la pubblicazione controllare **1.3.11 · LIVE**. Su mobile la versione è sotto la navigazione. Provare il ritorno dal contatore, il profilo, i pannelli Affina progetto e Media in un campo, anche da desktop.
4. Chiudere le vecchie schede Conteggi e riaprire online prima della prova offline. Non cancellare i dati del sito: gli appunti ospite e i Media ospite sono conservati sul dispositivo.

Il backend Media è già attivato. Non occorre eseguire di nuovo la migrazione inclusa. Lo ZIP aggiorna il sito statico; questa consegna non pubblica il sito. Il solver Adatta al terreno conserva i limiti precedenti.

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
