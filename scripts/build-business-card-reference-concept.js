const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "output", "business-card-concept");
const qrPath = path.join(outputDir, "scanme-qr.png");

const W = 850;
const H = 550;
const R = 28;

const c = {
  paper: "#e9e5da",
  ink: "#1c2221",
  lime: "#a8d83f",
  muted: "#69706b",
  pattern: "#1c2221",
};

function inner(svg) {
  return svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1];
}

function wordmark(x, y, size) {
  const scanX = x;
  const mX = x + size * 2.27;
  const eX = mX + size * 0.82;
  const dotX = eX + size * 0.55;

  return `
    <g aria-label="ScanMe.">
      <text x="${scanX}" y="${y}" fill="${c.ink}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="700" letter-spacing="${-size * 0.055}">Scan</text>
      <text x="${mX}" y="${y}" fill="${c.ink}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="600" letter-spacing="${-size * 0.07}">M</text>
      <text x="${eX}" y="${y}" fill="${c.ink}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="400" letter-spacing="${-size * 0.055}">e</text>
      <circle cx="${dotX}" cy="${y - size * 0.08}" r="${size * 0.071}" fill="${c.lime}"/>
    </g>`;
}

function subtlePattern(id) {
  return `
    <defs>
      <pattern id="${id}" width="76" height="76" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect x="11" y="11" width="54" height="54" rx="15" fill="none" stroke="${c.pattern}" stroke-width="2" opacity="0.028"/>
        <rect x="24" y="24" width="28" height="28" rx="8" fill="none" stroke="${c.pattern}" stroke-width="1.5" opacity="0.02"/>
      </pattern>
    </defs>`;
}

