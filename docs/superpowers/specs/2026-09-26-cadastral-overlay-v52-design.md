# V52 — Layer catastale informativo

**Data:** 26 settembre 2026  
**Stato:** proposta approvata a livello funzionale

## Obiettivo

Integrare nell'editor principale del configuratore un livello catastale
informativo sovrapponibile alle mappe Satellite e Stradale, senza consentire
la selezione o l'importazione delle particelle e senza modificare la geometria
dei campi del progetto.

Il livello serve esclusivamente come riferimento visivo. Non costituisce
visura, rilievo topografico, attestazione dei confini o documento catastale.

## Ambito V52

La funzione è disponibile esclusivamente nella mappa dell'editor progetto.
Non viene aggiunta alle mappe di amministrazione, alle viste condivise, alle
anteprime di stampa o ai PDF.

La V52 include:

- comando `Catasto` accanto ai selettori Satellite/Stradale;
- attivazione e disattivazione del layer trasparente ufficiale;
- aggiornamento del layer dopo spostamento, zoom, rotazione e ridimensionamento;
- soglia minima di zoom per evitare richieste inutili e rappresentazioni
  illeggibili;
- stato di caricamento e gestione non bloccante degli errori del servizio;
- attribuzione della fonte e avvertenza informativa;
- test automatici del comportamento del controllo e del layer.

La V52 non include:

- ricerca per Comune, foglio o particella;
- selezione o evidenziazione interattiva delle particelle;
- importazione delle particelle come perimetro del campo;
- unione di più particelle;
- salvataggio dello stato del Catasto nel progetto;
- presenza del Catasto nei documenti PDF.

## Fonte cartografica

Il layer usa il servizio WMS ufficiale della cartografia catastale dell'Agenzia
delle Entrate, già isolato nell'adattatore `src/cadastre.js`.

La richiesta deve:

- usare il layer ufficiale `CP.CadastralParcel`;
- richiedere un'immagine PNG trasparente;
- rispettare il limite dimensionale già applicato dall'adattatore;
- coprire il viewport geografico corrente;
- mostrare l'attribuzione `Cartografia catastale — Agenzia delle Entrate · CC BY 4.0`.

L'integrazione resta dietro l'adattatore catastale esistente, in modo che un
eventuale cambio di endpoint non richieda modifiche all'editor o allo stato del
progetto.

## Esperienza utente

### Controllo

Il pulsante `Catasto` è un interruttore ON/OFF nello stesso gruppo visuale di
Satellite e Stradale. Catasto è un overlay: cambiare mappa base non lo spegne.

Il precedente sottomenu `Trova particella` non viene mostrato nella V52, perché
appartiene al flusso di selezione/importazione escluso da questa release.

All'apertura dell'editor il Catasto è sempre disattivato. La preferenza non
viene salvata nel progetto e non entra nella cronologia delle revisioni.

### Zoom minimo

Se l'utente attiva il Catasto a uno zoom insufficiente:

- il comando resta attivo;
- non viene richiesta né visualizzata l'immagine catastale;
- compare il messaggio `Avvicinati per visualizzare le particelle catastali.`;
- raggiunta la soglia di zoom, il layer viene caricato automaticamente.

La soglia deve essere definita in una costante verificabile e calibrata durante
il collaudo desktop e mobile dell'editor, senza legarla a un testo o a una
regola CSS.

### Caricamento ed errori

Durante il caricamento il controllo mostra uno stato discreto senza bloccare
gli altri strumenti della mappa.

Se il servizio non risponde o l'immagine non può essere caricata:

- satellite/stradale, filari, perimetri ed editor restano utilizzabili;
- il layer catastale non sostituisce mai la mappa base;
- compare il messaggio `Cartografia catastale momentaneamente non disponibile.`;
- l'utente può disattivare e riattivare il comando per riprovare.

L'errore non deve cancellare la geometria, modificare lo stato del progetto o
interrompere salvataggio e stampa.

### Informazione legale

Con il layer attivo deve essere visibile una nota compatta:

`Riferimento cartografico informativo. Non sostituisce visura catastale o rilievo dei confini.`

La nota si aggiunge ai disclaimer già presenti senza estenderli alle coordinate
GPS puntuali e senza introdurre raccolta di nuovi dati.

## Flusso dati

1. L'utente attiva il comando Catasto.
2. L'editor verifica il livello di zoom.
3. Se lo zoom è sufficiente, calcola il bounding box del viewport e le
   dimensioni dell'immagine.
4. L'adattatore costruisce la richiesta WMS ufficiale.
5. MapLibre visualizza l'immagine trasparente georiferita sopra la mappa base e
   sotto i perimetri e i filari del progetto.
6. Al termine di un movimento, zoom, rotazione o resize, l'immagine viene
   aggiornata con il nuovo viewport.
7. Alla disattivazione il layer viene nascosto e ogni stato di caricamento o
   messaggio temporaneo viene ripulito.

## Ordine visivo dei layer

Dal basso verso l'alto:

1. mappa base Satellite o Stradale;
2. cartografia catastale trasparente;
3. altri campi del progetto;
4. campo attivo e sue misure;
5. filari, aree escluse e strumenti di modifica;
6. etichette e controlli UI.

Questa gerarchia garantisce che il Catasto non copra gli elementi progettuali e
che il perimetro del campo resti sempre riconoscibile.

## Compatibilità e prestazioni

- Una sola richiesta WMS deve essere attiva per volta.
- Gli aggiornamenti generati da movimenti ravvicinati devono essere
  consolidati dopo la fine del movimento.
- Una risposta relativa a un viewport precedente non deve sovrascrivere quella
  del viewport corrente.
- La dimensione della richiesta tiene conto del pixel ratio ma resta entro il
  limite già imposto dall'adattatore.
- La funzione non aggiunge dati al modello persistito né richiede migrazioni
  Supabase.

## Criteri di accettazione

1. Il pulsante Catasto è visibile soltanto nell'editor progetto.
2. Il pulsante attiva e disattiva il layer senza cambiare la mappa base.
3. Il sottomenu `Trova particella` non è disponibile.
4. A zoom insufficiente non parte la richiesta e compare l'invito ad
   avvicinarsi.
5. A zoom sufficiente le particelle risultano allineate alla mappa durante pan,
   zoom e rotazione.
6. Il Catasto resta sotto perimetri, filari, misure e strumenti di modifica.
7. Un errore del servizio non altera il campo e non blocca l'editor.
8. Lo stato ON/OFF non viene salvato nel progetto e al nuovo caricamento torna
   OFF.
9. L'attribuzione e la nota informativa sono visibili quando il layer è attivo.
10. Anteprime, viste condivise e PDF non mostrano il layer catastale.

## Verifica

I test automatici devono coprire almeno:

- costruzione della richiesta WMS e limiti dimensionali;
- controllo ON/OFF e relativa accessibilità;
- assenza del comando di selezione particella;
- blocco delle richieste sotto la soglia di zoom;
- aggiornamento dopo `moveend` e `resize`;
- ordine del layer rispetto a campo e filari;
- fallback in caso di errore immagine/rete;
- assenza di mutazioni della geometria e dello stato persistito.

Il collaudo manuale deve verificare allineamento e leggibilità su desktop e su
almeno un dispositivo mobile, pur senza avviare in questa release il redesign
completo dell'interfaccia mobile.
