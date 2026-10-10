# Release 1.3.7 — Affina progetto e interfaccia mobile

Pacchetto completo Configuratore + Conteggi del 9 ottobre 2026. Versione e cache coordinate a **1.3.7 · LIVE**.

## Modifiche

- **Affina il progetto** raccoglie otto card uniformi con icona e titolo: Porzioni, Curvatura, Gestione aree escluse, Caratteristiche impianto, Materiale vegetale, Informazioni, Catasto e Suolo. Si aprono e chiudono indipendentemente, anche più di una contemporaneamente. I controlli originali restano gli stessi su desktop e mobile.
- Selettori delle porzioni più compatti. Il piccolo comando **Mostra tutte le porzioni** rimuove l'evidenziazione della singola porzione dalla mappa. Non cambia filari, quantità o impostazioni salvate. Direzione e curvatura diventano modificabili dopo aver scelto una porzione.
- Intestazione mobile ridisegnata: logo e selettore tool compatti, nome del campo separato. Nell'editor i comandi e il nome hanno righe distinte. I comandi di esclusione dalla pagina parametri aprono l'editor prima di iniziare la modifica su mappa.
- Avvisi e attribuzione cartografica separati dai comandi inferiori dell'editor, anche quando i crediti occupano due righe. Sulla mappa principale i crediti restano sopra il comando per aggiungere un campo.
- Profilo mobile con caratteri e campi più piccoli, impaginazione adattata allo spazio disponibile e azioni raggruppate. Nei formati collaudati i dati e i comandi sono visibili senza scorrere; con tastiera aperta resta possibile scorrere per raggiungere il campo attivo.
- Logo in fondo a Conteggi con contorno più leggero. È cliccabile soltanto il logo; lo spazio laterale della riga non apre il sito.

## Limiti conservati

**«Adatta al terreno» resta invariato**, compreso il problema del limite di lavoro già segnalato. Questa revisione non modifica gli algoritmi del terreno, il calcolo del progetto o la navigazione 3D.

La sincronizzazione e la trasmissione Conteggi sono predisposte nel codice ma **l'attivazione server resta pendente** rispetto alla consegna 1.3.6. In questa sessione non sono state applicate migrazioni, distribuite funzioni o inviate email reali. Il solo caricamento dello ZIP non attiva i servizi; il salvataggio locale resta disponibile.

## Caricamento e verifiche

Caricare l'intero contenuto di `Vivai_Obice_Piattaforma_v1.3.7.zip` alla radice del sito, secondo [LEGGIMI_CARICAMENTO_UNICO.md](LEGGIMI_CARICAMENTO_UNICO.md). Conservare gli archivi del dispositivo. Chiudere le vecchie schede Conteggi e riaprire online per aggiornare le 43 risorse della cache dedicata.

Risultati, ambito del collaudo e limiti sono documentati in [QA_RELEASE_1.3.7.md](QA_RELEASE_1.3.7.md) e in `manifest-piattaforma.json`. Le prove Chromium non certificano Safari/iOS su dispositivi fisici né i servizi cloud LIVE.
