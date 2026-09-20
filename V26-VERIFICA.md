# V26 — Rapporto di verifica

Release mobile del Configuratore vigneto Vivai Obice, ambiente TEST.

## Perimetro della release

- Fix mobili numerati 1–13 documentati in `PROMPT_JOURNAL.md`.
- Nessuna implementazione di filari curvi, DEM, pendenze o terreno 3D: funzionalità pianificata per
  una release futura.
- Nessuna modifica al funzionamento o alla presentazione desktop.

## Verifiche automatiche

- `npm test`: 260 test superati, 0 falliti.
- `npm run check`: controllo sintattico dei moduli JavaScript.
- `styles.css`: SHA-256
  `a6ecdd2c230c382f8a3351f5755d93d7244719b6ad4a00f43acabbc7acaeee90`, identico alla base desktop
  approvata.
- Test DOM mirati: scelta e persistenza del valore tramite controllo mobile, checkbox meccanizzazione,
  ordine Nome/anteprima, anteprima LIVE, tastiera Visual Viewport, calcolatore rapido, gesto trascinato
  che non produce click, bussola MapLibre trasferita e ripristinata, colori mobile e ripristino desktop.
- Asset: manifest e dimensioni PNG verificati automaticamente; icona WebApp trasparente 1254×1254,
  Apple Touch Icon 180×180, favicon 48×48.

## Collaudo necessario su iPhone

I test automatici non equivalgono a Safari iOS reale. Dopo la pubblicazione verificare:

1. eliminare e aggiungere nuovamente l'icona alla schermata Home se iOS mostra ancora quella in cache;
2. aprire tutti i selettori: inquadramento, vitigno, clone e portainnesto;
3. attivare/disattivare `Vendemmia meccanica prevista` e verificare la capezzagna;
4. durante il primo impianto provare pan, pinch-zoom e rotazione nella mappa satellitare LIVE;
5. compilare Nome campo, distanze, note e calcolatore con tastiera aperta in verticale e orizzontale;
6. verificare bussola live e ripristino del Nord;
7. salvare, riaprire il campo e controllare che valori e conteggi siano persistiti.

Non cancellare dati del sito per aggiornare l'icona senza aver prima esportato/salvato i progetti:
l'archivio Progetti è locale al browser/dispositivo.
