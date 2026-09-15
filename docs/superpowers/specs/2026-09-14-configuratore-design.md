# Vivai Obice — Configuratore
## Specifica di progettazione
Data: 14 settembre 2026
Stato: design approvato in chat, pronto per revisione finale prima del piano di implementazione

## 1. Visione
Creare una web app autonoma, professionale e gratuita per la progettazione preliminare di un impianto viticolo, pubblicata tramite GitHub e collegata dal sito Vivai Obice. Wix resta fuori dall'applicazione, salvo il collegamento dal sito aziendale.

Nome di progetto provvisorio: **Configuratore**.
Naming commerciale e sottodominio definitivo verranno scelti in seguito.

Obiettivo principale: offrire un servizio distintivo Vivai Obice che consenta a un utente di individuare un appezzamento, definirne il perimetro, simulare un impianto, ottenere una stima tecnica e commerciale e generare una scheda preliminare in PDF.

## 2. Principi UX
- Accesso immediato senza registrazione.
- La mappa è il centro dell'esperienza, già visibile nella home.
- Nessuna scelta iniziale “Base/Avanzato”. Si usa progressive disclosure.
- Flusso principale: cerca zona → definisci terreno → imposta sesto → simula filari → affina il progetto → salva/PDF/preventivo.
- L'utente vede subito risultati utili e può approfondire senza cambiare applicazione.
- Desktop: mappa ampia con pannello laterale.
- Mobile: mappa prioritaria, pannelli compatti a comparsa dal basso o laterali; nessun comportamento dipendente da hover.

## 3. Home
La home provvisoria usa il nome **Configuratore** e presenta:
- logo Vivai Obice;
- titolo principale “Progetta il tuo vigneto”;
- breve testo esplicativo;
- mappa immediatamente visibile;
- ricerca testuale per comune/località/indirizzo;
- comando discreto “Posizione attuale” per centrare la mappa tramite GPS/geolocalizzazione del dispositivo;
- CTA “Inizia il progetto”.

Non deve esserci una lunga landing page prima dello strumento.

## 4. Motore cartografico
Tecnologia raccomandata e approvata: **MapLibre GL JS**.

Funzioni richieste:
- mappa ruotabile liberamente;
- bussola sempre disponibile;
- comando per tornare rapidamente con Nord in alto;
- base satellitare;
- base stradale;
- zoom e pan fluidi desktop/mobile;
- ricerca testuale geografica;
- tasto GPS/posizione attuale, attivato solo su azione esplicita dell'utente, con richiesta dei permessi del browser/dispositivo;
- indicatore visivo della posizione corrente e ricentratura della mappa;
- la posizione GPS puntuale non viene salvata automaticamente né usata come identificatore analytics; viene persistita solo se confluisce volontariamente nella geometria del progetto;
- disegno e modifica del perimetro;
- visualizzazione delle misure dei lati con etichette discrete;
- superficie in m²;
- perimetro in metri;
- numero vertici;
- barra/scala grafica;
- rotazione della mappa separata concettualmente dall'orientamento dei filari.

## 5. Catasto
Il Catasto va concepito come **layer sovrapponibile**, non come semplice mappa base.

UX prevista:
- Satellite / Stradale = mappe base;
- Catasto = layer ON/OFF;
- l'utente può selezionare una o più particelle;
- più particelle possono essere unite come area di progetto;
- una particella selezionata può essere usata come perimetro iniziale;
- il perimetro derivato dal Catasto può essere modificato manualmente;
- resta sempre disponibile il disegno completamente manuale.

Integrazione tecnica da isolare dietro un modulo/adattatore dedicato, così eventuali modifiche agli endpoint o ai servizi catastali non richiedono la riscrittura del configuratore.

La ricerca specifica per Comune/Foglio/Particella è prevista come estensione del modulo catastale; la V1 deve almeno supportare la sovrapposizione e, dove tecnicamente possibile, selezione vettoriale delle particelle.

## 6. Definizione del terreno
Metodi:
1. ricerca geografica + disegno manuale;
2. selezione da Catasto + modifica manuale;
3. combinazione di più particelle catastali.

Aree interne da escludere (fabbricati, strade, fossi, porzioni non impiantabili) **non entrano nella prima V1**. L'architettura geometrica deve però consentirne l'introduzione futura senza riscrivere il modello del progetto.

## 7. Sesto d'impianto
Campi fondamentali:
- distanza tra le piante, in metri;
- distanza tra i filari, in metri.

