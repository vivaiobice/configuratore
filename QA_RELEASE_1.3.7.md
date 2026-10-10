# Collaudo 1.3.7 — Affina progetto e mobile

## Suite mirata

**340 test superati, 0 falliti, 0 saltati.**

Comando: `node --test tests/counts-*.test.mjs tests/release-version.test.mjs tests/portion-release-cache.test.mjs tests/auth-sync-integration.test.mjs tests/auth-transfer.test.mjs tests/refinement-portions-v137.test.mjs tests/row-portion-editor.test.mjs tests/row-portion-outputs.test.mjs tests/mobile-ui.test.mjs tests/mobile-profile-layout.test.mjs tests/mobile-viewport.test.mjs tests/mobile-fullscreen.test.mjs tests/desktop-profile.test.mjs tests/release36-desktop-ux.test.mjs tests/terrain-core-mount.test.mjs tests/terrain-controls.test.mjs`.

La nuova regressione verifica il selettore senza porzione, la conservazione dei filari e delle impostazioni, la selezione successiva di una porzione e gli otto contenitori nativi ordinati. Le altre prove coprono controlli e trasferimento tra pagine, selettore tool al tocco, disabilitazione coerente dei controlli, profilo e tastiera, bozze, archivio e titoli Conteggi, separazione dei proprietari, API simulate, SQL e cache.

**Archivio estratto: 161 test superati, 0 falliti, 0 saltati, 0 annullati.** La suite mirata copre card, porzioni, mobile/profilo, logo Conteggi, controlli terreno già esistenti, versione e query di cache, usando i file dello ZIP. Le dipendenze di test della radice sono installate con `npm ci --offline --ignore-scripts`; quelle di Conteggi (`fake-indexeddb` 6.2.5 e `@electric-sql/pglite` 0.5.8) sono copiate dall'installazione locale già disponibile, verificando versioni del lock e identità di ogni file. Queste dipendenze servono soltanto al collaudo e non sono incluse nella consegna statica.

## Browser

Il collaudo usa l'applicazione effettiva, MapLibre e Draw autentici, con immagini/cartografia e servizi di autenticazione/cloud locali simulati. Nessuna email reale o modifica remota. Gli esiti sorgente e pacchetto estratto sono registrati separatamente nel manifest; la verifica del pacchetto confronta anche gli hash delle risorse realmente servite con quelli dell'archivio.

**Sorgente: sei formati superati** — 320×568, 320×667, 360×740, 390×844, 430×932 e 844×390. Sono due batch dichiarati sullo stesso prodotto congelato, senza mutazioni numeriche (`MOBILE_V137_BROWSER_NUMERIC=0`). Le prove verificano otto card indipendenti, controlli originali presenti una sola volta, deselezione senza modifiche a progetto/filari, salvataggio/riapertura, annullamento dopo l'avvio di un passaggio, profilo chiaro/scuro senza scroll, logo centrato e link limitato all'immagine. Avvisi, attribuzione e comando «+ Campo» non si sovrappongono. Sul 390 si verificano anche desktop 1440×1000, accesso a Suolo tramite scorrimento reale e conservazione degli stati prima delle interazioni al ritorno mobile. Il ritorno apre Mappa secondo il comportamento vigente; il Profilo viene poi riaperto tramite il suo pulsante.

Tutte le **187 risorse servite**, inclusi 143 moduli, coincidono con i file congelati; nessuna richiesta esterna reale è autorizzata. Lo scorrimento e i tocchi verificano che il bersaglio riceva effettivamente l'evento. I test non impongono una certificazione di latenza all'emulatore.

**Archivio estratto: due formati superati** — 320×568 e 390×844, con 41 checkpoint complessivi. Il secondo comprende anche desktop 1440×1000, scorrimento e controllo del bersaglio reali, quindi ritorno mobile. Si usa lo script incluso nel candidato, con `NUMERIC=0`, moduli e fixture dell'archivio e le stesse librerie cartografiche locali del collaudo sorgente. Sono ripetuti i percorsi di selezione/deselezione, salvataggio/riapertura, annullamento, profilo e logo, senza ripetere le mutazioni numeriche supplementari. Tutte le 187 risorse servite e i 260 file runtime congelati restano identici. Dopo questa prova cambiano soltanto questo riepilogo e i metadati del manifest; gli eseguibili e gli asset della consegna definitiva coincidono con quelli del candidato provato. Il confezionamento finale verifica CRC e hash di tutti i file dello ZIP contro il manifest.

Le prove dedicate al profilo coprono 16 schermate: utente in tema chiaro/scuro, accesso e registrazione, nei formati 320×568, 320×667, 390×844 e 568×320. Tutti i campi e i comandi restano nel viewport, senza overflow della pagina o sovrapposizione alla navigazione. Sono verificati anche i collegamenti delle azioni originali.

Il percorso tool dedicato supera quattro formati, inclusi 320×568 e desktop, usando clic e tocchi effettivi. Copre ingresso Conteggi dal logo e dal profilo, ritorno con bozza, selettore dell'editor e compatibilità degli eventi touch/click.

Un controllo aggiuntivo copre nove combinazioni dell'editor: 360×740, 844×390 e 568×320, ciascuno in visualizzazione, disegno di un passaggio e modifica dei vertici. Messaggi, attribuzione cartografica e comandi inferiori restano separati; nel formato orizzontale più corto tutti gli strumenti della riga superiore restano raggiungibili. Le quote e i marcatori legati alla geometria non sono trattati come comandi fissi dell'interfaccia.

Le asserzioni numeriche supplementari sul campo di test a L verificano, tramite tastiera e tocco nativi, orientamento della porzione A a 40°, aggiunta di un punto di curva, conservazione della porzione B e dei valori globali, salvataggio/riapertura dei filari e annullamento completo di una modifica al sesto. Queste asserzioni sono state completate in un tentativo diagnostico poi interrotto dal controllo del tocco sul pannello desktop: non si dichiara passato l'intero tentativo. Il successivo controllo dedicato desktop supera lo scorrimento nativo, l'apertura/chiusura di Suolo, la deselezione e il ritorno a mobile conservando dati e stato delle card. Il collaudo finale UI usa `NUMERIC=0`: ripete selezione, deselezione e transazioni senza ripetere quelle mutazioni numeriche già verificate. Le successive modifiche riguardano esclusivamente il posizionamento CSS degli elementi della mappa; il JavaScript del prodotto resta identico.

## Conservazione e limiti

Confronto con il commit `2039e58` della 1.3.6: **48 moduli terreno/mappa/calcolo interessati dal cambio versione conservano i corpi funzionali**; cambiano soltanto le query di release. Nessuna correzione al solutore «Adatta al terreno» né certificazione della suite numerica estesa in questa sessione.

Il Service Worker Conteggi conserva il grafo di 43 risorse con query aggiornate. I test verificano che una query nuova non recuperi erroneamente moduli di una vecchia versione. Questa revisione non ripete né estende la certificazione browser a freddo offline della 1.3.6, documentata in [QA_RELEASE_1.3.6.md](QA_RELEASE_1.3.6.md).

L'attivazione backend resta pendente dall'ultima consegna; questa sessione non ripete i tentativi di installazione. Le prove cloud usano servizi simulati. Il collaudo su hosting e su dispositivi Safari/iOS fisici resta a cura delle prove reali.
