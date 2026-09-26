# V42 — verifica correzioni e accesso tramite ID

Data: 24 settembre 2026  
Ambiente: TEST

## Modifiche incluse

- Pan desktop della mappa tramite scorrimento trackpad a due dita, senza pressione fisica.
- Checkbox `Mantieni equidistanza filari`, attiva per impostazione predefinita e salvata per campo.
- Offset normali della curva guida e protezione dai tratti con cuspidi o inversioni troppo strette.
- Perimetro trasparente sulla foto satellitare del documento; riempimento mantenuto nello schema.
- Filigrana Vivai Obice centrata al 5% su ogni pagina A4.
- URL completo rimosso dal documento; restano QR della revisione e ID progetto `VO-1234567`.
- Comando `Carica progetto` su desktop e nel Profilo mobile.
- Consultazione Guest in sola lettura; accesso all’editor soltanto dopo autorizzazione proprietario/Admin.

## Database TEST

- Migrazione `human_project_codes` applicata soltanto al progetto Supabase configurato come TEST.
- Tutti i progetti esistenti convertiti nel nuovo formato; nessun codice malformato o duplicato.
- Il ruolo Guest può eseguire solo la RPC pubblica sanificata e limitata; non può leggere le tabelle
  `projects` o `project_public_lookup_attempts`.
- Verificati sia un codice valido sia un codice non valido, con risposta neutra in caso di errore.
- Nessuna modifica applicata a Supabase LIVE.

## Gate automatici

- Suite completa: **495/495 PASS**.
- `npm run check`: **PASS**.
- Test mirati di geometria, trackpad, documento, accesso pubblico e schema SQL: **PASS**.

## Collaudo manuale consigliato

1. Su Mac, scorrere sulla mappa in verticale e orizzontale con due dita senza premere il trackpad;
   verificare anche pinch zoom.
2. Creare una curva a S con almeno due punti; confrontare il risultato con `Mantieni equidistanza
   filari` attivo e disattivo.
3. Salvare e riaprire il progetto; verificare che la preferenza di equidistanza resti associata al
   singolo campo.
4. Generare il documento: controllare trasparenza sulla mappa satellitare, filigrana, QR e ID progetto.
5. Aprire `Carica progetto` da desktop e dal Profilo mobile, inserire l’ID stampato e verificare la
   consultazione Guest senza comandi di modifica.
6. Ripetere da proprietario/Admin e verificare che il passaggio all’editor compaia solo dopo il
   controllo server-side.
