# Vivai Obice — 1.3.10

Questa versione corregge la verifica dei filari nativi e rende espliciti i conflitti di interfila. Non è ancora stata trovata una disposizione completa applicabile al campo Cascina Elena Chardonnay 775P nella configurazione confermata con una sola sezione.

Quando la verifica su tutta l’altimetria acquisita è inconcludente, una verifica locale continua controlla gli assi effettivamente mantenuti dopo le capezzagne. La pendenza fuori dal campo non impedisce più di accettare una famiglia che supera questi controlli. Nei casi senza una direzione verificabile sull’intero modello, il generatore offre quote successive dipendenti dalla pendenza locale. Le quote proposte non costituiscono una verifica: una famiglia viene accettata soltanto dopo i controlli completi di quote, distanze, topologia, area servita e rilettura.

Un’interfila realmente troppo stretta respinge l’intera disposizione appena viene dimostrata, evitando di continuare a consumare il budget per quel tentativo. Il messaggio nella mappa e nel pannello mostra la distanza verificata e il minimo richiesto. L’utente può intervenire con i passaggi e le aree escluse già presenti. La ricerca automatica di passaggi complessi mantiene i limiti documentati nel collaudo; un passaggio non viene dichiarato valido senza verificare le disposizioni risultanti.

Sul Chardonnay reale, il tentativo provato mostra **2,26 m contro un minimo di 2,30 m** e termina in circa un secondo nel browser desktop e mobile, senza alterare il disegno salvato. Un’ulteriore verifica sullo stesso modello dimostra esigenze incompatibili lungo il filare scelto a quota 500 m. Questo risultato riguarda quel filare; non è una dimostrazione di impossibilità per ogni possibile fase o suddivisione del campo.

Restano invariati quota costante, interfila misurata sul terreno, tolleranza di ±20 cm, budget di 30 secondi e 500.000 nodi. Non sono applicate famiglie parziali. Sono preservati gli strumenti manuali, porzioni, navigazione 3D, visibilità della mappa, Conteggi e stampa.

Lo ZIP contiene l’intera piattaforma, con risorse coordinate a **1.3.10 · LIVE**. Caricarne il contenuto nella radice come nei rilasci precedenti. Nessuna pubblicazione, migrazione o modifica dei servizi server è stata eseguita. I dati privati e l’altimetria del caso reale non sono inclusi nel pacchetto pubblico.

Collaudo: **2012/2017 test passati**, con le stesse cinque failure preesistenti sui tagli automatici complessi; **54 controlli desktop/mobile** superati sul caso reale, comprendenti il rifiuto corretto e la disponibilità degli altri strumenti. Dettagli e limiti in `QA_RELEASE_1.3.10.md`.
