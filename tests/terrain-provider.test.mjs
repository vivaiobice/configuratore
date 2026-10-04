import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fromUTM } from '../src/coordinate-system.js';
import {
  loadTerrainForField,
  clearTerrainProviderCache,
} from '../src/terrain-provider.js';
import {
  validateTerrainModel,
  decodeTerrainGrid,
} from '../src/terrain-model.js';
const fixtures = JSON.parse(
  await readFile(
    new URL('./fixtures/terrain/requests.json', import.meta.url),
    'utf8',
  ),
);
function polygonFor(f) {
  return { type: 'Polygon', coordinates: [f.fieldRing.map((p) => fromUTM(p))] };
}
function fixtureFetch(list, calls) {
  return async (url, { signal }) => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    calls.push(url);
    const item = list.shift();
    if (item instanceof Error) throw item;
    return new Response(
      await readFile(new URL(`./fixtures/terrain/${item}`, import.meta.url)),
      { headers: { 'Content-Type': 'image/tiff' } },
    );
  };
}
test('actual Piemonte and Tuscany numeric WCS fixtures preserve native values, CRS and source', async () => {
  for (const f of fixtures.slice(0, 2)) {
    clearTerrainProviderCache();
    const calls = [];
    const model = await loadTerrainForField({
      polygon: polygonFor(f),
      fetchImpl: fixtureFetch([f.file], calls),
    });
    assert.equal(model.crs, 'EPSG:32632');
    assert.equal(model.source.resolutionM, f.resolutionM);
    assert.deepEqual(model.grid.step, [f.resolutionM, -f.resolutionM]);
    assert.equal(validateTerrainModel(model).valid, true);
    assert.equal(decodeTerrainGrid(model)[0], f.firstHeight);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].includes('GetCoverage'));
    assert.ok(new URL(calls[0]).searchParams.get('COVERAGE') === f.coverage);
  }
});
test('regional unavailability falls back as one whole national grid and aborts propagate', async () => {
  clearTerrainProviderCache();
  const f = fixtures[0],
    calls = [];
  const model = await loadTerrainForField({
    polygon: polygonFor(f),
    fetchImpl: fixtureFetch(
      [new Error('regional unavailable'), fixtures[2].file],
      calls,
    ),
  });
  assert.equal(model.source.id, 'tinitaly-1.1');
  assert.equal(calls.length, 2);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    loadTerrainForField({
      polygon: polygonFor(f),
      signal: abort.signal,
      fetchImpl: fixtureFetch([], []),
    }),
    { name: 'AbortError' },
  );
});
test('response bounds/CRS/nodata and budget reject without reducing native resolution; cache isolates fetch functions', async () => {
  clearTerrainProviderCache();
  const f = fixtures[1];
  await assert.rejects(
    loadTerrainForField({
      polygon: polygonFor(f),
      fetchImpl: fixtureFetch([fixtures[0].file], []),
    }),
    /coverage|copertura|bounds|extent|risoluzione/i,
  );
  const calls = [],
    fetchImpl = fixtureFetch([f.file], calls);
  const a = await loadTerrainForField({ polygon: polygonFor(f), fetchImpl });
  const b = await loadTerrainForField({ polygon: polygonFor(f), fetchImpl });
  assert.equal(a, b);
  assert.equal(calls.length, 1);
  await assert.rejects(
    loadTerrainForField({
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [8, 44],
            [9, 44],
            [9, 45],
            [8, 45],
            [8, 44],
          ],
        ],
      },
      fetchImpl: fixtureFetch([], []),
    }),
    /limit|budget|celle/i,
  );
});
test('numeric nodata rejects regional coverage and selects a whole national grid', async () => {
  clearTerrainProviderCache();
  const { fromArrayBuffer } = await import('../src/vendor/geotiff.js'),
    f = fixtures[0],
    bytes = await readFile(
      new URL(`./fixtures/terrain/${f.file}`, import.meta.url),
    );
  const image = await (
    await fromArrayBuffer(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    )
  ).getImage();
  bytes.writeFloatLE(-99, image.getFileDirectory().StripOffsets[0]);
  let calls = 0;
  const model = await loadTerrainForField({
    polygon: polygonFor(f),
    fetchImpl: async () =>
      new Response(
        ++calls === 1
          ? bytes
          : await readFile(
              new URL(
                `./fixtures/terrain/${fixtures[2].file}`,
                import.meta.url,
              ),
            ),
      ),
  });
  assert.equal(model.source.id, 'tinitaly-1.1');
  assert.equal(calls, 2);
  assert.ok(!decodeTerrainGrid(model).includes(-99));
});
test('unexpected projected EPSG and overlarge streamed responses reject', async () => {
  clearTerrainProviderCache();
  const f = fixtures[1],
    bytes = await readFile(
      new URL(`./fixtures/terrain/${f.file}`, import.meta.url),
    );
  const key = Buffer.from([12, 0, 0, 0, 0, 1, 127, 120]);
  const offset = bytes.indexOf(key);
  assert.ok(offset >= 0);
  bytes.writeUInt16BE(32633, offset + 6);
  await assert.rejects(
    loadTerrainForField({
      polygon: polygonFor(f),
      fetchImpl: async () => new Response(bytes),
    }),
    /CRS/,
  );
  await assert.rejects(
    loadTerrainForField({
      polygon: polygonFor(f),
      fetchImpl: async () =>
        new Response('x', {
          headers: { 'content-length': String(5 * 1024 * 1024) },
        }),
    }),
    /limite/,
  );
});
function modifyTiffTag(bytes, tag, value) {
  const littleEndian = bytes[0] === 73;
  const uint16 = (offset) =>
    littleEndian ? bytes.readUInt16LE(offset) : bytes.readUInt16BE(offset);
  const uint32 = (offset) =>
    littleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset);
  const ifd = uint32(4),
    count = uint16(ifd);
  for (let i = 0; i < count; i++) {
    const offset = ifd + 2 + i * 12;
    if (uint16(offset) !== tag) continue;
    assert.equal(uint32(offset + 4), 1);
    const type = uint16(offset + 2),
      position = offset + 8;
    if (type === 3)
      littleEndian
        ? bytes.writeUInt16LE(value, position)
        : bytes.writeUInt16BE(value, position);
    else if (type === 4)
      littleEndian
        ? bytes.writeUInt32LE(value, position)
        : bytes.writeUInt32BE(value, position);
    else assert.fail(`Unexpected tag type ${type}`);
    return;
  }
  assert.fail(`Missing TIFF tag ${tag}`);
}
test('a real Tuscany TIFF with an 8 MiB compressed tile rejects before inflation', async () => {
  clearTerrainProviderCache();
  const { deflateSync } = await import('node:zlib'),
    f = fixtures[1];
  const original = await readFile(
    new URL(`./fixtures/terrain/${f.file}`, import.meta.url),
  );
  const oversized = Buffer.alloc(
    8 * 1024 * 1024,
    Buffer.from([0x42, 0xc8, 0, 0]),
  );
  const compressed = deflateSync(oversized),
    header = Buffer.from(original);
  modifyTiffTag(header, 259, 8);
  modifyTiffTag(header, 324, header.length);
  modifyTiffTag(header, 325, compressed.length);
  const malicious = Buffer.concat([header, compressed]);
  assert.ok(malicious.length < 10000);
  assert.equal(oversized.readFloatBE(0), 100);
  let requests = 0;
  await assert.rejects(
    loadTerrainForField({
      polygon: polygonFor(f),
      fetchImpl: async () => {
        requests++;
        return new Response(malicious);
      },
    }),
    (error) =>
      error.code === 'unsupported-format' &&
      /compressione|formato/i.test(error.message),
  );
  assert.equal(requests, 1);
});
test('unsupported regional compression does not silently fall back and malformed raw tile bytes reject', async () => {
  clearTerrainProviderCache();
  const regional = await readFile(
    new URL(`./fixtures/terrain/${fixtures[0].file}`, import.meta.url),
  );
  modifyTiffTag(regional, 259, 8);
  let requests = 0;
  await assert.rejects(
    loadTerrainForField({
      polygon: polygonFor(fixtures[0]),
      fetchImpl: async () => {
        requests++;
        return new Response(regional);
      },
    }),
    (error) => error.code === 'unsupported-format',
  );
  assert.equal(requests, 1);
  const raw = await readFile(
    new URL(`./fixtures/terrain/${fixtures[1].file}`, import.meta.url),
  );
  modifyTiffTag(raw, 325, 1020);
  await assert.rejects(
    loadTerrainForField({
      polygon: polygonFor(fixtures[1]),
      fetchImpl: async () => new Response(raw),
    }),
    (error) =>
      error.code === 'invalid-layout' &&
      /byte|tile|blocco/i.test(error.message),
  );
});
