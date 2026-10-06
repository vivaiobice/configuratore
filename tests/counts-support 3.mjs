import {createRequire} from 'node:module';
const require=createRequire(new URL('../conteggi/package.json',import.meta.url));
export const {IDBFactory}=require('fake-indexeddb');
export const {PGlite}=require('@electric-sql/pglite');
export const scope=(owner='guest-a',environment='TEST')=>({backend:'https://backend.example',environment,owner});
