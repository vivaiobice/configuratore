# Vivai Obice — 1.3.9

«Adatta al terreno» mantiene il metodo approvato: filari a quota costante sul modello altimetrico acquisito, distanza misurata sul terreno, tolleranza di interfila di ±20 cm e progettazione indipendente per porzione. La revisione riduce ricostruzioni, allocazioni e verifiche duplicate degli stessi operandi esatti. Non aumenta i limiti, non arrotonda le coordinate di calcolo e non applica famiglie parziali.

Le alternative basate soltanto sulla superficie corretta o su offset geodetici non sostituiscono questo metodo: la superficie consente una stima teorica delle barbatelle, ma non verifica la posizione effettiva dei filari; un offset può cambiare la quota. La soluzione adottata conserva assi, misure native e certificati e rende più leggero il percorso completo.

Per i nuovi filari nativi marcati, la sola geometria di visualizzazione ed esportazione elimina i punti ridondanti con scostamento massimo di 1 cm. Lunghezze, quote, distanze, quantità e assi autorevoli continuano a usare il modello completo. I disegni precedenti non marcati mantengono la rappresentazione storica.

I salvataggi grandi possono usare checkpoint di annullamento compressi senza perdita e una copia unica delle righe già presenti nelle porzioni. La riapertura ricostruisce e verifica i dati completi. Il formato nuovo richiede la versione **1.3.9 o successiva** anche per leggere, stampare e annullare: conservare gli export e il backup precedenti prima del caricamento; non cancellare gli archivi del browser.

Sono preservati progettazione manuale, porzioni, navigazione 3D, controlli occhio e nomi dei campi, Conteggi e stampa. Le cache nuove riguardano soltanto le visualizzazioni: salvataggi, calcoli autorevoli, preventivi e report mantengono le verifiche fresche. Il tasto di ripristino può essere mostrato con una verifica leggera; quando viene premuto, la geometria e la cronologia sono nuovamente verificate prima di avviare il lavoro o salvare.

Lo ZIP contiene l'intera piattaforma. Caricarne il contenuto nella radice come nei rilasci precedenti. Versione e risorse sono coordinate a **1.3.9 · LIVE**; nessuna pubblicazione remota è stata eseguita. I servizi server Conteggi non sono stati modificati o verificati in questa sessione: l'ultimo stato documentato, del 9 ottobre 2026, indicava l'attivazione ancora pendente.

Il collaudo usa geometrie e altimetria sintetiche e le interfacce reali. Non erano disponibili i dati privati del campo Cascina Elena Chardonnay 775P. Esiti, limiti residui e verifiche di integrità sono descritti in `QA_RELEASE_1.3.9.md` e `manifest-piattaforma.json`.

Collaudo finale: 88 confronti esatti nelle interfacce desktop/mobile; 1980/1985 test passati, con cinque failure preesistenti sui tagli automatici complessi e nessuna nuova regressione. In questi casi il progetto precedente è conservato. Il campo reale Cascina Elena resta da provare con i suoi dati.
