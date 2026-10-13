# V28 — Rapporto di verifica

Release mobile del Configuratore vigneto Vivai Obice, ambiente TEST.

## Correzioni

- Unico comando nella mappa LIVE dei parametri: ricentra sul campo.
- Presente sia alla creazione sia alla successiva modifica dell'impianto.
- Checkbox vendemmia meccanizzata quadrata 34×34 px, target touch 44×44 px.
- Nome automatico `Varietà · Portainnesto` esclusivamente per campi non rinominati dall'utente.
- Migrazione compatibile dei progetti locali precedenti.
- Desktop invariato.

## Verifiche automatiche

- `npm test`: 268 test superati, 0 falliti.
- `npm run check`: controllo sintattico dei moduli JavaScript.
- Test del nome automatico con sola varietà, varietà e portainnesto, nome personalizzato e dati legacy.
- Test della mappa LIVE sia nel primo inserimento sia rientrando in modifica.
- Verifica dell'unico pulsante esterno al contenitore cartografico e ripristino del nodo originale.
- `styles.css` desktop: hash identico alla base approvata.

## Collaudo iPhone richiesto

1. Creare un campo e verificare nella schermata impianto il solo pulsante di ricentraggio.
2. Salvare, riaprire il campo e verificare nuovamente il pulsante.
3. Selezionare varietà e portainnesto lasciando `Campo N`; controllare il nuovo nome automatico.
4. Assegnare un nome manuale e cambiare nuovamente materiale: il nome deve rimanere invariato.
5. Controllare forma, dimensione e facilità di tocco della checkbox vendemmia meccanizzata.

Il collaudo automatico non equivale a una prova tattile su Safari iPhone reale.
