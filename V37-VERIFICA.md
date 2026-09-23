# V37 — checklist di verifica

Ambiente previsto: **TEST**. Nessuna migrazione e nessuna modifica a Supabase LIVE.

## Gestione progetti

1. Salvare un progetto dalla schermata principale dopo aver compilato **Nome progetto**.
2. Aprire **Progetti** e verificare i comandi **Apri**, **Rinomina** ed **Elimina**.
3. Rinominare un progetto e aggiornare l’archivio su un secondo dispositivo: il nuovo nome deve
   restare invariato e il progetto non deve duplicarsi.
4. Eliminare un progetto sincronizzato, confermare e aggiornare l’altro dispositivo: il progetto
   non deve ricomparire.
5. Ripetere rinomina ed eliminazione nella sezione Progetti mobile.

## Mappa desktop

1. Controllare i gruppi separati: visualizzazione in alto, editor a sinistra, esclusioni e
   posizionamento a destra, rotazione in basso a destra.
2. Attivare **Catasto**: deve comparire il sottomenù **Trova particella**. Selezionare una particella
   e verificare che il sottomenù si chiuda.
3. Premere **Aggiungi campo**: deve avviarsi il disegno senza alterare i campi già salvati.
4. Dopo almeno tre punti il pulsante deve diventare **Chiudi perimetro** e confermare il poligono.
5. Avviare Escludi zona o Passaggio 1,50 m: il CTA Aggiungi campo deve restare disabilitato.
6. Verificare GPS, Vai al campo, modifica punti, − Punto, eliminazione campo e rotazione.

## Gate automatico eseguito

- `npm test`: **388/388**.
- `npm run check`: superato.
- `styles.css`, formule, geometrie, schema database e Supabase LIVE: non modificati.
