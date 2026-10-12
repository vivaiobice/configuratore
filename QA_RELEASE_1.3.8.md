# Collaudo 1.3.8 — Nomi dei campi

## Test automatici

**41 test superati; 0 falliti, saltati o annullati.**

Comando: `node --test --test-reporter=spec tests/map-overlay-visibility.test.mjs tests/map-field-label-visibility.test.mjs tests/map-field-label-overlay.test.mjs tests/map-committed-visuals.test.mjs tests/release-version.test.mjs tests/portion-release-cache.test.mjs tests/map-gestures.test.mjs`.

La suite verifica l'indipendenza delle quattro voci, Mostra tutto, movimento e ridisegno dei nomi, trasferimento della mappa mobile, modifica dei vertici con nomi nascosti, gesti e allineamento della versione/cache.

## Browser

Applicazione effettiva con MapLibre e Draw, usando risposte locali per autenticazione e cartografia. Nessuna richiesta esterna autorizzata, nessuna scrittura cloud o trasmissione.

| Formato | Dimensioni | Esito |
|---|---|---|
| Desktop | 1440 × 1000 | Superato |
| Mobile | 390 × 844 | Superato |
| Mobile piccolo | 320 × 568 | Superato |
| Mobile orizzontale | 844 × 390 | Superato |

Verificati i click/tap reali, il ripristino di tutte le voci, i nomi dopo il ridisegno, Campi ed editor mobile, i controlli durante la modifica dei vertici e la chiusura con Escape. Ogni opzione conserva un'area di interazione di almeno 44 px; il menu e Mostra tutto restano dentro la vista anche nelle anteprime più piccole. Nelle anteprime il menu usa due colonne, quattro in orizzontale.

I dati del progetto, le geometrie GeoJSON e i risultati di calcolo sono confrontati dopo ogni cambio di visibilità e restano identici. Nessun errore runtime nel collaudo. Si tratta di prove browser con viewport e touch simulati, non di un collaudo su dispositivi fisici.

SHA-256 dei 173 file serviti verificati contro gli stessi file inclusi nella consegna. Il rapporto browser ha SHA-256 `04d17bb7373f13d836a64f6c864c083821b1ec3e1c23d88062762a534a256b53`.

## Integrità e perimetro

`node --check` sui due moduli modificati e `git diff --check` superati. `npm run offline:build` ha preparato 43 risorse Conteggi; cache e risorse sono aggiornate alla 1.3.8.

Confrontati 179 file runtime di src/admin/conteggi con lo ZIP 1.3.7: identici dopo aver normalizzato soltanto la query di versione, esclusi configurazione release, modulo visibilità e service worker generato. L'altra modifica funzionale è map-visibility.css. Calcolo terreno, stampa e backend mantengono il comportamento precedente. L'attivazione server Conteggi resta pendente; nessuna migrazione, pubblicazione remota o email eseguita.

Lo ZIP contiene la piattaforma completa e un inventario SHA-256 in manifest-piattaforma.json. L'archivio viene verificato per CRC, elenco e identità di ogni file con il sorgente collaudato.
