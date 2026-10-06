# V31 — Rapporto di verifica

Data: 21 settembre 2026  
Ambiente: Supabase TEST `lnclwslcjufwdbmsxljf`  
LIVE: non modificato

## Funzioni consegnate

- Profilo mobile nella barra inferiore.
- Login desktop in alto a destra e menu del profilo autenticato.
- Registrazione e accesso con e-mail oppure username; username numerici preservati come stringhe.
- Trasferimento una tantum e idempotente dei progetti Guest verso un account esistente.
- Password reset tramite e-mail; nessun SMS e nessun numero telefonico.
- Accesso Admin derivato esclusivamente dai claim protetti.

## Verifiche eseguite

- Migrazione V31 e migrazione indici applicate esclusivamente a TEST.
- Edge Function `login-by-identifier` distribuita ACTIVE con JWT obbligatorio.
- Sonda SQL transazionale: progetto Guest trasferito `1`, username risultante `000123`, grant
  consumato `1`; secondo consumo restituito in modo idempotente.
- Utente anonimo creato per la prova API e successivamente eliminato (`remaining = 0`).
- Advisor performance: corretti gli indici mancanti sulle due foreign key di
  `private.guest_transfer_grants`.
- Suite locale: `353/353` test superati.
- Controllo sintassi: `npm run check` superato.
- Foglio desktop `styles.css` lasciato invariato e ancora cache-busted a V18.

## Avvertenze residue

- L'advisor segnala le policy disponibili agli utenti anonimi: è una scelta intenzionale perché il
  prodotto supporta il funzionamento Guest, mantenendo l'isolamento tramite `auth.uid()` e RLS.
- La protezione Supabase contro password compromesse risulta disabilitata e va attivata dal pannello
  Auth prima dell'apertura pubblica definitiva.
- La resa, la tastiera e i gesti devono ancora essere verificati su un iPhone/Safari reale.
