# Configuratore Vivai Obice V55.7

Base: V55.6.7, con il flusso del preventivo funzionante conservato.

## Aggiornamento

1. Estrai la ZIP e copia il contenuto nella cartella del repository del configuratore, sostituendo i file corrispondenti.
2. In GitHub Desktop verifica le modifiche, esegui Commit e Push come nelle versioni precedenti.
3. Dopo l'aggiornamento ricarica completamente il configuratore (Ctrl+F5 / Cmd+Shift+R). Sul telefono chiudi la scheda e riapri il sito.

Non sono richieste migrazioni SQL né modifiche ai secret. La nuova Edge Function `cadastral-parcels` è già stata pubblicata e verificata sul progetto Supabase esistente. Le funzioni del preventivo e il proxy Catasto già presenti non sono stati modificati.

## Novità

- PROGETTI, desktop e mobile: Stampa/PDF accanto al titolo e sintesi immediata con superficie lorda complessiva in m² e numero di viti calcolate. Restano disponibili apertura, preventivo, rinomina, eliminazione e spostamento campi.
- Solo amministratori: Progetti degli utenti, raggruppati per proprietario. Si consultano progetti e mappe in una finestra separata, senza importarli nel proprio archivio o cambiare il progetto in modifica.
- Stampa/PDF: Visione aerea generale facoltativa a pagina 2, con tutti i campi selezionati nella stessa immagine satellitare, perimetri e filari distinti per colore e nomi dei campi. Opzione dipendente Catasto al 60%. Le mappe individuali restano nel documento.
- Documento: riferimenti catastali e analisi del suolo salvata per ciascun campo, con fonte, scala, data e avviso per dati riferiti a un perimetro successivamente modificato. I dati mancanti sono dichiarati; elenchi lunghi proseguono su ulteriori pagine.
- Editor: scelta Nessun campo nel selettore per una vista generale uniforme. È una modalità di sola visualizzazione: il campo attivo salvato non cambia e gli strumenti di modifica vengono disabilitati. Seleziona un campo per riprendere a modificarlo.
- Nomi dei campi visibili nell'editor e nelle mappe di Amministrazione, senza dipendere dai caratteri o dallo zoom delle etichette cartografiche.
- Catasto: ricerca automatica dopo il disegno o la modifica del perimetro; è disponibile anche Aggiorna dati catastali. Comune, sezione, foglio e particelle sono modificabili. La ricerca considera intersezioni, contenimenti e contatti con il confine, escludendo le sole aree interne ai vuoti delle particelle. Le correzioni manuali sono conservate; errori, dati incompleti e risposte relative a perimetri precedenti non sostituiscono i dati presenti.

## Verifiche

- Suite completa Node e controllo sintassi JavaScript.
- Prova reale della nuova ricerca WFS: Comune Alba, foglio 42, particelle filtrate sul perimetro dimostrativo.
- Impaginazione stampata desktop/mobile e caso con quattro campi e dati del suolo estesi, verificata con renderer indipendente. Il browser di verifica remota non consente di aprire l'anteprima locale: non è stata eseguita una prova interattiva sul sito pubblicato V55.7.
- Confronto diretto con V55.6.7: moduli preventivo, autenticazione, cloud, sincronizzazione e algoritmi di calcolo identici.

Le fonti cartografiche esterne devono essere disponibili per acquisire le immagini e proporre i dati catastali. Se il Catasto della panoramica non carica, il documento chiede di riprovare o di disattivare quella opzione; non dichiara il livello presente se l'acquisizione fallisce.
