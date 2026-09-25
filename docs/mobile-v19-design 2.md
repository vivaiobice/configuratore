# V19 — flusso mobile a schermate

Richiesta e autorizzazione: mobile analogo al video OneSoil, apertura diretta sulla mappa; desktop invariato.

Schermate: Mappa (home), Campi (totali e schede), Dettaglio campo, Editor geometrico,
Parametri impianto, Progetti (archivio locale). Menu principale: Mappa / Campi / Progetti.
Salva è un'azione contestuale, non una destinazione.

Nuovo campo: snapshot annullabile → editor → conferma perimetro → parametri → salvataggio
locale del progetto completo → mappa. Conferma sulla mappa e pulsante di chiusura condividono il flusso.
Modifica: scheda → parametri o editor; annullamento ripristina lo snapshot, salvataggio aggiorna l'archivio.
La bozza preesistente resta caricabile. PDF e preventivo mantengono il flusso contatti esistente.

Riutilizzare mappa e controlli esistenti spostandoli con ancore DOM; nessuna duplicazione dei campi input.
I controlli desktop tornano alle posizioni originarie quando cambia la classe di dispositivo.
Archivio locale separato dalla bozza: versionato, snapshot indipendenti, errori di scrittura visibili,
nessuna credenziale cloud né contatto copiato nei progetti locali.

Verifica: transizioni complete su DOM reale, archivi e annullamento, geometria già coperta dai test;
confronto desktop, sintassi e integrità ZIP. Non dichiarare test iOS nativi se non eseguiti.
