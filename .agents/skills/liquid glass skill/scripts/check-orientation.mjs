#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error("Usage: node check-orientation.mjs <component-file> [...more-files]");
  process.exit(2);
}

const mirrorPatterns = [
  { label: "negative Y scale", pattern: /scaleY\s*\(\s*-1\s*\)/i },
  { label: "180 degree rotation", pattern: /rotate(?:Z)?\s*\(\s*180deg\s*\)/i },
  { label: "shader Y inversion", pattern: /1(?:\.0)?\s*-\s*(?:screenUv|screenUV|uv|vUv)\.y/g },
];

let failed = false;

for (const file of files) {
  const source = await readFile(file, "utf8");
  const isWebGlSampler = /texImage2D\s*\(/.test(source) && /texture2D\s*\(/.test(source);
  const flipsOnUpload = /pixelStorei\s*\(\s*gl\.UNPACK_FLIP_Y_WEBGL\s*,\s*true\s*\)/.test(source);
  const shaderFlips = /1(?:\.0)?\s*-\s*(?:screenUv|screenUV|uv|vUv)\.y/.test(source);
  const problems = [];

  for (const { label, pattern } of mirrorPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) problems.push(label);
  }

  if (isWebGlSampler && !flipsOnUpload && !shaderFlips) {
    problems.push("no explicit WebGL Y-origin correction");
  }

  if (isWebGlSampler && flipsOnUpload && shaderFlips) {
    problems.push("double WebGL Y correction");
  }

  if (problems.length > 0) {
    failed = true;
    console.error(`[FAIL] ${file}: ${problems.join(", ")}`);
  } else {
    console.log(`[PASS] ${file}: no orientation hazards detected`);
  }
}

process.exit(failed ? 1 : 0);
