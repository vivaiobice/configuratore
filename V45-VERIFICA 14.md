# V45 — release TEST e controlli

Data: 24 settembre 2026. Pacchetto del sito TEST, da caricare al posto dei file statici della versione precedente. Le dipendenze e le formule di progetto non sono state cambiate.

## Correzioni

1. Pulsante luna/sole accanto al Login nell'intestazione desktop, con suggerimento dell'azione al passaggio e stato aggiornato subito dopo il clic. La scelta Automatico rimane nel Profilo, anche mobile. Contrasto e superfici corretti nelle schede del configuratore, nel riepilogo, nell'archivio e nelle schermate mobili.
2. Valori di prova isolati `0` e `1` esclusi dalla precompilazione del destinatario. Gli esempi sono ora segnaposto generici e i dati reali rimangono precompilati.
3. Il suggerimento dell'indirizzo suddivide via e numero, CAP, località e provincia del destinatario in campi distinti. Il risultato dettagliato viene usato quando disponibile; tutti i campi restano modificabili.
4. La località dell'impianto viene proposta dalla posizione interna di ciascun perimetro, con una ricerca geografica inversa. In un documento con più campi di località differenti, il frontespizio indica «Località diverse (vedi campi)» e ogni campo conserva la propria località. È sempre possibile correggerla a mano. In assenza di risposta geografica restano disponibili i dati del campo salvato.
5. Anteprima e PDF mostrano separatamente indirizzo del destinatario e località dell'impianto. Il PDF A4 ha una linea di divisione tra i due elementi. La località del singolo campo è visibile anche nella pagina della mappa.
6. Il progetto aperto con codice rimane consultabile dal Guest, con campi, mappa interattiva e dati tecnici. «Stampa / salva PDF» resta visibile; al clic da Guest compare login/registrazione nella stessa pagina. Dopo l'accesso e l'accettazione dell'avvertenza la stampa si attiva. L'accesso in modifica rimane soggetto ai permessi del proprietario o amministratore.
7. Tutte le risorse modificate usano il parametro di versione V45 per aggiornare le copie nella cache.

## Controlli sul sito TEST

- Aprire da desktop e da telefono, cambiare tema e verificare che testi, campi, pulsanti e riquadro dei risultati siano leggibili. Il comando desktop mostra luna di giorno e sole di notte.
- Generare un documento: i dati fittizi `1` non devono comparire come nome/azienda/telefono; un contatto reale deve precompilarsi. Selezionare un indirizzo generico e controllare che via, CAP, località e provincia del destinatario vadano in caselle separate.
- Disegnare un campo in una località diversa da quella del destinatario. Verificare la proposta della località dell'impianto e poi correggerla manualmente per controllare che la correzione rimanga nel documento. Ripetere con due campi in località differenti.
- Confrontare frontespizio dell'anteprima e PDF scaricato: indirizzo destinatario, riga divisoria e località dell'impianto; controllare i dati per campo e l'immagine satellitare georeferenziata. Le prove reali con tile Esri e geocodifica richiedono il browser connesso.
- In una finestra privata, aprire il progetto con codice. Premere «Stampa / salva PDF»: deve apparire la finestra di accesso senza lasciare il progetto. Dopo il login, accettare l'avvertenza e stampare. Ripetere con la registrazione di un account nuovo.

## Verifica automatica locale

`npm test`: 522 test superati. `npm run check`: controllo sintattico JavaScript superato. La verifica visiva dei tile satellitari, del servizio di ricerca geografica e della stampa nel browser si fa dopo il caricamento TEST.
