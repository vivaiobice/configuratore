# V40 — verifica correzioni visuali

Data: 23 settembre 2026  
Ambiente: TEST

## Modifiche verificate

- GPS mobile nuovamente centrato nel pulsante circolare, con icona e sigla disposte verticalmente.
- Vai al campo mobile mostrato come comando circolare a sola icona, senza testo spezzato.
- Perimetro del campo desktop chiaro e sottile sopra la mappa satellitare.
- Badge numerici 01 e 02 rimossi dalla barra laterale desktop.
- Quantità commerciale in evidenza nel riepilogo desktop.
- Barbatelle calcolate mostrate come informazione secondaria.
- Identica gerarchia quantità nelle schede riepilogative mobile.

## Vincoli rispettati

- Formula delle barbatelle invariata.
- Arrotondamento commerciale al multiplo di 25 invariato.
- Geometrie, filari, pali e aree escluse invariati.
- Persistenza, sincronizzazione e database invariati.
- Nessun intervento su Supabase LIVE.

## Gate automatici

- Test specifici V40: **6/6 PASS**.
- Suite completa: **411/411 PASS**.
- `npm run check`: **PASS**.

## Collaudo manuale consigliato

1. Su iPhone verificare che GPS e Vai al campo siano entrambi circolari e senza testo troncato.
2. Aprire un campo e controllare che la quantità commerciale sia grande e quella calcolata piccola.
3. Su desktop verificare il perimetro chiaro sopra una zona satellitare sia chiara sia scura.
4. Controllare che i filari restino più evidenti del perimetro.
