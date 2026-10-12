# Configuratore Vivai Obice 1.0.2

Caricare il contenuto dello ZIP sopra la versione 1.0.1. Nessuna nuova migrazione o modifica ai secret è necessaria per questi fix.

## Interfaccia

- La MainMap mostra i nomi di tutti i campi in un livello HTML che si aggiorna con zoom e spostamenti, anche quando è selezionato «Nessun campo». Lo stesso codice è usato da admin, utenti registrati e guest.
- Campi desktop: anteprima grafica, nome, barbatelle commerciali, filari e vitigno. La card apre il campo; stampa/PDF e preventivo sono nella barra superiore; la matita raccoglie rinomina, duplica ed elimina.
- Progetti desktop: la card apre il progetto, la freccia espande i campi per conservarne la funzione di spostamento, la matita raccoglie le modifiche. La barra superiore offre progetto da scegliere, stampa/PDF, preventivo, aggiorna, salva e nuovo progetto come icone con descrizione al passaggio del mouse.
- Anche le schermate mobili hanno anteprima e dati compatti, azioni generali in alto e modifiche raggruppate nella matita.
- Catasto: «Sezione» compare solo quando la fonte AdE restituisce un valore; il comando per rimuovere un mappale è una piccola ⓧ allineata a Comune, Foglio e Particella.
- Nel riepilogo del campo compare la superficie netta del vigneto.
- In Amministrazione, la colonna Campi indica l'username del proprietario o un identificativo stabile nel formato Guest1234 per i progetti guest.

## Verifica

743 test superati su 743, controllo sintattico JavaScript e `git diff --check` superati. I moduli di preventivo, sincronizzazione, calcolo e geometria rimangono invariati. La verifica visiva finale sul sito pubblicato deve seguire il caricamento dei file.
