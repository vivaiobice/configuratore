import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createViewMode} from '../src/view-mode.js';
function mobile(width,coarse){return createViewMode({isTablet:()=>false,autoMobile:()=>width<=800||width<=1100&&coarse}).isMobile();}
test('iPhone remains mobile after landscape rotation',()=>{assert.equal(mobile(430,true),true);assert.equal(mobile(932,true),true);});
test('desktop retains its layout',()=>{assert.equal(mobile(1280,false),false);assert.equal(mobile(932,false),false);});
