# Fase A — Rapporto di verifica

Data: 21 settembre 2026  
Ambito: archivio cloud e storico progetti, esclusivamente Ambiente TEST  
Release di partenza: V29 · pubblicazione TEST autorizzata come V30

## Esito locale

- `npm test`: 318 test superati, 0 falliti (gate finale).
- `npm run check`: superato, nessun errore sintattico nei file JavaScript di `src/` e `admin/`.
- Contratti coperti: snapshot v2, RLS/RPC, identità, coda offline, retry idempotente, conflitti,
  revisioni manuali, migrazione V29, integrazione mobile/desktop, archivio Admin e GeoJSON FieldArea.
- Nessuna modifica grafica al configuratore mobile o desktop.

## Sicurezza prevista dallo schema

| Verifica | Evidenza locale | Verifica TEST reale |
|---|---|---|
| Owner legge i propri dati | Policy RLS e test di contratto | Superato: 1 progetto, 1 campo, 1 revisione |
| Guest B non legge Guest A | Policy owner/admin | Superato: 0 progetti, 0 campi, 0 revisioni |
| Admin legge tutti i proprietari | Claim `app_metadata.role=admin` | Superato: visibilità completa |
| Revisioni non aggiornabili/eliminabili | Nessuna policy update/delete | Superato da contratti e privilegi DB |
| Retry non duplica | Operation ID primaria e test coordinatore | Superato: stesso esito/versione 1 |
| Versione obsoleta non sovrascrive | Conflitto RPC e test coordinatore | Superato: `status=conflict`, serverVersion 1 |
| Eliminazione recuperabile | Soft delete e finestra 30 giorni | Superato: delete + restore |
| Guest inattivi | Funzione Admin, soglia 90 giorni | Superato: bozza a 91 giorni archiviata |

## Stato migrazione

Migrazione applicata esclusivamente al progetto Supabase TEST `lnclwslcjufwdbmsxljf`:

- `20260921154656 cloud_archive_history`;
- `20260921154748 cloud_archive_advisor_fixes`;
- `20260921154953 fix_cloud_rpc_boundary`;
- `20260921155136 harden_cloud_rpc_boundary`.

Le sonde DB hanno rilevato e corretto prima del rilascio il confine RPC: i wrapper pubblici restano
`SECURITY INVOKER`, mentre le implementazioni `SECURITY DEFINER` rimangono nello schema privato,
con controllo `auth.uid()` e permessi espliciti. L'accesso anonimo Auth è stato abilitato e verificato
con la creazione reale di un utente Guest tramite endpoint pubblico; l'utente è stato poi eliminato.
LIVE non è stato toccato.

L'advisor sicurezza segnala gli avvisi attesi `auth_allow_anonymous_sign_ins`: gli utenti Guest usano
per definizione il ruolo PostgreSQL `authenticated`. Le policy non concedono accesso generale, ma
mantengono i predicati di proprietà `auth.uid() = owner_user_id`; le sonde con due identità hanno
confermato l'isolamento. L'advisor prestazioni non segnala più problemi nuovi della Fase A; gli indici
non ancora usati sono normali su tabelle vuote.

## Offline e dispositivi

La coda e i percorsi di errore sono verificati automaticamente, incluso il ciclo completo: Save
offline, commit server con risposta persa prima dell'ack, riavvio del coordinatore, retry con la stessa
operation ID, un solo progetto e una sola revisione. Il test ha inizialmente rilevato che l'intenzione
di revisione veniva persa quando il primo flush falliva; ora viene conservata come revisione differita
e risolta dopo l'ack dell'autosalvataggio precedente.

Restano obbligatorie le sole prove tattili/visive su browser reale desktop e Safari iPhone: confermare
che la UI resti utilizzabile offline e che mappa/editor e controlli V29 siano invariati.

## FieldArea

Il normalizzatore supporta Feature, FeatureCollection, Polygon e MultiPolygon GeoJSON WGS84, rifiuta
geometrie aperte/autointersecanti/non geografiche e registra provenienza più fingerprint SHA-256.
Non è stata eseguita alcuna importazione di produzione; serve ancora un GeoJSON reale con KML di
confronto. Nessun importatore pubblico è esposto.

## Go / no-go

**GO per V30 in Ambiente TEST; NO-GO per LIVE.** Migrazione TEST, RLS, idempotenza, conflitti,
recupero, retention e ciclo offline logico sono verificati. L'approvazione esplicita per release,
manifest, cache bust e ZIP è stata ricevuta. Resta la prova visiva/tattile su browser reale
desktop+iPhone prima di qualsiasi valutazione per LIVE.
