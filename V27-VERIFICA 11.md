# V27 — Rapporto di verifica

Release mobile del Configuratore vigneto Vivai Obice, ambiente TEST.

## Correzioni

- Navigazione pan mobile durante disegno del perimetro e modifica delle aree escluse.
- Vecchio fullscreen escluso quando è attiva la shell WebApp mobile.
- Comandi `Annulla` e `Fine modifica` mantenuti nella stessa shell dell'editor.
- Checkbox vendemmia meccanizzata visivamente 28×28 px con target touch 44×44 px.
- Comportamento desktop conservato.

## Verifiche automatiche

- `npm test`: 264 test superati, 0 falliti.
- `npm run check`: controllo sintattico dei moduli JavaScript.
- Regressione mobile: lo sfondo resta pannabile durante disegno, modifica esclusione e dopo il
  trascinamento di una maniglia.
- Regressione desktop: lo sfondo resta bloccato durante il disegno, come prima della V27.
- Regressione fullscreen: la shell mobile attiva non permette più lo spostamento della mappa nel
  contenitore fullscreen precedente.
- `styles.css` desktop invariato rispetto alla base approvata.

## Collaudo iPhone richiesto

1. Creare un campo e spostare la mappa con un dito durante il disegno.
2. Creare un'area esclusa, aprire `Modifica`, spostare lo sfondo e poi una singola maniglia.
3. Usare `Fine modifica`; ripetere e usare `Annulla` per verificare il ripristino.
4. Controllare la nuova dimensione visuale della checkbox e la comodità del tocco.

Il collaudo automatico non equivale a una prova tattile su Safari iPhone reale.
