# V55.1 TEST — Suolo Piemonte

## Prova in browser, con rete attiva

1. Apri un campo in Piemonte e attiva **◫ Suolo** nella mappa. Verifica che compaia la carta tematica e che la mappa satellitare resti visibile sotto. Prova i temi Tessitura, Carta dei suoli, Calcare, Drenaggio e Reazione.
2. Clicca una zona coperta dal servizio: la scheda deve riportare solo i valori effettivamente restituiti, oppure «Dato non disponibile nel punto selezionato». Verifica che la scheda si chiuda e che la legenda cambi con il tema. Non deve mostrare una classe inventata.
3. Apri **Affina il progetto → Informazioni → Suolo**, premi **Analizza suolo del campo**, salva e ricarica. La scheda deve conservare fonte, data e numero di punti effettivamente consultati per quel campo. Verifica anche con due campi nello stesso progetto e con unità pedologiche diverse, senza percentuali attribuite all'area.
4. Modifica il perimetro dopo l'analisi: il profilo conservato deve segnalare «da aggiornare». Riesegui l'analisi per aggiornarlo.
5. Su mobile prova l'interruttore Suolo nella scheda Livelli, la scheda al tocco della mappa e la sezione Suolo nella scheda Campo. Usa «Aggiorna dati suolo» e controlla che l'apertura della scheda senza quel comando non avvii richieste.
6. Riprova fuori dal Piemonte e con il servizio non raggiungibile: la mappa e le altre funzioni del configuratore devono rimanere utilizzabili, con un messaggio chiaro e senza profilo fittizio.

## Limiti della fonte

Fonte: Regione Piemonte, *Carta dei suoli e carte derivate 1:50.000*, servizio WMS `https://geomap.reteunitaria.piemonte.it/ws/agrigeo/rp-01/carsuowms/wms_carsuo`; metadati `https://www.geoportale.piemonte.it/geonetwork/serv/api/records/r_piemon:402f9c63-d23d-4b9f-98d2-c1abcea47db5`. Licenza indicata dal catalogo: CC BY 4.0. La scala 1:50.000 non consente di dedurre la composizione puntuale del terreno: una decisione tecnica richiede osservazione e analisi del suolo sul posto.

**Verifica esterna ancora necessaria:** il servizio può cambiare disponibilità, formato GetFeatureInfo o regole CORS. I test automatici validano URL, parser, persistenza e gestione degli errori; l'analisi dal browser sul dominio pubblicato richiede questa prova manuale prima di considerare la funzione confermata in produzione.
