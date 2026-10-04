# Porzioni indipendenti del vigneto

Approvato dall’utente il 3 ottobre 2026: la strada da 1,50 m deve dividere il campo a L in porzioni con orientamento e curvatura indipendenti, mantenendo unico campo, archivio, riepilogo e PDF. Ogni interruzione fisica di un filare crea due estremità, con un palo di testa per estremità. Non alterare l’account/progetto cloud per effettuare verifiche.

Il caso reale è stato letto in sola lettura. Il passaggio crea due componenti coltivabili ma la precedente euristica restituiva whole perché l’intersezione con la guida centrale è fuori intervallo. Le prove usano una copia anonimizzata della geometria.

UX: selezione Porzione 1 / Porzione 2 tramite pulsanti e tocco sulla mappa; porzione attiva evidenziata, direzione e punti locali; azioni Aggiungi/Elimina/Azzera curva riguardano soltanto la porzione attiva. I campi non divisi conservano la UX esistente. Comfortaa e palette attuali.

Compatibilità: partendo da un disegno salvato, ciascuna nuova porzione eredita i filari attuali fino alla prima modifica locale. Questa azione avvia i controlli nel riferimento geometrico della porzione selezionata senza alterare le altre. Il vecchio orientamento/punti restano nel campo come base e copia reversibile; una porzione già locale conserva sempre i propri dati. Strada modificata: associazione alle nuove componenti per sovrapposizione, mai semplice indice; rimozione/unione gestita senza trasferire silenziosamente la curva sbagliata. Mantieni capezzagne sulle estremità del perimetro originario, non aggiungere automaticamente capezzagne sul bordo della strada. Le esclusioni unite e i fori sono rispettati.

Salvataggio: layout additivo rowPortions, identità stabile, cloud snapshot/design_data già accettano extras; nessuna migrazione database richiesta. Stessi motore e input per editor, riepiloghi, Admin e stampa. Una sola release ZIP completa v1.2.5, nessuna pubblicazione remota.
