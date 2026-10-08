# Filari di livello, passaggi suggeriti e 3D — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generare filari a quota costante con interfila a terra ±20 cm, suggerire soltanto tagli verificati, consentire il ripristino del disegno applicato e rendere il 3D accessibile dalla mappa.

**Architecture:** Un nuovo motore lavora direttamente sulle facce native del DTM, con estrazione delle isolinee e certificazione continua delle distanze; non trasla una sola guida. Proposte, tagli e ripristini usano lo stesso checkpoint atomico. Il ramo manuale 1.2.6 e il replay dei risultati 1.3.0 rimangono separati dal nuovo algoritmo.

**Tech Stack:** JavaScript ES modules/JSDoc, MapLibre GL JS 4.7.1, Web Workers, polygon-clipping locale, DTM float32 congelato, node:test/linkedom, Chromium/Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-contour-rows-and-cut-suggestions-design.md`, approvata da Marco il 5 ottobre 2026. Base prodotto: `5011c7e03d7a59201f7c50ae5e34171f4e7f2a15`; specifica: `935e7f5`.

## Global Constraints

- Quota di ogni filare automatico: scostamento numerico massimo **0,001 m** sul modello, lungo tutti i segmenti; nessuna lisciatura nascosta del DTM.
- Interfila sul terreno: **s−0,20 m ≤ distanza ≤ s+0,20 m**, in entrambi i versi su tutta la fascia affiancata. Confini/capezzagne/esclusioni reali possono interrompere la verifica; un asse omesso o una verifica irrisolta non possono farlo.
- Un solo taglio per suggerimento: larghezza iniziale **1,50 m**, fino a **5 m**, al massimo **tre candidati completi**; nuova larghezza misurata a terra. I passaggi precedenti mantengono la geometria salvata.
- Tempi condivisi: **30 s** adattamento, **60 s complessivi** ricerca del taglio; worker cancellabile, progressi per fase, nessuna applicazione tardiva dopo cambio contesto.
- Tetti invariati: **262.144 celle native**, **500.000 nodi**, **1 MiB per campo canonico**, **4 MiB per snapshot effettivo**, ripristini inclusi. Una sola griglia per campo.
- Nuovo algoritmo `terrain-contour-family-1`, envelope `schemaVersion:2`; leggere il formato precedente senza modificarne gli hash o aggiungere default a `rowPortions`.
- Nuovo disegno solo su proposta esplicita. Acquisizione e camera non cambiano quantità; Applica salva prima di assegnare lo stato vivo. Conservare le altre porzioni.
- Manuale/automatico nella curvatura; 3D nella mappa comune; Comfortaa e palette attuali. PDF con il font precedente, quote e nomi esterni già raggiunti. Conteggi e profilo conservati.
- Nessun cambiamento del ramo manuale senza terreno 1.2.6; tutti i **144 confronti completi** devono passare. Nessuna pubblicazione, migrazione SQL o modifica degli account reali durante il lavoro.

## Review Focus

1. Isolinea coincidente con un bordo/vertice del DTM: identità deterministica, nessun frammento/testa artificiale o ciclo nella misura; test Task 3.
2. Fila assente dentro una fascia coltivabile o esclusione quasi tangente: non inventare un'esenzione del limite superiore; test Task 3.
3. Envelope 1.3.0 con algoritmo sconosciuto e porzioni raw: replay esatto e nessuna migrazione implicita; test Task 1.
4. Ripristino dopo cambi globali oppure modifica di un figlio di un taglio: proposta o conflitto esplicito, senza eliminare altre modifiche; test Task 6.
5. Uscita dal 3D durante tile pendenti, cambio account o modifica coordinate: camera/handler restituiti, nessuna risposta vecchia applicata; test Task 8.

---

## Contratti e ordine del lavoro

Eseguire Tasks 1→2→3→4→5→6→7→8→9. Il profilo iniziale del vecchio motore in Task 2 precede le ottimizzazioni. La revisione numerica di Task 3 è una condizione per usare i certificati nei Tasks 4/5. Task 8 può essere sviluppato separatamente dopo che l'interfaccia controller di Task 7 è fissata; evitare modifiche concorrenti a `app.js`/`map.js`. Ogni task termina con test mirati, revisione e commit dei soli file di proprietà.

Tipi JSDoc condivisi in `src/terrain-contour-contracts.js` (Task 1):

| Tipo | Contenuto e convenzione |
|---|---|
| `GeoPoint`, `XY`, `XYZ`, `Polygon`, `MultiPolygon` | `[lon,lat]` WGS84; metri nella CRS del modello per XY/XYZ; Polygon/MultiPolygon GeoJSON WGS84 con anelli, inclusi i fori. Convertire solo ai confini dei moduli. |
| `FrozenModel`, `Project`, `Portion` | Formati esistenti di `terrain-model.js`, `fields.js` e `resolveRowPortions`; non nuovi default persistiti. |
| `TerrainBudget` | `{check(nodeDelta=0):void, phase(name):void, remainingMs():number, timings():Object}`; clock e callback progressi iniettati. Superamento lancia errore con `status:'budget-exceeded'`. |
| `ContourDomain` | `{modelHash,crs,faces,boundaries,spatialIndex,elevationIndex,geometry}`; facce con XYZ, piano affine, adiacenze e porzione clippata. Nessuna copia del DTM nell'envelope. |
| `ContourAxis` | `{axisId,portionId,levelM,ordinal,components:[{faceIds,coordinatesXY}]}`; componente continua della stessa quota; frammenti fisici derivati dopo clipping/capezzagne. |
| `SpacingCertificate` | `{valid,lowerM,upperM,errorBoundM,spans,exceptions,critical,unresolved}`; ogni span identifica asse/verso/intervallo iniziale e itinerario di facce; eccezione indica il confine reale incontrato. |
| `SurfaceBand` | `{valid,geometry:MultiPolygon,areaM2,validation}`; fascia sulla superficie delimitata a distanza normale dal suo asse, con larghezza verificata. Non appiattire i fori durante clipping/serializzazione. |
| `FamilyResult` | `{ok,axes,rows,validation,coverage,metrics,diagnostics}`; fallimento non espone quantità applicabili. `coverage` contiene servedAreaM2, referenceAreaM2 e percent. |
| `TerrainProposal` | Forma attuale `{ok,status,message,terrain?,rowPortions?,result?,changes?,projectPatch?}` più `{kind:'adapt'|'measure'|'cut'|'restore',diagnostics?,timings?}`. `result` usa i campi del calcolatore più rowAxisCount/rowFragmentCount/coverage, con base delle quantità esplicita; `diagnostics.completeCandidates` conta i candidati di taglio completi. |
| `CutProposal` | `TerrainProposal` di kind cut con `{cut:{groupId,sourceAxis,widthM,widthBasis:'model-surface',scopePortionId,scopeGeometry,geometry,modelHash},comparison}`; scopeGeometry conserva il Polygon/MultiPolygon originario prima del taglio. Tutte le parti in `projectPatch.exclusions`, non mutazioni live. |
| `RestoreEntry` | `{schemaVersion:1,operationId,kind,affectedIds,before,afterFingerprint,contextFingerprint,baselineHash}`; `before` contiene solo topologia/assi/parametri/base delle quantità necessari, senza griglia né storia ricorsiva. Il ripristino consuma la voce; nessuna funzione redo in questa revisione. |

Envelope nuovo: `terrain={model,applied,history?}`; `applied={schemaVersion:2,algorithmVersion,inputHash,inputs,result,portionResults,validation,resultHash,snapshotHash}`. `history={schemaVersion:1,entries:[RestoreEntry]}` è esterno agli input geometrici; è verificato separatamente ed entra nel limite di serializzazione. Una voce per porzione; un taglio usa una voce condivisa per il gruppo. Il fingerprint geometrico esclude soltanto storia/metadata non geometrici definiti dal contratto, non input che alterano il disegno.

### Task 1: Compatibilità degli envelope e contratti del nuovo motore

**Files:** Create `src/terrain-contour-contracts.js`, `src/terrain-budget.js`, `src/terrain-replay.js`, `tests/terrain-v130-replay.test.mjs`, `tests/terrain-budget.test.mjs`, `tests/fixtures/terrain-v130-applied.json`. Modify `src/terrain-design.js` solo al confine replay/hash; Test anche `tests/terrain-replay.test.mjs` e `tests/v126-legacy-compatibility.test.mjs`.

**Interfaces:** Consume i formati/hash attuali. Produce `createTerrainBudget({kind,deadlineMs?,clock=performance.now,onProgress=()=>{}}):TerrainBudget`, `terrainGeometryInputHash(project,model):string`, `createContourEnvelope({project,model,result,portionResults,validation}):AppliedEnvelopeV2`, `readTerrainEnvelope(project):Result|null`, `hashTerrainEnvelope(applied):string`. Result è il risultato completo del calcolatore; AppliedEnvelopeV2 è applied definito nei contratti. Il facade `readAppliedTerrainResult` delega al reader senza cambiare firma. Budget kind adapt/measure/restore=30.000 ms, cut=60.000 ms; un override può ridurre, non estendere, il tetto.

- [ ] **RED:** Prima di modificare il solver, congelare due risultati veri della base 1.3.0 (automatico e misto con due porzioni) con input, envelope, risultato completo e hash nel JSON; non generarli nel test col solver corrente. Aggiungere test `historical opaque algorithm and raw portions replay unchanged`, `v2 envelope detects tampering`, `shared budgets use exact caps`:
  ```js
  assert.deepEqual(readTerrainEnvelope(old.project), old.result);
  const opaque = structuredClone(old.project);
  opaque.terrain.applied.algorithmVersion = 'unknown-future';
  assert.deepEqual(readTerrainEnvelope(opaque), old.result);
  assert.deepEqual(old.project.rowPortions, beforeRaw);
  assert.equal(readTerrainEnvelope(tampered).terrainStatus, 'invalid');
  assert.equal(adapt.remainingMs(), 30000);
  assert.equal(cut.remainingMs(), 60000);
  assert.throws(() => expired.check(), {status:'budget-exceeded'});
  ```
- [ ] **Run RED:** `node --test tests/terrain-v130-replay.test.mjs tests/terrain-budget.test.mjs`; atteso FAIL per nuove API mancanti.
- [ ] **Implement:** Formalizzare contratti e budget. Reader senza schemaVersion usa **esattamente** il vecchio input/snapshot/result hash, inclusa la compatibilità con nomi di algoritmo opachi; schema 2 usa la proiezione geometrica esplicita e include schema/algoritmo nel snapshot hash. Nessuna mutazione/default durante la lettura; schema futuro non supportato produce stato non applicabile, senza fallback planare.
- [ ] **GREEN:** Eseguire comando RED più `node --test tests/terrain-replay.test.mjs tests/terrain-design.test.mjs tests/v126-legacy-compatibility.test.mjs`; atteso zero failure e 144 casi baseline conservati.
- [ ] **Commit:** `git commit --only` dei file del task, messaggio `feat: add versioned terrain replay and shared budgets`.

### Task 2: Dominio indicizzato e misure limitate al campo

**Files:** Create `src/terrain-contour-domain.js`, `tests/terrain-contour-domain.test.mjs`, `tests/helpers/terrain-contour-fixtures.mjs`, `scripts/terrain-phase-profile.mjs`. Modify `src/terrain-model.js` aggiungendo l'API scoped, senza cambiare `terrainSummary(model)`; `src/terrain-design.js` solo per callback diagnostica di fase opt-in. Test `tests/terrain-model.test.mjs` e `tests/terrain-design.test.mjs`.

**Interfaces:** Consume budget/contratti e `getTerrainMesh(model)`. Produce `createContourDomain({model,geometry,budget}):ContourDomain`, `terrainScopedSummary(model,geometry):{valid,minM,maxM,rangeM,maxSlopePercent}`, helper test `contourFixture({height,geometryXY?,exclusionsXY?,spacingM=3,angle=0,headlandM=0}) -> {project,model}`. Geometry è la regione reale campo/porzione con fori. Helper riusa la CRS/codec esistenti; valori grid nativi, non upsampling.

- [ ] **RED:** Test `outside steep support cannot change field summary`, `clipped boundary heights contribute extrema`, `holes and L topology retain correct area`, `index and model budgets are enforced`:
  ```js
  assert.ok(Math.abs(summary.rangeM - expectedClippedRange) < 0.001);
  assert.equal(summary.maxSlopePercent, 0); // campo piatto, supporto esterno ripido
  assert.equal(domain.modelHash, model.contentHash);
  assert.throws(() => overBudgetDomain(), {status:'budget-exceeded'});
  ```
- [ ] **Run RED:** `node --test tests/terrain-contour-domain.test.mjs`; atteso FAIL per API scoped/dominio mancanti.
- [ ] **Implement:** Clippare le facce native contro regione/fori; indici XY, intervalli di quota e adiacenze stabili; piani affini in coordinate relative per limitare cancellazione numerica. Estremi su vertici clippati, pendenza delle facce effettivamente interne. Cache bounded per hash modello/geometria. Profilare il motore originale prima delle modifiche con i TIFF reali già in `tests/fixtures/terrain` e fixture L: tempi per chart/guida/clipping/distanze/capezzagne/envelope, dimensioni e risultato. Aggiungere callback opt-in `onPhase({name,elapsedMs})` a buildTerrainProposal, senza includerla in input/output/hash; confrontare output con e senza callback. Non attribuire a priori il timeout.
- [ ] **GREEN:** `node --test tests/terrain-contour-domain.test.mjs tests/terrain-model.test.mjs`; `node scripts/terrain-phase-profile.mjs --engine legacy --output /tmp/terrain-revision-profile-legacy.json`. Atteso test pass e JSON con fasi/dimensioni/stati, anche quando un caso scade.
- [ ] **Commit:** File del task; messaggio `feat: index native terrain and scope field summaries`.

### Task 3: Isolinee e certificazione continua delle distanze

**Files:** Create `src/terrain-contours.js`, `src/terrain-surface-flow.js`, `src/terrain-contour-validation.js`, `tests/terrain-contours.test.mjs`, `tests/terrain-contour-validation.test.mjs`, `tests/terrain-surface-flow.test.mjs`.

**Interfaces:** Consume domain/budget. Produce `traceContourLevel(domain,levelM,{portionId,budget}):{axes,diagnostics}`, `certifyContourElevation(domain,axes,{budget}):{valid,maxDeviationM,critical}`, `certifyContourSpacing(domain,axes,{spacingM,toleranceM=0.20,budget}):SpacingCertificate`, `traceSurfaceBand({domain,axisXY,widthM,budget}):SurfaceBand`. Un livello degenerato è una diagnosi, non una curva lisciata. Certificatore accetta anche assi deliberatamente difettosi dai test.

- [ ] **RED:** Test `20 percent plane produces straight level rows`, `same-height endpoints over hump fail elevation`, `inclusive bidirectional 2.80 to 3.20 certificate`, `omitted interior row fails upper bound`, `real boundary exception only`, `nearly tangent hole cannot waive an interior gap`, `close endpoints cannot evade approach check`, `vertex and edge contour has no fake fragments`, `ambiguous normal itinerary is unresolved`:
  ```js
  assert.ok(altitude.maxDeviationM <= 0.001);
  assert.equal(humpCertificate.valid, false);
  assert.ok(spacing.lowerM >= 2.80 && spacing.upperM <= 3.20);
  assert.equal(missingInterior.valid, false);
  assert.ok(validSpacing.spans.some(s => s.direction === 'reverse'));
  assert.equal(ambiguous.valid, false);
  assert.ok(ambiguous.unresolved.length > 0);
  ```
- [ ] **Run RED:** `node --test tests/terrain-contours.test.mjs tests/terrain-contour-validation.test.mjs tests/terrain-surface-flow.test.mjs`; atteso FAIL per API mancanti.
- [ ] **Implement:** Intersezioni livello/faccia con regole deterministiche per quota su vertice/bordo, collegamento per identità di edge e clipping continuo. Verificare anche tutti i punti di attraversamento delle facce dei segmenti: non bastano gli estremi. La distanza normale usa il gradiente superficiale costante della faccia; suddividere l'intervallo iniziale a ogni cambio di itinerario, primo confine, livello vicino o evento bordo/vertice. Dentro un itinerario propagare coordinate e lunghezza affine con intervalli IEEE arrotondati verso l'esterno; partizionare ai cambi di ordine degli eventi. Coprire l'intero seed, nei due versi. Su porzione interamente piatta, verificata come tale, usare ordine della famiglia manuale e normale geometrica agli assi conservati; non una normale al gradiente nullo. Negli altri casi crease ambigua, ciclo, gradiente nullo non risolto o partizione scoperta → `unresolved`, mai valido.
- [ ] **Implement approach/bands:** Controllare incroci e avvicinamenti anche fra estremità con indice di segmenti; limite inferiore conservativo dalla distanza XYZ e raffinamento sul modello quando insufficiente. Un limite troppo largo produce irrisolto, non falsa certificazione. Riutilizzare il traversal per fasce: normale all'asse nella metrica della faccia, larghezza a terra, clipping dei poligoni per faccia e unione. La fascia di una curva di livello può andare a una quota diversa, ma il suo asse resta a quota costante.
- [ ] **GREEN + review numerica:** Comando RED e test domain. Atteso pass; annotare prova dei bound/partizioni e casi rifiutati. Un revisore deve verificare la copertura continua, non solo screenshot plausibili. Nessun uso in Task 4 prima di questa verifica.
- [ ] **Commit:** File del task; messaggio `feat: certify native contour elevation and transverse spacing`.

### Task 4: Ricerca delle famiglie e proposta completa

**Files:** Create `src/terrain-contour-family.js`, `src/terrain-contour-design.js`, `tests/terrain-contour-family.test.mjs`, `tests/terrain-contour-design.test.mjs`. Modify facade `src/terrain-design.js` per dispatch esplicito.

**Interfaces:** Consume Tasks 1–3 e funzioni metriche esistenti. Produce `buildContourFamily({domain,portion,reference,spacingM,toleranceM=0.20,budget,referenceAreaM2}):FamilyResult`, `buildContourTerrainProposal({project,model,portionId=null,mode='adapt',recomputeAll=false,budget}):TerrainProposal`. Reference è `{orientationDeg,rowCurvePoints,maintainRowEquidistance,rows?}`, derivata dai parametri manuali e dall'eventuale disegno salvato. Facade estende options con `algorithmVersion`; valore `terrain-contour-family-1` entra nel nuovo motore, assente resta route legacy per vecchi callers/test. UI nuova lo passa esplicitamente. `mode:'measure'` conserva gli assi manuali e usa la metrica terreno senza promessa di quota costante.

- [ ] **RED:** Test `uniform plane stays straight with 3 m ground pitch`, `flat field preserves manual phase`, `variable field certifies each level`, `candidate ranking maximizes absolute served area`, `axes and physical fragments differ`, `first conversion measures whole field but adapts selected portion only`, `local adapt leaves other applied portion exact`, `manual mode removes retained automatic guide`:
  ```js
  assert.ok(Math.abs(planPitchM - 3 / Math.sqrt(1.04)) < 0.001);
  assert.deepEqual(flat.rows.map(r => [r.start,r.end]), manualEndpoints);
  assert.ok(proposal.terrain.applied.validation.maxElevationDeviationM <= 0.001);
  assert.deepEqual(afterOther, beforeOther);
  assert.equal(result.headPosts, result.rows.length * 2);
  assert.ok(!manual.design.guideCoordinates);
  assert.equal(proposal.terrain.applied.algorithmVersion, 'terrain-contour-family-1');
  ```
- [ ] **Run RED:** `node --test tests/terrain-contour-family.test.mjs tests/terrain-contour-design.test.mjs`; atteso FAIL per nuovo motore mancante.
- [ ] **Implement family:** Ricerca deterministica di più quote iniziali e progressioni ammissibili; potare usando bound di quota/distanza. Ordinare validità → area assoluta servita → lunghezza coltivabile/piante → scostamento dal nominale/complessità. Non scegliere solo l'ancora centrale. Fasce da `traceSurfaceBand`, ciascuna metà larghezza nominale; unione clippata e area di superficie reale, denominatore referenceAreaM2 fisso. Caso piano analitico; caso piatto conserva famiglia manuale compatibile, senza inventare orientamento. Anelli/rami non lavorabili restano diagnosi localizzate.
- [ ] **Implement proposal:** Misurare/trim lungo gli assi originali; capezzagne solo perimetro originale, due teste per frammento reale, nessuna testa ai nodi mesh. Esporre area orizzontale/superficie, rowAxisCount/rowFragmentCount, lunghezze/base quantità e stima teorica separata dalle quantità effettive. Assemblare envelope V2; prima conversione atomica campo intero, successive modifiche locali preservano risultati e guide estranee. Manuale elimina la provenienza automatica nella copia proposta. Fallimento/timeout non restituisce un result applicabile.
- [ ] **GREEN:** Comando RED più `node --test tests/terrain-design.test.mjs tests/terrain-replay.test.mjs tests/terrain-v130-replay.test.mjs tests/v126-legacy-compatibility.test.mjs`; atteso zero failure, route legacy invariata.
- [ ] **Commit:** File del task; messaggio `feat: build independent contour families with ground metrics`.

### Task 5: Passaggio sul terreno e suggerimento verificato

**Files:** Create `src/terrain-passage.js`, `src/terrain-cut-suggestions.js`, `tests/terrain-passage.test.mjs`, `tests/terrain-cut-suggestions.test.mjs`. Modify `src/passage-coordinates.js`, endpoint integration in `src/map.js` e relativo getter in `src/app.js`, `src/row-portions.js` solo dove serve metadata opt-in. Test `tests/passage-coordinates.test.mjs` e `tests/coordinate-editor.test.mjs`.

**Interfaces:** Consume band/domain/proposal. Produce `buildTerrainPassage({project,model,portionId,sourceAxis,widthM,groupId,createId,budget}):{cut,exclusions}`, `buildTerrainCutSuggestions({project,model,portionId,noCutProposal,budget}):TerrainProposal`. New passage stores `widthBasis:'model-surface'`, modelHash, original sourceAxis, widthM, scopePortionId/scopeGeometry, authoritative geometry and group. Extend `regeneratePassage` options with `model` and `portionGeometry`; legacy opt-in absent retains current planar 1.50 m route exactly. `initMap` receives `getTerrainPassageContext(target):{model,portionGeometry}|null` from app; portionGeometry deriva dallo scope originario salvato, non dal figlio che ne eredita l'id. Shape editing invalidates width/axis/scope certification metadata explicitly.

- [ ] **RED:** Test `1.50 cut sufficient`, `wider cut verified when 1.50 fails`, `no valid cut means no proposal`, `internal hole does not split`, `more fragments alone is not improvement`, `fixed coverage denominator cannot reward deleting land`, `ground width and scope survive precise endpoints and reload`:
  ```js
  assert.equal(first.cut.widthM, 1.50);
  assert.ok(wider.cut.widthM > 1.50 && wider.cut.widthM <= 5);
  assert.ok(search.diagnostics.completeCandidates <= 3);
  assert.equal(noValid.ok, false);
  assert.equal(holeOnly.ok, false);
  assert.equal(cut.result.coverage.referenceAreaM2, noCut.result.coverage.referenceAreaM2);
  assert.deepEqual(otherPortionAfter, otherPortionBefore);
  assert.equal(reloadedCut.widthBasis, 'model-surface');
  ```
- [ ] **Run RED:** `node --test tests/terrain-passage.test.mjs tests/terrain-cut-suggestions.test.mjs`; atteso FAIL per nuove API.
- [ ] **Implement corridor:** Normale all'asse nella metrica della faccia con traversal Task 3, verifica della larghezza completa, clip contro porzione/fori. Conservare scopeGeometry pre-taglio: dopo la divisione un figlio può ereditare l'id, ma non rappresenta tutta l'area originale. Per la rigenerazione intersecare lo scope originale con campo/esclusioni correnti, escludendo il vecchio gruppo del passaggio. Calcolare prima di pubblicare il risultato; edit endpoint numerico rigenera tutto il gruppo conservando larghezza e asse non clippato. Rifiutare contesto/modello incompatibile; nessun riallargamento dei passaggi precedenti. Arbitrary polygon edits tolgono la certificazione, senza pretendere che il nuovo poligono abbia ancora la larghezza dichiarata.
- [ ] **Implement search:** Localizzare convergenze dai certificati; preselezionare tagli che raggiungono confini e separano davvero la porzione. Riutilizzare noCutProposal solo con fingerprint corrente verificato; altrimenti valutarlo dentro il medesimo budget della ricerca. Deterministicamente valutare fino a tre candidati completi (1.50 m prima, più larghi entro 5 m) entro un unico budget 60 s condiviso anche dai sottocalcoli. Ricalcolare tutte le nuove porzioni con famiglie indipendenti; confrontare solo layout validi, senza premiare conteggio frammenti o superficie rimossa. Se baseline senza taglio invalida, mostrare il disegno salvato come riferimento non certificato, mai quantità di un tentativo invalido. Proposta include costo superficie, assi/frammenti/metri/piante/teste ed exclusions atomiche.
- [ ] **GREEN:** Comando RED più `node --test tests/passage-coordinates.test.mjs tests/coordinate-editor.test.mjs tests/row-portions.test.mjs tests/terrain-contour-design.test.mjs`; atteso pass e vecchi corridoi invariati.
- [ ] **Commit:** File del task; messaggio `feat: suggest verified ground-width cuts within a portion`.

### Task 6: Ripristino applicato, integrità e persistenza

**Files:** Create `src/terrain-history.js`, `tests/terrain-history.test.mjs`. Modify `src/terrain-replay.js`, `src/terrain-serialization.js` solo se necessario per la nuova history; Test `tests/terrain-persistence.test.mjs`, `tests/terrain-transport.test.mjs`, `tests/terrain-integration.test.mjs` con nuovi casi.

**Interfaces:** Consume proposal/envelope. Produce `attachTerrainRestore({project,proposal,operationId}):TerrainProposal`, `terrainRestoreAvailability({project,portionId}):{available,reason,operationId?}`, `buildTerrainRestoreProposal({project,portionId,model,budget}):TerrainProposal`. History dentro terrain, senza nuovo FIELD_KEY né default raw rowPortions. Cut è una singola operazione per gruppo; figli non ricevono copie indipendenti del baseline.

- [ ] **RED:** Test `unchanged undo restores exact geometry and quantity basis`, `global change rebuilds a proposal rather than stale totals`, `cut undo is atomic`, `edited child blocks destructive cut restore`, `old 1.3.0 has no fictitious exact undo`, `history persists offline cloud and transfer once`, `serialization rejection preserves saved baseline`:
  ```js
  assert.deepEqual(restoredSelected, originalSelected);
  assert.deepEqual(restoredOther, originalOther);
  assert.equal(changedContext.kind, 'restore');
  assert.equal(childConflict.status, 'restore-conflict');
  assert.equal(terrainRestoreAvailability({project:old,portionId}).available, false);
  assert.equal(encoded.match(/valuesBase64/g).length, fieldCount);
  assert.deepEqual(savedAfterRejectedApply, savedBefore);
  ```
- [ ] **Run RED:** `node --test tests/terrain-history.test.mjs`; atteso FAIL per history mancante.
- [ ] **Implement:** Registrare baseline reale e fingerprints di modello/input comuni/topologia/base quantità; una storia non ricorsiva per porzione. Stesso contesto ripristina dati esatti e riassembla envelope valido senza toccare le altre porzioni. Prima conversione: baseline della porzione è il disegno/manuale originale con la sua base quantità; riferimento modello è quello della proposta applicata. Il ripristino non elimina il terrain delle altre porzioni, e il totale esplicita le eventuali basi miste. Contesto diverso produce nuova proposta dal riferimento manuale, con metriche ricalcolate e Applica necessario. Cut restore verifica fingerprints dei figli/corridoio e rimuove insieme il gruppo; in presenza di modifiche successive restituisce conflitto. Baseline vecchia 1.3.0 assente: disponibile Manuale con nuova proposta, non undo esatto.
- [ ] **GREEN:** `node --test tests/terrain-history.test.mjs tests/terrain-persistence.test.mjs tests/terrain-transport.test.mjs tests/terrain-integration.test.mjs tests/terrain-v130-replay.test.mjs`; atteso pass, 1/4 MiB inclusivi e nessuna griglia duplicata. Trasferimento via round-trip JSON/mock dei trasporti, senza scrivere ad account reali.
- [ ] **Commit:** File del task; messaggio `feat: persist exact terrain and cut restore baselines`.

### Task 7: Worker, progressi e checkpoint unico

**Files:** Modify `src/terrain-worker.js`, `src/terrain-worker-client.js`, `src/terrain-controller.js`, integrazione terrain in `src/app.js`; Test `tests/terrain-worker.test.mjs`, `tests/terrain-controller.test.mjs`. Renderer separato in Task 8.

**Interfaces:** `runTerrainProposal(options,{signal,WorkerImpl,onProgress=()=>{}}):Promise<TerrainProposal>`; options `{kind,project,model,portionId,algorithmVersion,mode,deadlineMs}`. Protocollo worker `{type:'progress',phase,elapsedMs}` oppure `{type:'result',proposal}`. Controller mantiene le API esistenti e aggiunge `suggestCut()`, `restore()`, `setMode('manual'|'terrain')`; `propose({mode,projectPatch,portionId,recomputeAll})` seleziona versione nuova. `getState()` include progress, restoreAvailability, proposal.kind e lastProposalOutcome per diagnosi/suggerimenti dopo incompatibilità. Checkpoint riceve tutte le patch, history compresa, dopo guard di contesto.

- [ ] **RED:** Test `progress does not settle worker`, `30 and 60 second deadlines share config`, `late answer after account field or inputs switch discarded`, `cancel terminates work`, `failed checkpoint retains cut and history preview`, `successful cut saves exclusions portions result together`:
  ```js
  assert.equal(workerTerminatedAfterProgress, false);
  assert.deepEqual(deadlines, [30000,60000]);
  assert.equal(lateAppliedCount, 0);
  assert.equal(applyAfterQuotaFailure, false);
  assert.deepEqual(stateAfterFailure, originalState);
  assert.ok(controller.getState().proposal);
  assert.deepEqual(savedCandidate.exclusions, proposal.projectPatch.exclusions);
  ```
- [ ] **Run RED:** `node --test tests/terrain-worker.test.mjs tests/terrain-controller.test.mjs`; atteso nuovi casi FAIL contro hardcap 10 s/protocollo attuale.
- [ ] **Implement:** Un budget condiviso solver/client/controller; timer client con margine trasporto 100 ms, non clamp 10 s. Progressi non terminano il worker. Terminate fisico su abort/deadline/risultato. Guard su identità e fingerprint anche per callback progressi. Timeout separato dall'incompatibilità, status sintetico. Adapt/measure/cut usano `attachTerrainRestore`; restore consuma la voce già esistente senza crearne una nuova. Tutte passano da `checkpointTerrainProposal`, senza assegnazioni parziali né onExclusionAdd manuale che perde metadata. Checkpoint fallito lascia proposta e storia recuperabili.
- [ ] **GREEN:** Comando RED più history e serialization/persistence; atteso pass. Clock finto per deadline, niente test che dormono 60 s. Profili nuovi via `scripts/terrain-phase-profile.mjs --engine contour --output /tmp/terrain-revision-profile-contour.json`, indicando fasi/limiti e confrontando al baseline, senza vantaggi dichiarati senza misura.
- [ ] **Commit:** File del task; messaggio `feat: coordinate cancellable terrain proposals and atomic restore`.

### Task 8: Curvatura compatta, 3D comune e gesture ripristinabili

**Files:** Create `src/terrain-controls.js`, `src/map-terrain-control.js`, `src/terrain-tile-worker.js`, `tests/terrain-controls.test.mjs`, `tests/map-terrain-control.test.mjs`, `scripts/terrain-contour-browser.mjs`. Modify `index.html`, `terrain.css`, `src/app.js`, `src/map.js`, `src/map-gestures.js`, `src/terrain-map.js`; Test `tests/terrain-map.test.mjs`, `tests/map-gestures.test.mjs`.

**Interfaces:** Consume controller Task 7. `createTerrainControls({document,controller,getPortionId,onModeChange}):{render,destroy}` usa host `#terrain-curve-controls` dentro `.row-curve-controls` e `#terrain-summary` nel riepilogo. `createMapTerrainControl({map,onToggle}):{setState({available,active,busy}),destroy}` appende alla `.map-wrap` comune; unavailable se overview senza campo selezionato. `createMapGesturePolicy({map,touchRotation}):{enter3D():()=>void,destroy}` restituisce release idempotente che ripristina handler e policy wheel catturati. `createTerrainMapView` aggiunge `gesturePolicy` e tile worker cancellabile mantenendo open/close/destroy.

