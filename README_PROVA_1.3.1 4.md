# Vivai Obice — pacchetto di prova 1.3.1-prova.1

Data: 6 ottobre 2026. Pacchetto unico: Configuratore vigneti e Conteggi.

## Stato effettivo

Questa è una consegna intermedia per le prove richiesta da Marco. Non è la release definitiva delle nuove funzioni terreno.

Include il codice e le correzioni revisionate fino al commit 6e0096c: dominio altimetrico, curve di livello, certificazione delle distanze a terra, fasce di superficie e costruzione delle famiglie; confronto delle superfici realmente misurate e quote corrette dopo le zone escluse. Le verifiche numeriche esistono nel repository.

Il nuovo motore è disponibile mediante la sua versione esplicita, ma NON è ancora collegato ai comandi della normale interfaccia. Il pulsante terreno visibile mantiene il percorso della 1.3.0. Il comando 3D sulla mappa, Manuale/Adatta per porzione, ripristino e passaggi suggeriti richiedono ancora integrazione e collaudo. Non considerarli presenti o validati in questo pacchetto.

Resta aperto il caso di un piano inclinato in entrambe le direzioni: il nuovo motore può rifiutare il disegno per gli estremi dei filari. La correzione è progettata ma non implementata. Un rifiuto conserva il progetto precedente; non certifica un risultato nuovo.

Il funzionamento manuale della 1.2.6 e la lettura dei risultati 1.3.0 sono mantenuti. Le fixture anonime non sostituiscono il collaudo altimetrico reale di Cascina Elena.

## Caricamento e prove utili adesso

1. Estrai lo ZIP e carica il suo contenuto nella radice dello stesso repository della piattaforma; Configuratore e Conteggi sono insieme.
2. Lascia la struttura delle cartelle e il file CNAME come forniti. Pubblica tramite il normale aggiornamento del repository GitHub Pages.
3. Ricarica la pagina. Per aggiornare la cache di Conteggi, chiudi le sue schede e riaprilo.
4. Prova disegno manuale, modifica delle porzioni indipendenti, passaggi già esistenti, coordinate precise, salvataggio/riapertura, cambio strumento, conteggi e stampa.

Non servono migrazioni SQL. Il pacchetto non contiene progetti privati o modelli dei campi di Cascina Elena.

Le verifiche eseguite su questa consegna sono documentate in QA_PROVA_1.3.1.md. Le decisioni tecniche e i loro limiti sono in docs/DECISIONI_TERRENO_PROVA.md.
