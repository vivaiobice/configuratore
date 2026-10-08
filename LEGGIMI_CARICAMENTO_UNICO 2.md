# Configuratore + Conteggi: caricamento unico

Questo archivio contiene il sito completo, con `index.html` e la cartella `conteggi/` allo stesso livello. Sostituisce i due ZIP separati consegnati in precedenza.

1. Estrarre lo ZIP sul computer. Caricare **il contenuto estratto** nella radice del repository GitHub `vivaiobice/configuratore`, sul branch da cui parte il sito pubblicato. Non caricare il file ZIP come file del repository e non inserire una cartella contenitore aggiuntiva.
2. Assicurarsi che nel repository siano presenti sia `index.html` sia `conteggi/index.html`, oltre a `src/counts-client.js`, `src/counts-desktop-gateway.js`, `src/config.js` e i restanti file dell'archivio. Quando GitHub propone il commit, includere tutti i file nuovi e aggiornati.
3. Dopo la pubblicazione, aprire `https://progettaimpianto.vivaiobice.com/conteggi/` direttamente, quindi aggiornare il Configuratore. Il menu del logo, gli accessi dal Profilo e dai Campi devono mostrare Conteggi; verificare un'andata e ritorno dall'editor con una bozza non confermata.

Se `/conteggi/` mostra 404, la cartella non si trova nella radice del branch pubblicato o la pubblicazione non è ancora conclusa. Se la pagina esiste ma i tasti non compaiono, controllare che `src/config.js` contenga `countsEnabled: true` e ricaricare la pagina; gli HTML di questo pacchetto usano un URL nuovo per gli script.

Conteggi salva in locale sul dispositivo. Sincronizzazione cloud, invio a Vivai Obice e consultazione amministrativa richiedono una distinta attivazione del backend e restano disattivati.

Release 1.2.5: dopo il caricamento chiudere le vecchie schede Conteggi e riaprire online prima della prova offline. Non cancellare i dati locali del sito. La versione visibile attesa è `1.2.5 · LIVE`.