- [ ] **RED:** Test `curvature controls survive mobile reparenting`, `manual adaptation and restore target active portion`, `single common-map 3D control on all views`, `3D restores individual disabled handlers and wheel policy`, `pending tiles cannot resurrect closed view`, `map quantities and eye state unchanged`:
  ```js
  assert.equal(document.querySelector('#terrain-card'), null);
  assert.equal(mobileHost.querySelectorAll('#terrain-curve-controls').length, 1);
  assert.deepEqual(afterHandlers, beforeHandlers);
  assert.deepEqual(afterCamera, beforeCamera);
  assert.deepEqual(afterMetrics, beforeMetrics);
  assert.equal(sourceAddedAfterClose, false);
  ```
- [ ] **Run RED:** `node --test tests/terrain-controls.test.mjs tests/map-terrain-control.test.mjs tests/terrain-map.test.mjs tests/map-gestures.test.mjs`; atteso nuovi casi FAIL contro card/gesture attuali.
- [ ] **Implement curvature:** Eliminare card Terreno; render Manuale/Adatta al terreno, anteprima/Applica/Annulla, suggerimento taglio e Ripristina disegno precedente nella sezione curva già spostata dal mobile UI. Manuale conserva slider/punti e apre proposta misurata se necessario. Fonte/pendenza scoped nel riepilogo, attribuzione completa nei details. Titoli sintetici per timeout/limiti e impossibilità geometriche, senza schermate extra.
- [ ] **Implement map:** Icona 3D comune con aria-label/pressed e hit area touch. Valida solo campo attivo, mai modello arbitrario in overview. In 3D abilita dragRotate, pinch/rotate e touchPitch; sostituire temporaneamente wheel capture con pan/zoom/rotazione coerenti. Costruttore `pitchWithRotate:true` consentito **soltanto** con dragRotate disabilitato in 2D e ripristino verificato della policy precedente; usare solo API pubbliche della 4.7.1, non campi interni MapLibre. Offload delle tile grafiche a worker con cache bounded a 8 tile, massimo due lavori pendenti e chiusura/abort su generation change. Altimetria di disegno resta il frozen model; padding solo grafico. Ogni close/error/tool/field/account ripristina camera, terreno precedente, handler e policy wheel; non modificare l'occhio né i dati.
- [ ] **GREEN + browser:** Comando RED; `COUNTS_CHROMIUM_PATH=/tmp/v126-chrome/chromium MAP_VISIBILITY_BROWSER_ASSETS=/tmp/v126-browser-assets node scripts/terrain-contour-browser.mjs`. Desktop e mobile reali: pinch/pitch/rotate/pan, prime animation frame durante tile generation, ritorno editing 2D, campo/account change, modalità manuale/terrain, cut/undo/reload. Asserire cambi camera prodotti dalle gesture e disponibilità dei controlli durante calcolo; catturare screenshot e tempi delle fasi, nessuna sola simulazione di handler. Preferire runtime completo WebGL, non binario copiato senza librerie.
- [ ] **Commit:** File del task; messaggio `feat: place terrain controls in curvature and fluent 3D on maps`.

