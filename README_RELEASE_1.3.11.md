# Vivai Obice — versione 1.3.11

Pacchetto completo Configuratore, Conteggi, PDF e amministrazione. Caricare il contenuto dello ZIP nella stessa cartella della piattaforma, mantenendo la struttura delle sottocartelle. La versione visualizzata è 1.3.11; su mobile compare sotto la navigazione.

## Interfaccia mobile

- Il nome del progetto affianca il logo nella mappa; i nomi lunghi vengono abbreviati senza coprire gli strumenti.
- Nell'editor mappa, **Affina progetto** apre le icone delle sezioni sul lato destro. Si visualizza un solo pannello compatto in basso. **Chiudi sezione** ripristina i comandi di base. I controlli originali, i valori e le modifiche delle porzioni sono conservati.
- Nel normale editor del campo le ultime card sono Porzioni, Curvatura e Gestione aree escluse; le altre card rimangono indipendenti.
- Il profilo usa campi più ravvicinati e pulsanti con più spazio. È stato verificato anche su schermi piccoli e in orizzontale.

## Media del campo

**Media** apre foto e documenti del campo: nel riepilogo mobile, nel riepilogo sulla mappa desktop e nelle card Campi su desktop.

- **Fotocamera** permette di scattare dal dispositivo che supporta l'acquisizione diretta; su desktop apre la selezione immagini.
- **Foto** sceglie immagini dalla galleria; **File** aggiunge documenti. È possibile scegliere più foto o file.
- Una nota visita facoltativa accompagna i nuovi allegati. Nome, data e dimensione sono visibili nel registro; le foto si ingrandiscono e i file si scaricano.
- La cancellazione richiede conferma. Eventuali caricamenti incompleti sono identificati e possono essere eliminati prima di riprovare.
- Limite: **25 MB per file**. Con accesso effettuato i Media sono privati e associati al campo nel profilo. Il campo viene sincronizzato prima del caricamento. Come ospite, i file restano nel browser sul dispositivo; non vengono trasferiti automaticamente all'accesso.
- I Media online seguono il campo quando viene spostato in un altro progetto, anche se il suo identificativo client cambia. La duplicazione del campo crea un nuovo campo senza copiare i Media.

Il backend Media è già attivato sull'istanza della piattaforma. La migrazione SQL inclusa documenta lo schema applicato: non occorre eseguirla nuovamente per caricare questo ZIP.

Il calcolo **Adatta al terreno** mantiene il comportamento della 1.3.10 e i limiti già noti. Questa release non introduce modifiche al solver, alla navigazione 3D, ai conteggi o al PDF.

Per le verifiche e le limitazioni di prova vedere `QA_RELEASE_1.3.11.md`.
