# V44 — release TEST e controlli

Data: 24 settembre 2026. Caricamento dei file del sito TEST; nessuna migrazione nuova e nessun intervento LIVE.

## Modifiche incluse

1. Scelta Chiaro / Scuro / Automatico accessibile dall'intestazione desktop e dal Profilo mobile; riferimenti a moduli e risorse aggiornati a V44 per evitare copie precedenti nella cache.
2. Vitigni, cloni e portainnesti ordinati alfabeticamente, con «Altro» in fondo.
3. Destinatario: provincia separata, ricerca assistita dell'indirizzo completo italiano, compilazione della provincia quando presente nel suggerimento. La compilazione manuale resta possibile.
4. Anteprima: perimetro e filari sono disegnati da MapLibre sulla stessa mappa satellitare prima di catturare un'unica immagine. Il riempimento del campo è quasi trasparente; le misure perimetrali sono impresse sulla stessa immagine. Il PDF incorpora quell'immagine senza una seconda sovrapposizione ridimensionabile.
5. Pulsante «Scarica PDF»: genera direttamente un file A4 con il nome `Progetto_VO1234567_NomeCognome.pdf`; «Stampa» resta disponibile. QR, intestazione, filigrana, riepiloghi, dettagli e disclaimer restano nel PDF.
6. Progetto aperto con codice: vista in sola lettura con riepilogo, mappa satellitare interattiva, schema e pagina dettagliata per ciascun campo. Modifica solo con autorizzazione dell'account.

## Verifiche da fare dopo il caricamento

- Aprire il sito TEST in una finestra privata sul desktop e su iPhone. Verificare badge **V44**, tema e cataloghi alfabetici; controllare l'ultima voce «Altro».
- Generare un nuovo documento da un campo realmente salvato; confrontare punti del perimetro e filari nell'anteprima, nel PDF scaricato e sulla mappa di progettazione. Verificare la visibilità della foto sotto il campo. Le vecchie esportazioni non vengono modificate.
- Aprire il PDF scaricato su Mac e iPhone. Verificare nome, più pagine A4, misure, logo, filigrana, QR e disposizione senza sovrapposizioni. «Stampa» usa il browser e può avere un nome diverso: per il nome certo usare «Scarica PDF».
- Provare il suggerimento di un indirizzo generico italiano e la compilazione manuale della provincia. Generare nuovamente dopo avere cambiato i dati del destinatario.
- Aprire il codice di un progetto con due campi come Guest e come utente autenticato; verificare entrambi gli elenchi di dati, la mappa, la sola lettura Guest e l'accesso in modifica del proprietario/Admin.

La cattura satellitare richiede tile Esri reali e il motore cartografico nel browser: la coincidenza geografica deve essere approvata con un confronto visivo dei medesimi punti sul dispositivo di prova. I test automatici hanno controllato il flusso di cattura, il singolo livello georeferenziato e la struttura del PDF, ma non sostituiscono tale prova.