### Task 9: Riepiloghi, collaudo dei campi e ZIP unico

**Files:** Modify `src/terrain-report-summary.js`, `src/row-portion-summary.js`; verificare e modificare dove necessario `src/project-summary.js`, `src/revision-summary.js`, `src/pdf-model.js`, `src/report-template.js`, `src/report-pdf-download.js`, `src/shared-project.js`, `admin/admin.js`, `admin/admin-model.js`, `admin/admin-views.js`. Test `tests/terrain-guide-presentation.test.mjs`, `tests/terrain-display-quantities.test.mjs`, `tests/terrain-integration.test.mjs`. Update `README.md`, nuovo `README_RELEASE_<versione>.md`, `package.json`, `package-lock.json`, `conteggi/package.json`, `conteggi/package-lock.json`, `conteggi/sw.js`, `manifest-piattaforma.json` e import/cache references al confezionamento. Create `docs/superpowers/verification/2026-10-05-contour-revision.md` con evidenze e limiti reali.

**Interfaces:** Consume entrambe le versioni degli envelope e nuove metriche. Nessuna nuova SQL. Numero finale di release da riportare coerentemente nel prodotto/manifest/ZIP prima del confezionamento; non alterare gli ZIP 1.2.6/1.3.0 conservati.

- [ ] **RED:** Test `new and historical contour metadata render correctly`, `served area is not theoretical plants`, `invalid design cannot publish quantities`, `scope summary and attribution survive all report paths`:
  ```js
  assert.equal(newReport.rowAxisCount, newMetrics.rowAxisCount);
  assert.equal(newReport.rowFragmentCount, newMetrics.rows.length);
  assert.equal(invalidReport.quantitiesAvailable, false);
  assert.equal(newMetadata.source.license, model.source.license);
  assert.deepEqual(oldReplayMetrics, frozenOldResult);
  ```
