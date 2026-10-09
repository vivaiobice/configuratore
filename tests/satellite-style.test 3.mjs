import test from 'node:test';
import assert from 'node:assert/strict';

test('shared satellite style layers imagery below geographic reference labels',async()=>{
 const {satelliteSources,satelliteLayers,satelliteStyle}=await import('../src/satellite-style.js');
 const sources=satelliteSources();
 assert.match(sources.satellite.tiles[0],/World_Imagery/);
 assert.match(sources['satellite-reference'].tiles[0],/World_Boundaries_and_Places/);
 const layers=satelliteLayers();
 assert.deepEqual(layers.map(layer=>layer.id),['satellite','satellite-reference']);
 assert.equal(layers[1].source,'satellite-reference');
 assert.equal(layers[1].type,'raster');
 const hidden=satelliteLayers({labelsVisible:false});
 assert.equal(hidden[1].layout.visibility,'none');
 const style=satelliteStyle();
 assert.notEqual(style.sources,sources);
 assert.equal(style.layers.at(-1).id,'satellite-reference');
});
