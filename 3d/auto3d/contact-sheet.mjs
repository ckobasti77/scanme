// Spaja sve PNG rendere iz jednog foldera u jednu sliku (za pregled i hladnu kritiku).
//
//   node 3d/auto3d/contact-sheet.mjs <folder> <izlaz.png> [kolone]
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const [dir, out, colsArg] = process.argv.slice(2);
if (!dir || !out) {
  console.error("upotreba: node 3d/auto3d/contact-sheet.mjs <folder> <izlaz.png> [kolone]");
  process.exit(2);
}
const cols = Number(colsArg ?? 3);
const files = readdirSync(dir).filter((f) => f.endsWith(".png") && !f.startsWith("sheet")).sort();
const cellW = 800;
const cellH = 500;
const tiles = [];
for (const [i, f] of files.entries()) {
  tiles.push({
    input: await sharp(resolve(dir, f)).resize(cellW - 8, cellH - 8, { fit: "contain", background: "#0A0D11" }).toBuffer(),
    left: (i % cols) * cellW + 4,
    top: Math.floor(i / cols) * cellH + 4,
  });
}
const rows = Math.max(1, Math.ceil(files.length / cols));
await sharp({ create: { width: cols * cellW, height: rows * cellH, channels: 3, background: "#0A0D11" } })
  .composite(tiles)
  .png()
  .toFile(out);
console.log(`kontakt-list: ${out} (${files.length} slika)`);
