# Configuratore Vivai Obice 1.0.1

## Installazione

Caricare il contenuto dello ZIP nella stessa cartella del sito, sostituendo i file precedenti. In GitHub Desktop eseguire commit e push della versione 1.0.1 secondo la procedura abituale. La migrazione `202610020001_admin_manage_field.sql` è già stata applicata al progetto Supabase collegato. Non sono richiesti nuovi secret o una nuova configurazione Resend.

## Modifiche

- Amministrazione: visualizzazione dei campi con nome e mappa; rinomina ed eliminazione autorizzate sul server, con controllo di versione e revisione. La mappa mostra i nomi dei campi.
- Progetti: sintesi immediata di metri lineari e barbatelle, pulsante Stampa/PDF accanto al nome. Campi: Salva modifiche, Duplica, Stampa; la copia mantiene progetto e parametri, apre la modifica manuale del perimetro e richiede una nuova lettura del suolo.
- Mappa editor: nomi sempre visibili e vista generale senza campo selezionato. I riferimenti catastali, inclusa Sezione quando restituita da AdE, restano modificabili.
- Generatore documento: titoli e opzioni dentro le schede, pannello laterale scorrevole e azioni di stampa/condivisione anche sopra l'anteprima.
- PDF: visione aerea dopo il riepilogo; riferimenti catastali e soli valori conosciuti del suolo nella pagina dati di ogni campo. I quattro temi del suolo vengono richiesti nuovamente prima della generazione e l'analisi di laboratorio già presente viene conservata.
- Interfaccia: campi catastali e schede del suolo compatti; pulsanti coerenti; annata e stato restano in Affina il progetto.

## Dati TEST e verifica

Nel database collegato sono stati disattivati i 6 progetti TEST, i 15 campi TEST e i 21 collegamenti ai report TEST. I record storici restano recuperabili. I 2 progetti LIVE, i 6 campi LIVE e i 5 collegamenti attivi LIVE sono stati verificati prima e dopo l'operazione.

Suite finale: 735 test superati su 735; controllo sintattico JavaScript e `git diff --check` superati. Le funzioni del preventivo e della sincronizzazione già corrette non sono state modificate. Non è stato eseguito un test visivo in un browser pubblicato: controllare l'impaginazione su un progetto reale dopo il caricamento del sito.