Calcolo base storico da mantenere come riferimento:
`piante_teoriche = superficie_netta / (distanza_piante × distanza_filari)`

Per la parte commerciale:
- mantenere separato il valore teorico/reale;
- calcolare anche la quantità commerciale arrotondata sempre per eccesso al multiplo di 25.

Quando la simulazione geometrica dei filari è disponibile, il conteggio basato sui filari reali prevale come stima progettuale; la formula per superficie resta disponibile come controllo e fallback.

## 8. Orientamento e simulazione filari
Dopo la definizione del terreno e del sesto:
- il sistema propone automaticamente un orientamento iniziale geometricamente efficiente;
- l'utente può ruotare manualmente i filari;
- scorciatoie per orientamenti cardinali/intercardinali: N, NE, E, SE, S, SO, O, NO;
- aggiornamento in tempo reale di:
  - numero di filari;
  - metri lineari di filare;
  - numero stimato di piante;
  - eventuali pali e altri elementi dipendenti dalla geometria.

L'orientamento dei filari non deve essere confuso con la rotazione visuale della mappa.

## 9. Affina il progetto
Le opzioni tecniche avanzate non sono semplici tag: devono modificare realmente suggerimenti, calcoli o controlli del progetto.

Funzioni previste:
- sezione discreta “Inquadramento del progetto”, facoltativa, per indicare se l'impianto è collegato a una domanda, bando, contributo/finanziamento o altro contesto amministrativo;
- eventuale riferimento o nota libera, facoltativa, senza interrompere il flusso principale;
- capezzagne;
- larghezza capezzagna;
- pali di testa;
- pali intrafilare;
- distanza pali;
- eventuali fasce/strade perimetrali quando verranno attivate;
- meccanizzazione;
- vendemmia meccanica;
- suggerimenti e avvisi di coerenza progettuale.

La selezione “Vendemmia meccanica” può influenzare i suggerimenti su capezzagne e compatibilità del layout, ma l'utente conserva sempre il controllo manuale.

## 10. Calcolo pali
Il modello deve distinguere:
- pali di testa;
- pali intrafilare;
- totale pali.

Il calcolo deve lavorare sui filari effettivamente generati e sulla distanza impostata tra i pali. Va prevista la possibilità di tenere conto di strade/capezzagne quando saranno parte del motore geometrico completo.

## 11. Materiale vegetale
Sezione “Scelta del materiale vegetale”, non obbligatoria per iniziare il progetto.

Campi:
- vitigno, con opzione “Da definire”;
- portainnesto, con opzione “Consigliami”;
- clone/selezione, facoltativo;
- quantità, ereditata dal progetto.

Obiettivo: trasformare il progetto geometrico in una scheda preliminare utile anche commercialmente per Vivai Obice.

## 12. Salvataggio e ripresa
- autosalvataggio continuo;
- ogni sessione anonima riceve identificatori casuali;
- il progetto può esistere come bozza anonima;
- quando l'utente lascia i dati obbligatori la bozza diventa progetto associato a un contatto;
- possibilità di riaprire il progetto successivamente tramite link personale sicuro;
- nessun dato personale nell'URL;
- token/link non facilmente indovinabile.

## 13. Contatti obbligatori
Quando l'utente vuole:
- salvare definitivamente;
- generare/scaricare il PDF;
- richiedere un preventivo;

sono obbligatori:
- azienda;
- nome;
- cognome;
- numero di telefono;
- e-mail.

I dati vengono richiesti una sola volta per la sessione/progetto identificato.

Il consenso privacy necessario all'erogazione del servizio resta distinto da eventuale consenso marketing/newsletter, che deve essere facoltativo e non preselezionato.

## 14. Analytics e tracciamento
Obiettivo: conoscere realmente l'utilizzo dello strumento anche quando l'utente non lascia i propri dati.

Da salvare:
- tutte le sessioni;
- eventi principali del funnel;
- progetti anonimi e stato di avanzamento;
- visitatori unici/ricorrenti quando consentito;
- conversione anonimo → contatto identificato quando tecnicamente e legalmente consentita.