function hex(cx, cy, radius, fill, stroke = c.ink) {
  const pts = [];
  for (let i = 0; i < 6; i += 1) {
    const a = Math.PI / 3 * i;
    pts.push(`${cx + Math.cos(a) * radius},${cy + Math.sin(a) * radius}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`;
}

function front(qrData) {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${subtlePattern("frontPattern")}
    <rect width="${W}" height="${H}" rx="${R}" fill="${c.paper}"/>
    <rect width="${W}" height="${H}" rx="${R}" fill="url(#frontPattern)"/>
    <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${R - 1}" fill="none" stroke="${c.ink}" stroke-opacity="0.13" stroke-width="2"/>

    ${wordmark(310, 92, 58)}

    <path d="M 92 52 C 128 117 164 190 193 286 C 217 366 235 456 305 480 H 545 C 615 456 633 366 657 286 C 686 190 722 117 758 52"
      fill="none" stroke="${c.ink}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M 98 52 C 134 116 170 188 199 283"
      fill="none" stroke="#ffffff" stroke-opacity="0.4" stroke-width="1.2" stroke-linecap="round"/>

    ${hex(172, 222, 16, c.paper)}
    <circle cx="172" cy="222" r="5" fill="${c.lime}"/>
    ${hex(682, 218, 11, c.ink)}
    <circle cx="682" cy="218" r="3.5" fill="${c.paper}"/>

    <image href="data:image/png;base64,${qrData}" x="275" y="122" width="300" height="300" image-rendering="pixelated"/>
    <text x="425" y="454" text-anchor="middle" fill="${c.ink}" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="700" letter-spacing="2.1">scanme.rs</text>
    <text x="425" y="520" text-anchor="middle" fill="${c.ink}" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="500" letter-spacing="1.45">FIZIČKO POSTAJE DIGITALNO.</text>
  </svg>`;
}

function phoneIcon(x, y) {
  return `
    <g transform="translate(${x} ${y})" fill="none" stroke="${c.ink}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="14" cy="14" r="13"/>
      <path d="M 8 6 C 7 12 13 20 21 21 L 23 17 L 18 14 L 15 17 C 12 15 10 12 10 9 L 13 7 Z"/>
    </g>`;
}

function mailIcon(x, y) {
  return `
    <g transform="translate(${x} ${y})" fill="none" stroke="${c.ink}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="14" cy="14" r="13"/>
      <rect x="7" y="9" width="14" height="11" rx="2"/>
      <path d="M 8 11 L 14 16 L 20 11"/>
    </g>`;
}

function webIcon(x, y) {
  return `
    <g transform="translate(${x} ${y})" fill="none" stroke="${c.ink}" stroke-width="2.1" stroke-linecap="round">
      <circle cx="14" cy="14" r="13"/>
      <ellipse cx="14" cy="14" rx="6" ry="13"/>
      <path d="M 2 14 H 26 M 5 8 H 23 M 5 20 H 23"/>
    </g>`;
}

function back() {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${subtlePattern("backPattern")}
    <rect width="${W}" height="${H}" rx="${R}" fill="${c.paper}"/>
    <rect width="${W}" height="${H}" rx="${R}" fill="url(#backPattern)"/>
    <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${R - 1}" fill="none" stroke="${c.ink}" stroke-opacity="0.13" stroke-width="2"/>

    <path d="M 368 48 C 392 119 432 176 445 234 C 459 298 402 347 392 407 C 386 444 394 478 412 510"
      fill="none" stroke="${c.ink}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M 374 48 C 398 117 438 174 451 232"
      fill="none" stroke="#ffffff" stroke-opacity="0.4" stroke-width="1.2" stroke-linecap="round"/>
    ${hex(413, 158, 12, c.ink)}
    <circle cx="413" cy="158" r="3.6" fill="${c.paper}"/>
    ${hex(398, 408, 18, c.paper)}
    <circle cx="398" cy="408" r="5.5" fill="${c.lime}"/>

    ${phoneIcon(68, 178)}
    <text x="112" y="199" fill="${c.ink}" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="500">+381 6X XXX XX XX</text>

    ${mailIcon(68, 254)}
    <text x="112" y="275" fill="${c.ink}" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="500">aleksa@scanme.rs</text>

    ${webIcon(68, 330)}
    <text x="112" y="351" fill="${c.ink}" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="500">scanme.rs</text>

    <line x1="70" y1="413" x2="310" y2="413" stroke="${c.ink}" stroke-opacity="0.18" stroke-width="2"/>

    <text x="500" y="246" fill="${c.ink}" font-family="Arial, Helvetica, sans-serif" font-size="43" font-weight="700" letter-spacing="-1.4">Aleksa</text>
    <text x="500" y="294" fill="${c.ink}" font-family="Arial, Helvetica, sans-serif" font-size="43" font-weight="700" letter-spacing="-1.4">Đorđević</text>
    <text x="503" y="336" fill="${c.muted}" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" letter-spacing="3.2">OSNIVAČ</text>
    <line x1="501" y1="373" x2="757" y2="373" stroke="${c.ink}" stroke-width="3"/>
    <line x1="757" y1="373" x2="782" y2="373" stroke="${c.lime}" stroke-width="3"/>
  </svg>`;
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const qrData = fs.readFileSync(qrPath).toString("base64");
  const frontSvg = front(qrData);
  const backSvg = back();
  const combined = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="720" viewBox="0 0 1920 720">
    <g transform="translate(45 85)">${inner(frontSvg)}</g>
    <g transform="translate(1025 85)">${inner(backSvg)}</g>
  </svg>`;

  fs.writeFileSync(path.join(outputDir, "scanme-reference-led-v2-front.svg"), frontSvg);
  fs.writeFileSync(path.join(outputDir, "scanme-reference-led-v2-back.svg"), backSvg);
  fs.writeFileSync(path.join(outputDir, "scanme-reference-led-v2-2d.svg"), combined);

  await sharp(Buffer.from(frontSvg)).png().toFile(path.join(outputDir, "scanme-reference-led-v2-front.png"));
  await sharp(Buffer.from(backSvg)).png().toFile(path.join(outputDir, "scanme-reference-led-v2-back.png"));
  await sharp(Buffer.from(combined)).png().toFile(path.join(outputDir, "scanme-reference-led-v2-2d.png"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
