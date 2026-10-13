# Verifica 1.3.11

Base: archivio completo 1.3.10, 775 file, SHA256 `2936bc020e1aa8c6533213660ee20352ebb549c14ec665a2cb294e8489036a85`.

## Interfaccia e compatibilità

- Test Node per modalità Affina progetto, un solo pannello visibile, ripristino dei nodi originali, ordine delle card, nome progetto e versione; accesso Media dal campo.
- Profilo Chromium: 19 test comprendenti utente, accesso e registrazione a 320×568, 369×800, 360×640, 568×320, 640×360 e 844×390. Dieci campi e pulsanti visibili, senza scorrimento pagina o sovrapposizioni con navigazione/versione.
- Prove dell'app autentica con MapLibre 4.7.1 e Draw 1.5.0, servizi esterni simulati e dati sintetici; caricamenti tramite selettore nativo, IndexedDB reale, ripristino dopo ricaricamento, separazione fra campi e confronto del disegno/filari prima e dopo.
- Download documenti verificato sui byte del PDF caricato. SDK cloud simulato per il flusso completo delle API; controlli database reali separati.
- Versione coordinata 1.3.11 nelle cinque pagine principali e nei package. Conteggi offline: 49 risorse, lista generata corrispondente al worker.
- Nessun file della base eliminato; moduli terreno modificati soltanto nelle query di versione. Il banco di prova che estrae le funzioni dell'app riceve il mock del nuovo dialogo Media, mantenendo tutte le verifiche originali sui calcoli. Controllo riferimenti locali, identità DOM, sintassi e whitespace.

## Media e backend

- Test storage: Blob, limite 25 MiB, isolamento ospite/progetto/campo/ambiente, fine transazione, account permanenti, proprietà, errori parziali, recupero delle prenotazioni incomplete, cambio campo/account, URL, refresh token e spostamento/rinomina del campo.
- Test UI: tre origini di caricamento, elenco datato, ingrandimento, recupero del contesto, risultati tardivi e anteprime concorrenti.
- Revisione indipendente dei grants, RLS, percorsi immutabili e bucket privato. Migrazione additiva `field_media_private_storage` applicata al backend della piattaforma. Nessuna modifica a progetti/letture degli utenti.
- Security advisor dopo la migrazione: nessun nuovo rilievo rispetto alla verifica precedente. Le segnalazioni preesistenti non sono state modificate da questa release.
- Verifica LIVE in sola lettura: bucket privato, limite 26.214.400 byte, RLS abilitata, quattro policy metadati e tre policy Storage; gli utenti possono aggiornare soltanto `status`. Nessuna fixture di progetto, metadato o oggetto è rimasta nel database.
- Il tentativo dello script transazionale `scripts/verify-field-media-rls.sql` non ha restituito un esito dal collegamento ed è stato interrotto. Non viene dichiarato superato. Il controllo delle definizioni/grants LIVE, la revisione e le prove del contratto SDK restano distinti dalla sua esecuzione.

## Limiti di prova

Chromium con viewport mobile e fixture cloud non sostituisce una prova su iPhone/Safari fisico. Il selettore Fotocamera è configurato con `capture="environment"`; lo scatto reale va provato sul telefono dopo il caricamento. L'accesso Storage reale con un account utente e un file fisico non è simulato dalla verifica SQL.

Media ospite resta sul browser/dispositivo e non si trasferisce automaticamente all'accesso. Chiusure improvvise del browser possono lasciare prenotazioni incomplete recuperabili quando il campo è disponibile; un servizio di pulizia periodica degli oggetti abbandonati non è incluso.

Questa release non corregge i limiti già noti di Adatta al terreno. Le cinque prove geometriche fallite nella 1.3.10 sono confrontate con l'esito completo della suite corrente; non vengono ignorate né riscritte.

## Esito finale

Suite completa con reporter TAP: 2.045 prove, 2.036 superate, 8 fallite, 1 saltata. Tre fallimenti erano dovuti al mock Media mancante nel banco di prova di caricamento del campo; dopo l'aggiornamento, le stesse tre verifiche passano (3/3), senza modificare la logica del calcolo. I cinque fallimenti rimanenti coincidono esattamente con la base 1.3.10:

- native nonsplit replacement keeps original width and restores the complete previous split group
- actual canonical cut child finite closed physical caps certify A and B on regular plane boundary
- current V2 replacement preserves owner width and cached foreign result while retiring all old split children coherently
- scoped cut candidate seam certifies a real complete single level when heterogeneous progressions fail
- actual native five-metre crease cut certifies the constructive filled families and fixed-reference gain

Le 27 verifiche mirate Media/editor passano; le 19 prove browser del profilo sono eseguite separatamente. Il test browser del profilo nella suite Node generale è opzionale e viene saltato solo lì; viene eseguito esplicitamente con `MOBILE_PROFILE_BROWSER=1`.

Gli esiti conclusivi dell'app nel browser, del database e l'inventario sono registrati nel manifest della release. La suite complessiva non è dichiarata interamente verde: i cinque problemi geometrici precedenti restano aperti.

Browser finale: **9 casi, 125 verifiche, tutte superate**, release 1.3.11, modalità diagnostica disattivata, nessun errore browser non gestito. Le sorgenti e gli stili serviti sono rimasti identici durante il test e sono confrontati con il pacchetto consegnato.