Eventi minimi:
- apertura configuratore;
- ricerca località;
- uso del comando GPS/posizione attuale (senza registrare le coordinate nell'evento analytics);
- cambio base map;
- Catasto attivato;
- particella selezionata;
- perimetro completato;
- sesto inserito/modificato;
- orientamento modificato;
- funzioni avanzate aperte/usate;
- materiale vegetale impostato;
- salvataggio;
- contatto completato;
- PDF generato;
- richiesta preventivo.

Privacy-by-design:
- `session_id` sempre casuale;
- `visitor_id` persistente solo quando consentito;
- IP non usato come identificatore commerciale primario;
- eventuali log IP solo lato server per sicurezza/abusi/diagnostica con conservazione limitata;
- consenso analytics separato da ciò che è strettamente necessario;
- rifiutare analytics non blocca l'uso del configuratore.

UI consenso essenziale:
- pannello piccolo e non invasivo;
- “Accetta analisi” / “Solo necessari”;
- link a Privacy e preferenze.

## 15. Ambienti TEST e LIVE
L'applicazione nasce con due modalità logiche:
- TEST;
- LIVE.

Durante lo sviluppo:
- tutti i progetti e gli eventi sono marcati `environment = TEST`;
- la dashboard admin filtra chiaramente i dati di test;
- i test non contaminano KPI e lead reali.

Al lancio:
- nuovi dati marcati LIVE;
- i test storici restano filtrabili o eliminabili.

## 16. Area amministrativa / CRM leggero
Inclusa fin dalla V1 ma non esposta pubblicamente.

Route prevista: `/admin`.

Caratteristiche:
- nessun link pubblico all'area admin;
- login obbligatorio;
- mappa con progetti;
- elenco filtrabile;
- scheda completa del progetto;
- contatto associato;
- azienda;
- località;
- superficie;
- numero piante;
- vitigno/portainnesto;
- PDF generato;
- richiesta preventivo;
- note interne;
- eventi/sessioni correlate quando consentito;
- distinzione TEST/LIVE.

Stati progetto minimi:
- Bozza;
- Salvato;
- PDF scaricato;
- Preventivo richiesto;
- Contattato;
- Cliente.

Filtri previsti:
- zona;
- superficie;
- quantità piante;
- vitigno;
- portainnesto;
- stato;
- azienda;
- inquadramento progetto (domanda/bando/contributo/altro);
- data;
- TEST/LIVE.

## 17. PDF
Output: **Proposta preliminare d'impianto – Vivai Obice**.

Contenuti:
- logo/brand;
- codice progetto;
- data;
- dati cliente, inclusa azienda;
- eventuale inquadramento del progetto (domanda/bando/contributo/altro) se compilato;
- mappa con base selezionata;
- perimetro;
- eventuale Catasto visibile come layer informativo se appropriato;
- filari simulati;
- dati geometrici: superficie, perimetro, vertici;
- capezzagne e superficie netta quando configurate;
- orientamento filari;
- distanza filari;
- distanza piante;
- piante stimate;
- quantità commerciale arrotondata a 25;
- distanza pali;
- pali stimati;
- vitigno;
- portainnesto;
- clone/selezione se presente;
- opzioni di meccanizzazione;
- QR/link per riaprire il progetto;
- CTA “Richiedi preventivo a Vivai Obice”.

Disclaimer obbligatorio: strumento indicativo/preliminare, non sostitutivo di elaborati catastali o progettazioni tecniche professionali quando richieste.

Preferenza: PDF compatto e professionale, idealmente una pagina quando i dati lo consentono.

## 18. Architettura tecnica
### Front-end
- GitHub repository;
- pubblicazione tramite GitHub Pages o hosting statico equivalente, mantenendo GitHub come repository centrale;
- HTML/CSS/JavaScript modulare;
- MapLibre GL JS;
- design responsive mobile-first;
- nessuna dipendenza da Wix.

### Backend
- Supabase;
- PostgreSQL;
- PostGIS per geometrie e query geografiche;
- Supabase Auth per area admin;
- Row Level Security;
- funzioni server/edge per operazioni sensibili;
- storage per PDF/asset se necessario.

### Dominio
La web app dovrà essere pubblicabile su un sottodominio di `vivaiobice.com`.
Il nome definitivo del sottodominio sarà deciso più avanti; `configuratore.vivaiobice.com` è solo un esempio tecnico.

## 19. Modello dati preliminare
Tabelle/logiche principali:

### contacts
- id
- company_name
- first_name
- last_name
- phone
- email
- created_at
- privacy_version
- marketing_consent

### visitors
- id
- anonymous_visitor_key
- analytics_consent
- first_seen_at
- last_seen_at

### sessions
- id
- visitor_id nullable
- environment
- started_at
- ended_at
- device_class
- referrer
- consent_state

### projects
- id
- public_token
- contact_id nullable
- visitor_id nullable
- environment
- status
- geometry
- source_type manual/cadastral/mixed
- cadastral_refs metadata
- gross_area_m2
- net_area_m2
- perimeter_m
- vertex_count
- row_spacing_m
- plant_spacing_m
- row_orientation_deg
- headland_width_m nullable
- theoretical_plants
- simulated_plants
- commercial_plants_25
- row_count
- row_linear_m
- post_spacing_m nullable
- head_posts nullable
- intermediate_posts nullable
- total_posts nullable
- mechanization flags
- project_context_type nullable (application/tender/contribution/other)
- project_context_note nullable
- grape_variety
- rootstock
- clone_selection
- created_at
- updated_at

### project_events
- id
- project_id nullable
- session_id
- visitor_id nullable
- environment
- event_type
- event_payload jsonb
- created_at

### admin_notes
- id
- project_id
- author_id
- body
- created_at

## 20. Sicurezza
- nessuna service-role key nel front-end;
- RLS obbligatoria sulle tabelle;
- operazioni admin protette da autenticazione;
- token progetto pubblici non sequenziali e ad alta entropia;
- endpoint per PDF e collegamento contatto validati lato server;
- sanitizzazione input;
- rate limiting sulle azioni sensibili se necessario;
- nessuna esposizione di IP o dati tecnici non necessari nella dashboard commerciale.

## 21. Gestione errori
- errore rete: preservare la bozza locale e riprovare il sync;
- servizio Catasto indisponibile: consentire sempre il disegno manuale;
- geocoding non disponibile: mappa navigabile manualmente;
- GPS non disponibile o permesso negato: nessun blocco del flusso, messaggio breve e possibilità di continuare con ricerca/navigazione manuale;
- PDF fallito: progetto resta salvato e il PDF può essere rigenerato;
- Supabase temporaneamente indisponibile: non perdere il progetto corrente nel browser;
- geometria non valida: impedire i calcoli dipendenti e guidare l'utente alla correzione.

## 22. Test e criteri di successo
### Geometria
- poligoni semplici, concavi e con forme strette;
- rotazione mappa indipendente dai filari;
- accuratezza area/perimetro;
- generazione filari e clipping nel poligono;
- ricalcolo immediato al cambio sesto/orientamento;
- arrotondamento commerciale a multipli di 25.

### UX
- iPhone/Safari;
- Android/Chrome;
- tasto GPS con consenso concesso, negato e servizio non disponibile;
- desktop Chrome/Safari/Firefox;
- disegno terreno senza istruzioni esterne;
- completamento del flusso principale con poche interruzioni;
- nessuna perdita di progetto chiudendo/riaprendo la pagina.

### Backend
- sessioni TEST registrate;
- anonimizzazione coerente;
- conversione contatto-progetto;
- permessi admin;
- RLS;
- filtri dashboard;
- PDF rigenerabile;
- link progetto sicuro.

## 23. Fuori scope per la prima V1
- aree interne complesse da sottrarre (buchi/ostacoli);
- gestione completa di strade interne e poligoni multipli impiantabili;
- CRM commerciale avanzato con pipeline completa e automazioni;
- pagamenti;
- registrazione obbligatoria cliente;
- applicazione mobile nativa;
- sostituzione di consulenze tecniche/agronomiche professionali.

## 24. Sequenza di rilascio consigliata
1. shell dell'app e design system;
2. mappa + ricerca + basi + rotazione;
3. GPS/posizione attuale + disegno/modifica perimetro + misure;
4. sesto + orientamento + simulazione filari + conteggi;
5. progressive disclosure delle opzioni tecniche;
6. autosalvataggio locale + Supabase;
7. contatti + privacy/consensi;
8. analytics/eventi TEST;
9. PDF;
10. Catasto, prima come layer e poi selezione vettoriale dove affidabile;
11. area admin;
12. hardening, mobile, accessibilità e passaggio LIVE.

## 25. Criterio di prodotto
La V1 è considerata riuscita quando un potenziale cliente può, da smartphone o desktop:
1. trovare il proprio terreno;
2. definirlo manualmente o a partire dal Catasto;
3. impostare il sesto;
4. vedere i filari simulati;
5. regolare l'orientamento;
6. ottenere quantità e dati essenziali;
7. affinare il progetto;
8. lasciare azienda e propri contatti;
9. salvare e riprendere il progetto;
10. generare un PDF professionale;
11. richiedere un preventivo;

mentre Vivai Obice può vedere utilizzo, progetti, lead e stato dei progetti da una dashboard riservata.
