# V41 — verifica filari curvi e documento cliente

Data: 24 settembre 2026  
Ambiente: TEST

## Modifiche incluse

- Orientamento filari manuale con precisione di 0,1°.
- Punti di curvatura multipli per archi e forme a S.
- Punti trascinabili sulla mappa e controllabili anche dalla scheda del campo.
- Persistenza indipendente dei punti per ciascun campo.
- Calcoli di metri lineari, barbatelle e pali basati sulla lunghezza curva effettiva.
- Curve riportate in mappa, anteprime, condivisione e documento stampabile.
- Documento intestato Vivai Obice con scelta campo/intero progetto, destinatario, mappe, dati,
  QR alla revisione, disclaimer e stampa/PDF.
- Esempi di testo generici, non derivati da e-mail o dati cliente.

## Vincoli e sicurezza

- Il progetto condiviso è in sola lettura per il Guest.
- Solo proprietario autenticato o Admin può aprire la modifica, dopo controllo server-side.
- Il documento crea una revisione datata e il QR identifica quella condivisione.
- Le tre migrazioni del documento sono state applicate esclusivamente a Supabase TEST.
- Nessuna modifica applicata a Supabase LIVE.
- In assenza di punti di curvatura, il calcolo rettilineo approvato resta invariato.

## Gate automatici

- Suite completa: **480/480 PASS**.
- `npm run check`: **PASS**.
- Verifica sintattica QR locale: **PASS**.

## Collaudo manuale consigliato

1. Aprire un campo e inserire un orientamento con virgola, per esempio `42,7`; verificare cursore,
   mappa, salvataggio e riapertura.
2. Aggiungere un punto di curvatura, trascinarlo e controllare che i filari formino un arco.
3. Aggiungere un secondo punto con spostamento opposto e controllare la forma a S.
4. Rimuovere e poi azzerare i punti; verificare il ritorno ai filari rettilinei.
5. Passare a un altro campo e verificare che le curvature rimangano indipendenti.
6. Su iPhone verificare trascinamento, zoom e navigazione della mappa senza tocchi involontari.
7. Generare il documento per un solo campo e poi per l’intero progetto; verificare intestazione,
   piè pagina, curve, misure, quantità commerciale e orientamento decimale.
8. Stampare o salvare in PDF A4 e controllare interruzioni pagina, logo e leggibilità.
9. Scansionare il QR da un dispositivo Guest: il progetto deve essere consultabile ma non modificabile.
10. Accedere come proprietario/Admin e verificare che il collegamento all’editor sia disponibile solo
    dopo l’autorizzazione prevista.
