# V33 — Rapporto di verifica registrazione

Data: 22 settembre 2026  
Ambiente: Supabase TEST `lnclwslcjufwdbmsxljf`  
LIVE: non modificato

## Causa accertata

Il profilo `vivaiobice` creato durante il collaudo risultava ancora Guest: password hash presente,
e-mail non applicata, indirizzo fermo in `email_change`, `is_anonymous=true`. La conversione Guest di
Supabase non può essere completata impostando contemporaneamente e-mail non verificata e password.

## Correzione

- Nuova Edge Function `promote-guest-account`, ACTIVE e con verifica JWT obbligatoria.
- Promozione dello stesso UID Guest mediante API Admin server-side; nessuna chiave privilegiata nel client.
- Username riservato prima della promozione e protetto dall'indice univoco case-insensitive.
- Rate limit riutilizzato anche per la registrazione.
- Errori Edge decodificati e mostrati con un messaggio utile.
- Cache bust V33 applicato a tutti i moduli modificati.

## Prove

- Test end-to-end remoto: Guest → promozione `200` → login username `200`.
- UID identico nei tre stati; record temporaneo eliminato (`remaining=0`).
- Test mirati autenticazione/backend/Edge: 30/30.
- Suite completa: 356/356.
- Controllo sintassi JavaScript: superato.
- `styles.css` desktop, editor, geometria e calcoli invariati.

## Recupero del test utente

Il Guest esistente con username `vivaiobice` può ripetere `Crea account` dallo stesso dispositivo:
la V33 riconosce lo stesso UID e completa la promozione senza perdere i progetti associati.