- [ ] **Run RED + implement:** `node --test tests/terrain-guide-presentation.test.mjs tests/terrain-display-quantities.test.mjs tests/terrain-integration.test.mjs`. Se contratti già passano, aggiungere solo integrazione mancante; non cambiare il PDF font o le viste main per adattare la stampa. Stato invalido non diventa numeri planari; quote/tag esterni e riepilogo geometria/curvatura sintetico conservati.
- [ ] **Pilot reale:** Ottenere dal progetto accessibile o export autorizzato **i campioni reali indicati dall’utente, comprese le due porzioni separate dal passaggio**: geometrie, esclusioni, sesti, guide salvate e DTM congelato. Riprodurre timeout/curvatura precedente, misurare quota/interfila/copertura, adattare/ripristinare ciascuna porzione e collaudare pali. Se i dati non sono disponibili, proseguire test indipendenti e registrare questo collaudo come non eseguito; non dichiarare risolti quei casi. Non sostituire silenziosamente i campioni con fixture anonime e non modificare progetti live senza autorizzazione.
- [ ] **Full GREEN:** `npm test`, `npm run check`, `git diff --check`; 144 baseline, replay congelati 1.3.0 e nuovi certificati devono passare. Eseguire browser `terrain-contour-browser`, `coordinate-editor-browser`, `map-visibility-browser`, `configurator-restore-browser`, `terrain-invalid-quantities-browser`, `counts-browser`, `report-layout-v126-browser`, `terrain-report-browser` con runtime WebGL completo e nessun override di app/solver. Ispezionare PDF/PNG rappresentativi desktop/mobile, fonte nazionale e fallback; font PDF precedente, quote/tag esterni e schema tecnico ingrandito conservati. Registrare limiti CORS reali, nessuna promessa di precisione superiore al DTM.
- [ ] **Revisione e pacchetto:** Revisore indipendente whole-branch con spec, diff e evidenze; correggere Critical/Important e ripetere solo i check toccati. `npm run offline:build`, aggiornare versioni/cache/manifest unitariamente, creare ZIP dell'intera piattaforma. Estrarre in directory pulita, verificare hash/risorse locali e ripetere unit/syntax sul pacchetto. Salvare ZIP durabilmente e consegnare un unico link con verifiche e limiti specifici. Nessun deploy/push implicito.
- [ ] **Commit:** File integrazione/evidenze/release del task; messaggio `release: verify contour revision and unified platform package`.

## Autoverifica del piano

Copertura: UI/3D Task 8; misure/summary Task 2/4/9; quota/interfila Task 3; ottimizzazione Task 4; passaggi Task 5; ripristino/persistenza Task 6/7; compatibilità Task 1/4/9; budget/profili Task 1/2/7; collaudo completo Task 9. I cinque Review Focus hanno test espliciti nei task indicati. Contratti riutilizzati con gli stessi nomi, spazio XY/Geo dichiarato, envelope legacy separato e baseline storico non rigenerato. Nessuna modifica del prodotto eseguita con la sola stesura di questo piano.

Riferimenti tecnici per Task 8: API ufficiali MapLibre `DragRotateHandler`, `TwoFingersTouchPitchHandler`, `MapOptions.pitchWithRotate`; verificare sul runtime fissato **4.7.1**, poiché la documentazione pubblica corrente descrive anche versioni successive. https://maplibre.org/maplibre-gl-js/docs/API/classes/DragRotateHandler/ · https://maplibre.org/maplibre-gl-js/docs/API/classes/TwoFingersTouchPitchHandler/ · https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/
