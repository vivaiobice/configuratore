/**
 * Shared contracts for the native-face contour engine. Geographic boundaries
 * use WGS84; face coordinates use metres in the frozen model's CRS. Reading an
 * existing envelope never resolves portions or persists new defaults.
 *
 * @typedef {[number,number]} GeoPoint [longitude, latitude], WGS84.
 * @typedef {[number,number]} XY Metres in the model CRS.
 * @typedef {[number,number,number]} XYZ Metres in the model CRS, elevation last.
 * @typedef {{type:'Polygon',coordinates:GeoPoint[][]}} Polygon Rings include holes.
 * @typedef {{type:'MultiPolygon',coordinates:GeoPoint[][][]}} MultiPolygon
 * @typedef {ReturnType<import('./terrain-model.js?v=1.3.4').createTerrainModel>} FrozenModel
 * @typedef {ReturnType<import('./fields.js?v=1.3.4').createDefaultField>} Project
 * @typedef {ReturnType<import('./row-portions.js?v=1.3.4').resolveRowPortions>[number]} Portion
 * @typedef {'adapt'|'measure'|'cut'|'restore'} TerrainOperationKind
 * @typedef {{phase:string,elapsedMs:number,remainingMs:number,nodeCount:number}} TerrainProgress
 * @typedef {'time'|'work'} TerrainBudgetReason
 * Budget exhaustion errors retain status:'budget-exceeded' and expose
 * budgetReason, budgetPhase and immutable budgetUsage for truthful feedback.
 * @typedef {{check:(nodeDelta?:number)=>void,phase:(name:string)=>void,
 * withReserve:(reserve:{nodeCount:number,remainingMs:number},callback:Function)=>any,
 * remainingMs:()=>number,timings:()=>Object<string,number>,
 * usage:()=>Readonly<{nodeCount:number,elapsedMs:number,remainingMs:number}>}} TerrainBudget
 * check() counts no nodes by default: nodeDelta counts generated or retained
 * geometry nodes, never CPU visits to faces. Nodes and deadlines are cumulative
 * across phases and candidates. timings() returns milliseconds by phase name;
 * onProgress receives TerrainProgress on phase changes.
 * initialNodeCount carries already charged nodes without granting a new cap.
 * withReserve temporarily limits optional synchronous work on this same budget;
 * its budgetReservation interruption retains all charges and can only resume
 * after the true shared work/deadline check succeeds.
 * usage() is an immutable copy for diagnostics/accounting only, never native
 * validity evidence, persisted proposal data or geometry registration.
 * @typedef {{modelHash:string,crs:string,faces:Object[],boundaries:Object[],
 * spatialIndex:Object,elevationIndex:Object,geometry:Polygon|MultiPolygon}} ContourDomain
 * Faces contain XYZ vertices, an affine plane, adjacency and clipped portions.
 * @typedef {{axisId:string,portionId:string,levelM:number,ordinal:number,
 * components:Array<{faceIds:number[],coordinatesXY:XY[]}>}} ContourAxis
 * Components are continuous at a single level; clipping produces physical rows.
 * New automatic certified-plane axes may explicitly use
 * axisGeometryConvention:'source-domain-intersection-1'. The saved finite
 * binary64 two-point source is authoritative; physical geometry is its exact
 * intersection with axisGeometryBinding scope/model/CRS. Original scope is
 * separately bound for perimeter ground trim. Complete bbox span/native plane
 * support are proved at resolution, never trusted from submitted faceIds.
 * Optional axisOperation:{kind:'source-parameter-intervals-1',intervals:XY[]}
 * contains numeric source parameters only. Exact rational coordinates remain
 * transient. Actual conservative ground trim excess is at most 1e-6 m.
 * Rows with coordinateRole:'render-export-preview' bind sourceHash and operation;
 * their coordinates are render/export approximations, never metric operands.
 * Saved terrainDesign stores axisScopeGeometry/originalAxisScopeGeometry once.
 * Absent markers retain literal semantics; unknown markers fail closed.
 * @typedef {{valid:boolean,lowerM:number,upperM:number,errorBoundM:number,
 * spans:Object[],exceptions:Object[],critical:Object[],unresolved:Object[]}} SpacingCertificate
 * Spans identify axis, direction, initial interval and face itinerary. An
 * exception must name the real boundary reached, not an omitted/unresolved axis.
 * @typedef {{valid:boolean,geometry:MultiPolygon,areaM2:number,validation:Object}} SurfaceBand
 * Width is measured on the surface; serialization/clipping retains holes.
 * validation.geometryConvention='domain-intersection': geometry is a bounded
 * serialized construction polygon. Its physical meaning is its intersection
 * with scopeGeometry in the bound model CRS; consumers must bind and clip that
 * scope before coverage, rendering, exclusion or fragmentation. Exterior
 * guards never contribute area. perFace polygons describe the effective union
 * on each native face, with outward areaBoundsM2. Null serialized width bounds
 * mean that side is wholly covered by proven real-boundary exceptions, never
 * an invented nominal width. Metric proofs use projected vertices/straight XY
 * edges; raw WGS arrangements independently verify contact/component topology.
 * @typedef {{ok:boolean,axes:ContourAxis[],rows:Object[],validation:Object,
 * coverage:{servedAreaM2:number,referenceAreaM2:number,percent:number},
 * metrics:Object,diagnostics:Object}} FamilyResult Failure exposes no applicable quantities.
 * @typedef {{ok:boolean,status:string,message:string,kind:TerrainOperationKind,
 * terrain?:Object,rowPortions?:Portion[],result?:Object,changes?:Object[],
 * projectPatch?:Object,diagnostics?:Object,timings?:Object<string,number>}} TerrainProposal
 * Result preserves all calculator fields and adds rowAxisCount,
 * rowFragmentCount, coverage and explicit quantityBasis. Cut diagnostics count
 * completeCandidates, not partial candidates.
 * @typedef {TerrainProposal & {cut:{groupId:string,sourceAxis:Object,widthM:number,
 * widthBasis:'model-surface',scopePortionId:string,scopeGeometry:Polygon|MultiPolygon,
 * geometry:MultiPolygon,modelHash:string},comparison:Object}} CutProposal
 * All cut parts enter projectPatch.exclusions; scopeGeometry retains the original
 * pre-cut portion. No live mutations and no changes to previous passages.
 * @typedef {{schemaVersion:1,operationId:string,kind:TerrainOperationKind,
 * affectedIds:string[],before:Object,afterFingerprint:string,
 * contextFingerprint:string,baselineHash:string}} RestoreEntry
 * before contains only topology/axes/parameters/quantity basis, no grid or
 * recursive history. One consumed undo per portion, shared by a cut group.
 * @typedef {{schemaVersion:2,algorithmVersion:string,inputHash:string,inputs:Object,
 * result:Object,portionResults:Object[],validation:Object,resultHash:string,
 * snapshotHash:string}} AppliedEnvelopeV2
 * terrain={model,applied,history?}; history={schemaVersion:1,entries:RestoreEntry[]}
 * stays outside geometry inputs and is checked separately by checkpoint code.
 * Restores and history still count towards existing serialization limits.
 */

