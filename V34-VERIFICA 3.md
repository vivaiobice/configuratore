# V34 — verifica sincronizzazione account

Data: 22 settembre 2026  
Ambiente: TEST

## Difetto riprodotto

- Login valido su iPhone e Mac, ma nessun caricamento dei progetti dell'account.
- L'apertura di un progetto locale eliminava i riferimenti cloud e poteva produrre duplicati.

## Correzione verificata

- Download dei soli progetti attivi appartenenti all'utente autenticato.
- Merge per `client_project_id`, con conservazione delle bozze soltanto locali.
- Apertura automatica del progetto cloud più recente solo quando la bozza corrente è vuota.
- Ripristino di project ID, versione e numero revisione quando si apre un progetto archiviato.
- Riallineamento del coordinatore di sincronizzazione quando si cambia o crea un progetto.

## Evidenze

- Ciclo TDD: 9 test RED prima dell'implementazione, poi GREEN.
- Suite completa: 366 test superati, 0 fallimenti.
- `npm run check`: completato senza errori sintattici.
- Database TEST: 3 progetti Admin attivi, 11 campi complessivi; nessuna scrittura eseguita.
- `styles.css` desktop non modificato.
- Supabase LIVE non modificato.

## Collaudo dopo pubblicazione

1. Eliminare/aggiornare il collegamento WebApp o aprire una scheda privata per evitare cache precedenti.
2. Verificare il badge `AMBIENTE TEST · V34`.
3. Accedere come Admin su un dispositivo vuoto.
4. Controllare che Progetti mostri 3 progetti e complessivamente 11 campi.
5. Aprire un progetto, modificare un solo parametro, salvare.
6. Accedere dall'altro dispositivo e verificare l'aggiornamento senza progetto duplicato.
