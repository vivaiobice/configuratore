# Release 1.3.5 — Conteggi

Pacchetto completo Configuratore + Conteggi del 9 ottobre 2026. Versione coordinata **1.3.5 · LIVE**. Questa revisione modifica Conteggi; non corregge «Adatta al terreno» e non cambia il funzionamento della vista 3D approvata dall’utente.

## Contatore

- Viti, Pali e Altro si scelgono prima del nome, nella stessa schermata.
- Titoli iniziali «Conteggio barbatelle», «Conteggio pali» e «Conteggio di…». Le scelte dei dettagli completano automaticamente il titolo; una modifica manuale viene conservata anche dopo ricarica e recupero su un altro dispositivo.
- «Aggiungi dettagli» sotto il titolo apre un popup. Il riepilogo resta discreto, entro due righe. Sono disponibili vitigno/portainnesto, tipo/materiale dei pali e componentistica; le opzioni iniziano con la maiuscola.
- «Salva lettura» è un pulsante evidente. Numero, −1, + e salvataggio sono raggiungibili senza scorrere anche nei formati mobili collaudati. Il logo inferiore mantiene fondo trasparente e centratura, con contorno chiaro più morbido.
- Gli aggiornamenti in background conservano editor, focus, errori di salvataggio e categorie aperte nell’archivio. Una lettura ancora aperta resta indicata come salvata sul dispositivo.

## Profilo e trasmissione: codice pronto, attivazione pendente

Il codice prepara la sincronizzazione automatica delle letture salvate per gli utenti registrati, anche senza campo associato. Per gli ospiti restano l’avviso e il trasferimento esplicito; i dati locali rimangono separati per proprietario e ambiente. La sincronizzazione non trasmette email.

«Trasmetti a Vivai Obice» prepara selezione, riepilogo e conferma volontaria. Titoli, quantità e dettagli vengono congelati per un eventuale retry dello stesso invio.

**Questi servizi non sono ancora attivi sul server.** Il controllo del 9 ottobre trova le tabelle Conteggi assenti. Due tentativi di installare la prima migrazione tramite il collegamento Supabase restituiscono `Invalid or expired requestState`, senza applicare modifiche. Non sono state distribuite funzioni, modificate credenziali o inviate email. Caricare il solo ZIP non completa l’attivazione: vedere [PUBBLICAZIONE.md](PUBBLICAZIONE.md).

## Verifiche

La suite mirata Conteggi, autenticazione e versione supera **189/189 test**, senza test saltati. Controlli sintattici e whitespace superati. Le prove browser impiegano i moduli reali con un backend locale simulato; non costituiscono una prova dei servizi LIVE. Gli esiti del browser, dell’avvio offline e dell’archivio estratto sono registrati in [QA_RELEASE_1.3.5.md](QA_RELEASE_1.3.5.md) e nel manifest.

I moduli del terreno e della mappa conservano il codice funzionale della 1.3.4; cambiano soltanto le query di versione per evitare cache miste. La suite numerica estesa non viene dichiarata risolta o interamente verde. «Adatta al terreno» resta escluso da questa revisione su richiesta dell’utente.

## Caricamento

`Vivai_Obice_Piattaforma_v1.3.5.zip` contiene l’intera piattaforma, con `index.html` e `conteggi/` alla radice. Seguire [LEGGIMI_CARICAMENTO_UNICO.md](LEGGIMI_CARICAMENTO_UNICO.md). Conservare i dati del browser; dopo l’aggiornamento chiudere le vecchie schede Conteggi e riaprire online prima della prova offline. Il Service Worker controlla soltanto `/conteggi/`.
