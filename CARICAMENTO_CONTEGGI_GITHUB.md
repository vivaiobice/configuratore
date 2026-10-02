# ZIP del modulo Conteggi — Vivai Obice

Questo è il pacchetto Conteggi da caricare nella radice del repository `vivaiobice/configuratore`, insieme al pacchetto separato prodotto dal Work “Progetta impianto”.

## Caricamento una sola volta

1. Scarica ed estrai questo ZIP sul computer.
2. Apri https://github.com/vivaiobice/configuratore e prepara un ramo di integrazione separato, per esempio `integrazione-conteggi-v1`.
3. Dalla radice del repository usa **Add file → Upload files** e trascina le cartelle estratte, mantenendo `conteggi/`, `src/`, `supabase/`, `tests/`, `scripts/` e `docs/`. Carica i file contenuti, non lo ZIP come unico file.
4. Carica nello stesso ramo lo ZIP del Work “Progetta impianto”, con i suoi pulsanti e collegamenti. Quel pacchetto deve preservare i file Conteggi già caricati, usare il client qui fornito e integrare il proprio salvataggio/ripristino.
5. Dopo collaudo coordinato, integra il ramo nel repository e gestisci il rilascio comune. Il caricamento GitHub non applica automaticamente le migrazioni e non pubblica le Edge Functions Supabase.

I due pacchetti vanno assemblati e verificati prima della pubblicazione. Questo ZIP aggiunge **40 file**: nessuno dei file applicativi già presenti nella base viene sostituito. `CARICAMENTO_CONTEGGI_GITHUB.md` e `MANIFEST_CONTEGGI.json` documentano il caricamento. Non caricare il vecchio pacchetto completo sopra questo: era una consegna tecnica con l’intero repository.

## Cosa contiene questo Work

- Pagina autonoma `/conteggi/`, intestazione e selettore logo **di Conteggi**, liste, contatore +1/−1, correzione manuale, titoli/vitigni e note.
- Persistenza locale, ripresa, coda sincronizzazione, gestione conflitti e cambio account; client unico `src/counts-client.js`.
- Servizi `counts-api`, `counts-admin`, `submit-counts`, migrazione additiva e gancio privato per il coordinatore guest comune.
- Consultazione amministrativa distinta dalle richieste volontarie; riepilogo immutabile e ritentativo protetto email.
- Test, contratto e scheda di interscambio in `docs/conteggi/Rilascio_e_integrazione.md`.

## Cosa consegna il Work “Progetta impianto”

Il suo ZIP è responsabile del selettore logo **del configuratore**, dei collegamenti dal Profilo e dai campi, dei riepiloghi modificabili desktop, dell’ingresso amministrativo e del salvataggio/ripristino dell’editor. Fornisce gli adattatori condivisi FieldDirectory e Auth/coordinatore guest e adotta l’adapter email comune, come descritto nella scheda tecnica.

Il suo codice importa il CountsGateway di questo ZIP: non ricrea contatore, archivio, login, funzioni Counts o un secondo adapter email. Eventuali modifiche concordate ai file di innesto di Conteggi devono essere esplicitamente indicate nella sua consegna, senza sostituire il modulo con copie o placeholder.

## Dipendenze esistenti — mantenute nel repository

Questo ZIP è **un’aggiunta al repository attuale**, non un sito autosufficiente da caricare in un repository vuoto. I servizi Auth e profilo, la configurazione Supabase e il catalogo vitigni restano quelli esistenti. Le dipendenze dirette già presenti sono:

- `src/auth-service.js`
- `src/backend.js`
- `src/config.js`
- `src/plant-catalog.js`
- `src/profile-ui.js`
- `supabase/functions/_shared/quote-request.js`

Gli asset originali già presenti rimangono quelli approvati:

- `assets/logo-vivai-obice-v14.png`
- `assets/favicon-v26.png`
- `assets/apple-touch-icon-v26.png`

Base verificata: `ab25ab7d16bfc9ec35a3ffa7ec8a16ef90a0cbc3`. Commit della consegna Conteggi: `38f461ef4150fac784a4f75ec7627426d2cf6f2a`. Il Work del configuratore indicava una base locale diversa: confrontare i due rami prima di assemblarli; la scheda tecnica spiega l’integrazione.

## Stato del rilascio

Tutti i flag pubblici sono OFF. Il codice è stato collaudato localmente nella consegna precedente; questo pacchetto contiene gli stessi byte del commit indicato, senza nuove modifiche applicative. Restano adattatori condivisi, prova reale fra strumenti, verifica dispositivi e validazione privacy prima della raccolta pubblica.

Lo ZIP non contiene credenziali private, node_modules, copie del configuratore o sue vecchie release. Nessun database remoto, DNS o repository GitHub è stato modificato per prepararlo. Nessuna email reale è stata inviata.

Riferimento ufficiale per il caricamento: https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
