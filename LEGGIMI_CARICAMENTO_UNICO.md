# Pacchetto completo 1.3.9

Consultare `README_RELEASE_1.3.9.md`, `QA_RELEASE_1.3.9.md` e `PUBBLICAZIONE.md`. Conservare gli export precedenti: il nuovo formato di checkpoint richiede 1.3.9 o successiva per lettura e ripristino. Nessuna pubblicazione remota eseguita.

# Configuratore + Conteggi — caricamento unico 1.3.9

Usare il pacchetto completo 1.3.9. La consegna non pubblica il sito; stato e limiti sono in [README_RELEASE_1.3.9.md](README_RELEASE_1.3.9.md).

1. Conservare la versione pubblicata e lo ZIP precedente. Estrarre il nuovo archivio in una cartella separata: `index.html` e `conteggi/index.html` devono essere nella radice, insieme a `src/`, `admin/`, `assets/`, `tests/` e `supabase/`.
2. Copiare tutto il contenuto estratto nella radice del repository `vivaiobice/configuratore`. Non caricare lo ZIP come file del repository e non aggiungere una cartella contenitore. Conservare `CNAME` e impostazioni Pages.
3. Dopo la pubblicazione verificare **1.3.9 · LIVE** nel Configuratore e in `/conteggi/`. Provare selettore tool, Profilo, ingresso diretto nel contatore e ritorno all’editor con bozza conservata.
4. Chiudere le vecchie schede Conteggi e riaprire online per attivare il worker aggiornato; poi provare la riapertura offline. Conservare IndexedDB/localStorage e la stessa origine HTTPS; non cancellare tutti i dati del sito.

**Verificare separatamente i servizi server Conteggi.** L’ultima verifica documentata del 9 ottobre 2026 indicava migrazioni e funzioni Conteggi non installate e il collegamento Supabase rifiutato con `Invalid or expired requestState`; il browser era predisposto e il salvataggio locale disponibile. Nessuna nuova verifica o installazione server è stata eseguita per questa release. Il caricamento dello ZIP aggiorna il codice statico e non installa questi servizi.

«Adatta al terreno» riduce il lavoro duplicato e la dimensione dei checkpoint conservando il metodo approvato. Il funzionamento 3D è conservato. Il configuratore alla radice non è dichiarato offline. Procedura di attivazione e ripristino in [PUBBLICAZIONE.md](PUBBLICAZIONE.md).

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
