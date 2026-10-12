# Collegamenti Configuratore ↔ Conteggi

La piattaforma è ora un progetto unico. Lo stato aggiornato di entrambi gli strumenti è in [STATO_PIATTAFORMA.md](STATO_PIATTAFORMA.md); la procedura di rilascio è in [PUBBLICAZIONE.md](PUBBLICAZIONE.md).

Gli archivi condividono Auth e rubrica campi, ma restano distinti. Il riepilogo desktop legge e corregge i conteggi tramite `src/counts-client.js`, lo stesso gateway usato da `/conteggi/`. Il passaggio strumenti conserva il checkpoint locale proprietario, incluse le bozze non confermate.

Le specifiche e schede precedenti in `docs/conteggi/` sono riferimenti storici: le istruzioni su due Work, doppia consegna o funzioni ancora da collegare sono superate dalla richiesta di piattaforma unica. Non richiedono altri pacchetti.
