# V29 — Rapporto di verifica

Release mobile, esclusivamente visiva, del Configuratore vigneto Vivai Obice.

## Correzioni

- Icona SVG 24×24 centrata geometricamente nel pulsante `Torna al campo`.
- Un solo elemento visuale per la checkbox vendemmia meccanizzata in entrambi gli stati.
- Identiche dimensioni e posizione del quadrato vuoto e selezionato.
- Nessuna modifica funzionale o desktop.

## Verifiche automatiche

- `npm test`: 269 test superati, 0 falliti.
- `npm run check`: controllo sintattico JavaScript superato.
- CSS: assenza del secondo pseudo-elemento nello stato selezionato.
- CSS: icona di ricentraggio 24×24, background centrato e SVG indipendente dal font.
- `styles.css` desktop invariato rispetto alla base approvata.

Il controllo conclusivo dell'allineamento deve essere effettuato visivamente su Safari iPhone reale.
