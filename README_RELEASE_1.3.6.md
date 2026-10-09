# Release 1.3.6 — Conteggi

Pacchetto completo Configuratore + Conteggi del 9 ottobre 2026, versione coordinata **1.3.6 · LIVE**. Questa revisione conserva il funzionamento della mappa e del 3D; «Adatta al terreno» resta escluso su richiesta dell’utente.

## Modifiche

- Selettori Viti, Pali e Altro più grandi: almeno 44 px di altezza su mobile.
- Nome della lettura leggermente più piccolo, con la stessa larghezza. I dettagli generano titoli come **Conteggio · Barbera N. · 110 Richter**, **Conteggio · Testa · Ferro** e **Conteggio · Molle**. I nomi scritti manualmente restano conservati.
- Il comando di eliminazione nell’archivio usa un cestino e conserva la conferma prima di eliminare. La freccia circolare resta dedicata all’azzeramento della lettura.
- Sincronizzazione come icona nell’intestazione, accanto all’icona di salvataggio, sia nel contatore sia nell’archivio. Il comando esegue aggiornamento e recupero dei dati; non trasmette richieste o email.
- Il disclaimer degli utenti registrati resta nel fondo pagina, senza il pulsante duplicato che lo riapriva come «Avviso Conteggi». Gli ospiti possono leggere l’avviso direttamente nel fondo e attivare esplicitamente la sincronizzazione.
- Un errore di sincronizzazione rimane visibile anche dopo gli aggiornamenti in background. Si cancella dopo un aggiornamento riuscito o un cambio di proprietario; non impedisce di conservare i dati sul dispositivo o tornare al configuratore.

## Sincronizzazione: attivazione server ancora pendente

**I servizi Conteggi non sono ancora installati sul server.** Il nuovo controllo trova `counts_lists` e `counts_entries` assenti e nessuna funzione `counts-api` o `submit-counts`. Il tentativo di installazione tramite il collegamento Supabase restituisce ancora `Invalid or expired requestState`; nessuna migrazione viene applicata. Nessuna email reale inviata.

Il codice per sincronizzare le letture salvate nel profilo, anche senza campo, e trasmettere volontariamente una richiesta è incluso. Il solo caricamento dello ZIP non attiva questi servizi. Il salvataggio locale resta disponibile. Procedura in [PUBBLICAZIONE.md](PUBBLICAZIONE.md).

## Verifiche e caricamento

**204/204 test mirati superati**, senza test saltati. I controlli sintattici, di versione, cache e compatibilità sono documentati in [QA_RELEASE_1.3.6.md](QA_RELEASE_1.3.6.md) e nel manifest. Le prove browser usano moduli autentici con servizi cloud simulati: non certificano il backend LIVE o dispositivi Safari/iOS fisici.

Caricare l’intero contenuto di `Vivai_Obice_Piattaforma_v1.3.6.zip` secondo [LEGGIMI_CARICAMENTO_UNICO.md](LEGGIMI_CARICAMENTO_UNICO.md). Conservare i dati locali; chiudere le vecchie schede Conteggi e riaprire online prima delle prove offline. Il Service Worker controlla soltanto `/conteggi/`, con 43 risorse statiche coordinate.