export const TERRAIN_CONTOUR_ALGORITHM_VERSION='terrain-contour-family-1';
export const TERRAIN_ENVELOPE_SCHEMA_VERSION=2;
export const TERRAIN_MAX_NODES=500000;
export const TERRAIN_OPERATION_CAP_MS=Object.freeze({adapt:30000,measure:30000,restore:30000,cut:60000});

/**
 * V2 geometry projection uses the existing numeric/global default semantics:
 * polygon (project.polygon ?? project.geometry), exclusions, rowSpacingM,
 * plantSpacingM, orientationDeg, rowCurvePoints, rowPortions,
 * maintainRowEquidistance, postSpacingM, headlandWidthM; input hash also binds
 * model.contentHash. No field labels, history, account or presentation metadata.
 * Portion fields remain raw (no resolving/defaulting); terrainDesign includes
 * the entire active design object. Unknown outer portion metadata, label and
 * conflict are excluded. Exclusion rings are normalized to {geometry}; objects
 * preserve the following provenance/width/scope fields when present. Labels are
 * excluded. Missing selected fields stay missing; no persisted migration.
 * Legacy envelopes retain their original full raw portions/exclusions hash.
 */
export const TERRAIN_PORTION_GEOMETRY_KEYS=Object.freeze([
 'id','geometry','anchor','mode','orientationDeg','rowCurvePoints',
 'maintainRowEquidistance','inheritedDesign','terrainDesign','terrainScopeRecipe'
]);
export const TERRAIN_EXCLUSION_GEOMETRY_KEYS=Object.freeze([
 'geometry','id','type','sourceAxis','widthM','widthBasis','modelHash',
 'scopePortionId','scopeGeometry','passageGroupId',
 'surfaceGroupVersion','surfaceGroupOwner','surfaceGeometry',
 'surfaceGeometryConvention','surfaceConstructionPolicy'
]);
