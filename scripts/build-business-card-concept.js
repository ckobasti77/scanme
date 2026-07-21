const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "output", "business-card-concept");
const qrPath = path.join(outputDir, "scanme-qr.png");

const colors = {
  paper: "#e9e5da",
  ink: "#1c2221",
  lime: "#a8d83f",
  muted: "#626964",
  embossDark: "#d4d0c5",
  embossLight: "#f2eee5",
};

const cardWidth = 850;
const cardHeight = 550;
const radius = 28;

function wordmark(x, y, size) {
  const scanWidth = size * 2.28;
  const mX = x + scanWidth;
  const eX = mX + size * 0.82;
  const dotX = eX + size * 0.54;

  return `
    <g aria-label="ScanMe.">
      <text x="${x}" y="${y}" fill="${colors.ink}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="700" letter-spacing="${-size * 0.055}">Scan</text>
      <text x="${mX}" y="${y}" fill="${colors.ink}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="600" letter-spacing="${-size * 0.07}">M</text>
      <text x="${eX}" y="${y}" fill="${colors.ink}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="400" letter-spacing="${-size * 0.055}">e</text>
      <circle cx="${dotX}" cy="${y - size * 0.08}" r="${size * 0.073}" fill="${colors.lime}" />
    </g>`;
}

function frontCard(qrData) {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth}" height="${cardHeight}" viewBox="0 0 ${cardWidth} ${cardHeight}">
    <rect width="${cardWidth}" height="${cardHeight}" rx="${radius}" fill="${colors.paper}"/>
    <rect x="18" y="18" width="814" height="514" rx="18" fill="none" stroke="${colors.embossDark}" stroke-width="2"/>
    <rect x="21" y="21" width="808" height="508" rx="16" fill="none" stroke="${colors.embossLight}" stroke-width="2"/>

    ${wordmark(67, 119, 60)}

    <path d="M 298 115 H 382 V 151 H 438 V 188 H 487"
      fill="none" stroke="${colors.ink}" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter"/>
    <path d="M 298 125 H 372 V 161 H 428 V 198 H 487"
      fill="none" stroke="${colors.embossDark}" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"/>
    <path d="M 298 122 H 312" fill="none" stroke="${colors.lime}" stroke-width="4"/>

    <text x="70" y="341" fill="${colors.ink}" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="400" letter-spacing="-1.1">Fizičko postaje</text>
    <text x="70" y="389" fill="${colors.ink}" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700" letter-spacing="-1.45">digitalno.</text>
    <line x1="70" y1="458" x2="443" y2="458" stroke="${colors.ink}" stroke-width="3"/>
    <line x1="443" y1="458" x2="465" y2="458" stroke="${colors.lime}" stroke-width="3"/>

    <image href="data:image/png;base64,${qrData}" x="520" y="125" width="260" height="260" image-rendering="pixelated"/>
    <text x="650" y="436" text-anchor="middle" fill="${colors.ink}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" letter-spacing="2.3">scanme.rs</text>
  </svg>`;
}

function backCard() {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth}" height="${cardHeight}" viewBox="0 0 ${cardWidth} ${cardHeight}">
    <rect width="${cardWidth}" height="${cardHeight}" rx="${radius}" fill="${colors.paper}"/>
    <rect x="18" y="18" width="814" height="514" rx="18" fill="none" stroke="${colors.embossDark}" stroke-width="2"/>
    <rect x="21" y="21" width="808" height="508" rx="16" fill="none" stroke="${colors.embossLight}" stroke-width="2"/>

    <text x="500" y="435" fill="none" stroke="${colors.embossDark}" stroke-width="3" font-family="Arial, Helvetica, sans-serif" font-size="315" font-weight="700" letter-spacing="-24">M</text>
    <text x="503" y="432" fill="none" stroke="${colors.embossLight}" stroke-width="2" font-family="Arial, Helvetica, sans-serif" font-size="315" font-weight="700" letter-spacing="-24">M</text>

    ${wordmark(67, 109, 48)}
    <path d="M 249 105 H 545 V 143 H 760 V 209 H 784"
      fill="none" stroke="${colors.ink}" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter"/>
    <path d="M 249 115 H 535 V 153 H 750 V 219 H 784"
      fill="none" stroke="${colors.embossDark}" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"/>
    <path d="M 249 112 H 263" fill="none" stroke="${colors.lime}" stroke-width="4"/>

    <text x="70" y="286" fill="${colors.ink}" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="700" letter-spacing="-2.4">Aleksa Đorđević</text>
    <text x="72" y="331" fill="${colors.muted}" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700" letter-spacing="3">OSNIVAČ</text>

    <line x1="70" y1="376" x2="522" y2="376" stroke="${colors.ink}" stroke-opacity="0.18" stroke-width="2"/>
    <text x="70" y="442" fill="${colors.ink}" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="500" letter-spacing="0.2">+381 6X XXX XX XX</text>
    <line x1="350" y1="407" x2="350" y2="462" stroke="${colors.ink}" stroke-opacity="0.2" stroke-width="2"/>
    <text x="390" y="442" fill="${colors.ink}" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="500" letter-spacing="0.2">aleksa@scanme.rs</text>

    <rect x="70" y="496" width="640" height="3" fill="${colors.ink}"/>
    <rect x="710" y="496" width="24" height="3" fill="${colors.lime}"/>
  </svg>`;
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const qrData = fs.readFileSync(qrPath).toString("base64");
  const front = frontCard(qrData);
  const back = backCard();
  const frontInner = front.match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1];
  const backInner = back.match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1];

  const combined = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="720" viewBox="0 0 1920 720">
    <g transform="translate(45 85)">${frontInner}</g>
    <g transform="translate(1025 85)">${backInner}</g>
  </svg>`;

  fs.writeFileSync(path.join(outputDir, "scanme-business-card-luxury-front.svg"), front);
  fs.writeFileSync(path.join(outputDir, "scanme-business-card-luxury-back.svg"), back);
  fs.writeFileSync(path.join(outputDir, "scanme-business-card-luxury-2d.svg"), combined);

  await sharp(Buffer.from(front)).png().toFile(path.join(outputDir, "scanme-business-card-luxury-front.png"));
  await sharp(Buffer.from(back)).png().toFile(path.join(outputDir, "scanme-business-card-luxury-back.png"));
  await sharp(Buffer.from(combined)).png().toFile(path.join(outputDir, "scanme-business-card-luxury-2d.png"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
