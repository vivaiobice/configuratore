# Metodo e verifica — 1.3.9

Obiettivo autorizzato: rendere utilizzabile Adatta al terreno conservando tutta la piattaforma raggiunta. Nessun deploy, modifica di servizi o migrazione è parte di questo pacchetto.

## Scelte

1. Conservare il metodo a quota costante e l'interfila misurata a terra. La sola superficie corretta è una stima delle quantità, non una costruzione dei filari. Un metodo geodetico diverso cambierebbe il vincolo di quota.
2. Riutilizzare prove e kernel esclusivamente entro lo stesso budget, proprietario e operandi reali, senza fidarsi dei soli hash salvati. Ogni nuovo budget ricostruisce e contabilizza i dati.
3. Misurare nativamente l'intero filare prima di ridurre soltanto la preview marcata a 1 cm. Rigenerazione e verifica esatta del marker alla lettura.
4. Comprimere senza perdita solo i nuovi baseline quando necessario; preservare i baseline stranieri. Condivisione wire delle righe soltanto quando la concatenazione delle porzioni è esattamente uguale al risultato completo.
5. Eliminare ricalcoli di sola presentazione e notifiche duplicate. Calcoli autorevoli sempre freschi, invalidazione per contenuto reale e proprietario, nessuna cache di errori transitori.

## Sequenza e criteri

Ripristino byte verificato della base; test focalizzati, review indipendenti; collaudo numerico sotto i limiti esistenti; browser desktop poi mobile con click e tap reali; suite completa seriale e confronti manuali 1.2.6; versione/cache coerenti; inventario e ZIP completi verificati. Ogni fase significativa viene salvata come checkpoint non pubblicabile, distinto dalla release finale.

Il browser deve verificare proposta/annullamento/applicazione della porzione inferiore, proposta/applicazione superiore con porzione straniera integra, salvataggio e riapertura, ritorno manuale, doppio annullamento, ordine dei record e 3D/occhio/nomi. Le quantità e i baseline sono confrontati esattamente. Nessun timeout di collaudo viene ampliato per mascherare un rallentamento.
