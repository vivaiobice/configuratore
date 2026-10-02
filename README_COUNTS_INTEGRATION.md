# Configuratore ↔ Conteggi: interscambio V1

Pacchetto integrato per il Configuratore 1.0.5 e Conteggi V1. `APP_CONFIG.countsEnabled` è `true` e questo archivio contiene sia `/conteggi/` sia `src/counts-client.js`. La sola modalità locale di Conteggi è attiva; sincronizzazione, invio e consultazione amministrativa restano disattivati. Nessuna migrazione, secret, modifica DNS o pubblicazione è stata eseguita.

## Interfacce già predisposte

| Responsabilità | Implementazione | Contratto |
|---|---|---|
| Destinazioni e link | `src/counts-routes.js` | Stessa origine; `integrationVersion=1`; viste `resume`, `lists`, `new`, `list`, `counter`, `admin`; ID cloud convalidati, nessun token/recapito/geometria nell'URL. L'ambiente di test richiede basi esplicite se non è localhost. |
| Cambio strumento | `src/tool-switch.js`, `src/storage.js`, `src/map.js`, `src/mobile-ui.js` | Checkpoint V3 owner scoped, bozza perimetro/passaggio/esclusione, camera, schermo e transazione editor mobile. Lettura di verifica prima della navigazione; coda cloud senza attesa della rete. Se lo storage fallisce, si resta nell'editor. |
| Logo e ingressi | `src/tool-menu.js`, `src/profile-ui.js`, `src/mobile-ui.js`, `src/desktop-library-ui.js`, `admin/admin.js` | Originale V14; scelta Configuratore/Conteggi; Profilo guest e user; nuovo conteggio dal campo; link admin visibile solo dopo verifica UI del ruolo. Il server Conteggi deve verificare di nuovo il ruolo. |
| Directory campi | `src/field-directory.js` | `listProjects()`, `listFields(projectId)`, `resolveField(projectId,fieldId)`; proiezione di sole etichette da tabelle owner scoped e ambiente, senza geometria/design data. `projectId=projects.id`, `fieldId=project_fields.client_field_id` con projectId. |
| Campo solo locale | `src/field-directory.js` | `view=new` senza ID cloud; `writePendingFieldContext(sessionStorage, …)` conserva `localProjectId`, `localFieldId`, etichette, owner e ambiente per 24 ore. Conteggi legge con `readPendingFieldContext(sessionStorage,ownerId,environment)` e associa dopo verifica/sync. Se indisponibile, il conteggio resta non associato. |
| Auth leggera | `src/counts-auth-bootstrap.js` | `createCountsAuthBootstrap()` con stesso client/sessione Supabase e `createAuthService`; restituisce `auth`, `fieldDirectory`, `getIdentityEpoch`. Non avvia mappa, cloud hydration o analytics. Il Work Conteggi fornisce i callback di checkpoint prima/dopo i cambi d'identità. |
| Riepilogo desktop | `src/counts-desktop-summary.js`, `src/desktop-library-ui.js` | `listRecentLists(5)`, apertura lista e `getFieldSummary` per categorie e righe distinte; nessuna mutation o duplicazione dell'archivio. |

Conteggi fornisce `conteggi/index.html` e `src/counts-client.js` con export `createCountsGateway({scope,store?,transport?,channel?})`. Il Configuratore usa `src/counts-desktop-gateway.js` per leggere lo stesso archivio locale, con scope separato per backend, ambiente e proprietario. Il suo pannello non crea liste, tabelle o conteggi.

Il catalogo varietà esistente si consulta con `listVarieties()` da `src/plant-catalog.js`; non serve importare clone o portainnesto nelle righe Conteggi. Validatore recapiti già presente: `validateContact()` in `src/backend.js`; l'eventuale adapter email condiviso richiede un accordo sul servizio nuovo, e `submit-quote` non va usato per Conteggi.

## Identità, dati e gate mancanti

- Il grant guest esistente trasferisce i progetti. La routine idempotente per trasferire *i conteggi* deve essere fornita dal Work Conteggi e coordinata prima di attivare login/trasferimento Conteggi. Un semplice login non autorizza il trasferimento dei conteggi.
- `src/counts-client.js`, la pagina `/conteggi/`, le funzioni e la migrazione per il futuro backend sono inclusi nell'archivio, ma non sono stati distribuiti né attivati. La modalità locale usa IndexedDB sul dispositivo e richiede una sessione Auth per distinguere i profili.
- La guardia UI admin non sostituisce una verifica ruolo e identità permanente lato server. I dati Conteggi non devono essere letti tramite un codice pubblico di progetto.
- Verificare `/conteggi/` sull'hosting reale, la stessa sessione guest/user, andata e ritorno con disegno parziale e separazione A→B. I gate sync/admin/invio del Work Conteggi rimangono distinti e spenti fino alla predisposizione del backend e delle verifiche privacy.

## Marchio da condividere

| Asset | SHA-256 |
|---|---|
| `assets/logo-vivai-obice-v14.png` | `940fcaae10b85c6b3c04f800269be37c8f31c72340b2034ba94dbe5b692d2f85` |
| `assets/logo-vivai-obice-lineare.png` | Identico al V14, stessi byte |
| `assets/favicon-v26.png` | `fc36519c32dfa23754a0c01551af50843b7625dbd6827bbc6af9f4e0dfe59f59` |
| `assets/apple-touch-icon-v26.png` | `2c9a650cfe6c8370f805e510be20d688df8e7ed213039782b72d28bdb31c78e8` |

Palette `#183f28`, `#275f3e`, `#142019`, `#eef1ed`, `#ffffff`, bordo `#dce2dd`; font Inter/system. Il logo non va ridisegnato o deformato. Nel Configuratore il footer discreto riporta “Uno strumento Vivai Obice” e il copyright 2026. Il modulo Conteggi applica la stessa firma nel proprio layout.

Verifica locale: `npm test`, `npm run check` e `node --test tests/counts-*.test.mjs`. Il test con sessione reale e hosting è successivo alla pubblicazione del pacchetto unico.
