# Configuratore Vivai Obice — V49

## Correzioni incluse

- Dark Mode desktop uniformata in finestre, barra superiore, Calcolo rapido, libreria Campi/Progetti,
  aree escluse e strumenti mappa; contorno chiaro del logo assottigliato.
- La lente apre un campo di ricerca a scorrimento direttamente sulla mappa, con gli stessi
  suggerimenti e la stessa geocodifica della ricerca laterale.
- Gesture desktop rese indipendenti: due dita spostano la mappa, pinch esegue lo zoom e
  Shift/Alt + scorrimento ruota. Il pan del trackpad resta attivo con la matita.
- Nel menu Campi sono nuovamente disponibili Apri, Rinomina ed Elimina.
- Il Profilo autenticato consente di gestire dati personali e aziendali, preferenza tema,
  reimpostazione password e logout.
- Il disclaimer iniziale specifica che perimetri, geometrie e coordinate geografiche sono
  memorizzati per salvataggio e condivisione del progetto.
- UI mobile, calcoli, formule, PDF e flusso di caricamento progetto restano invariati.

## Pubblicazione

Caricare nella radice del repository mantenendo le cartelle:

- `index.html`
- `v49-fixes.css`
- `src/app.js`
- `src/map.js`
- `src/map-gestures.js`
- `src/desktop-ux.js`
- `src/desktop-library-ui.js`
- `src/profile-ui.js`
- `src/auth-service.js`
- `src/auth-model.js`
- `src/backend.js`

La migrazione `supabase/migrations/202609250001_v49_profile_details.sql` è inclusa per tracciabilità
ed è già stata applicata al progetto Supabase TEST.

## Verifica consigliata

1. Forzare il ricaricamento della cache e verificare il badge **V49**.
2. In Dark Mode aprire Carica progetto, Calcolo rapido, Campi, Progetti, Profilo e Aree escluse.
3. Aprire la lente sulla mappa e provare suggerimento e ricerca senza spostarsi sul pannello sinistro.
4. Provare pan verticale/orizzontale, pinch zoom e Shift + scorrimento durante l’uso della matita.
5. In Campi provare Rinomina ed Elimina.
6. Dopo il login aprire Profilo, salvare i dati e provare reset password e logout.

## Verifica automatica

- `npm test`: 540/540
- `npm run check`: superato
- Colonne profilo e migrazione Supabase TEST: verificate
