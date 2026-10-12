# Verifiche della consegna di prova 1.3.1-prova.1

Data: 6 ottobre 2026. Base funzionale revisionata: 6e0096c.

## Risultati

- Suite completa Node: **1.269 test superati, 0 errori, 0 saltati**, 34,270 secondi. Include i confronti indipendenti di 144 campi manuali 1.2.6 e il replay storico 1.3.0.
- Controllo sintattico JavaScript: superato.
- Controllo delle query di versione e della cache Conteggi: 6 verifiche mirate superate; cache rigenerata, 38 risorse statiche.
- Il confronto dei 93 file modificati conferma sole variazioni di versione/cache e relative aspettative dei test. Le fixture storiche sono immutate.
- Sul contenuto estratto dello ZIP: 151 file runtime identici al codice verificato; 369 riferimenti locali di moduli/worker/asset presenti, comprese 5 URL base di cartella.
- Chromium 153: avvio, ripristino e interazioni del configuratore su desktop/mobile, con progetto registrato completo e bozza guest incompleta; modifica indipendente delle curve manuali di due porzioni.
- Conteggi: prove desktop, mobile e 320×568 su impulsi, reset, tastiera, salvataggio locale, riapertura, materiali, spostamento letture, cambi di proprietario e adattamento al viewport.

## Limiti del collaudo

Le prove browser usano trasporti di autenticazione/database e immagini sostituiti con fixture locali. Non dimostrano sincronizzazione cloud reale. La prova Conteggi usa il gateway/UI locale; il ritorno al configuratore raggiunge una destinazione locale simulata. L'avvio del configuratore reale è verificato separatamente, non l'intero trasferimento di autenticazione fra strumenti.

I test browser sono emulazioni Chromium, non prove fisiche su iPhone. Nell'ambiente di collaudo alcuni simboli sono privi di glifo; un totale artificiale di 17 cifre va a capo a 320px senza sovrapporsi alla descrizione e senza creare scorrimento orizzontale.

Le nuove funzioni di curvatura su terreno, passaggi suggeriti, ripristino e 3D sulla mappa NON sono completamente integrate o validate. Rimane aperto il caso degli estremi sul piano inclinato in due direzioni. I test superati non eliminano questo limite noto.

Non sono stati acquisiti modelli altimetrici reali di Cascina Elena né eseguite scritture sui suoi progetti. Il configuratore non ottiene con questa consegna una nuova modalità offline: è mantenuto l'ambito offline di Conteggi.

Consultare README_PROVA_1.3.1.md per caricamento e prove utili; MANIFEST_PROVA_1.3.1.json identifica i file forniti.
