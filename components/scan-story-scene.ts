import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { AUREA_METRICS, formatReviewCount } from "@/components/scan-story-data";

export type ScanStoryTheme = "light" | "dark";

type ScanScenePalette = {
  background: string;
  panel: string;
  lime: string;
  text: string;
  muted: string;
  accentText: string;
  line: string;
  lineSoft: string;
  lineMedium: string;
  limeSoft: string;
  limeLine: string;
  card: string;
  featuredCard: string;
  badge: string;
  metal: string;
  accentPlate: string;
  accentEmissive: string;
  glass: string;
  qr: string;
  star: string;
  hemisphereSky: string;
  hemisphereGround: string;
  keyLight: string;
  rimLight: string;
  exposure: number;
};

const THEME_PALETTES: Record<ScanStoryTheme, ScanScenePalette> = {
  dark: {
    background: "#1c2221",
    panel: "#10110e",
    lime: "#c6ff4a",
    text: "#f1f3ed",
    muted: "#a7ab9f",
    accentText: "#10110e",
    line: "rgba(241, 243, 237, 0.16)",
    lineSoft: "rgba(241, 243, 237, 0.07)",
    lineMedium: "rgba(241, 243, 237, 0.42)",
    limeSoft: "rgba(198, 255, 74, 0.13)",
    limeLine: "rgba(198, 255, 74, 0.72)",
    card: "rgba(23, 25, 19, 0.96)",
    featuredCard: "rgba(28, 34, 33, 0.98)",
    badge: "rgba(16, 17, 14, 0.96)",
    metal: "#1c2221",
    accentPlate: "#34411f",
    accentEmissive: "#1a240b",
    glass: "#10110e",
    qr: "#a7ab9f",
    star: "#514f47",
    hemisphereSky: "#f1f3ed",
    hemisphereGround: "#171913",
    keyLight: "#f1f3ed",
    rimLight: "#a7ab9f",
    exposure: 0.88,
  },
  light: {
    background: "#e9e5da",
    panel: "#fbf6f8",
    lime: "#c6ff4a",
    text: "#000000",
    muted: "#51444b",
    accentText: "#1c2221",
    line: "rgba(0, 0, 0, 0.16)",
    lineSoft: "rgba(0, 0, 0, 0.07)",
    lineMedium: "rgba(0, 0, 0, 0.32)",
    limeSoft: "rgba(198, 255, 74, 0.2)",
    limeLine: "rgba(114, 151, 32, 0.74)",
    card: "rgba(251, 246, 248, 0.98)",
    featuredCard: "rgba(231, 217, 225, 0.98)",
    badge: "rgba(251, 246, 248, 0.97)",
    metal: "#51444b",
    accentPlate: "#c6ff4a",
    accentEmissive: "#c6ff4a",
    glass: "#fbf6f8",
    qr: "#51444b",
    star: "#51444b",
    hemisphereSky: "#fbf6f8",
    hemisphereGround: "#e7d9e1",
    keyLight: "#fbf6f8",
    rimLight: "#51444b",
    exposure: 0.96,
  },
};

const QR_SIZE = 25;
const QR_STEP = 0.176;
const QR_TOP_ROW_Y = ((QR_SIZE - 1) / 2) * QR_STEP;
const POST_REVIEW_RATING = AUREA_METRICS.final.rating + 0.1;
const POST_REVIEW_COUNT = AUREA_METRICS.final.reviews + 1;

const GOOGLE_PALETTES = {
  dark: {
    background: "#202124",
    surface: "#292a2d",
    featured: "#303134",
    text: "#e8eaed",
    muted: "#bdc1c6",
    line: "#3c4043",
    track: "#454a59",
    yellow: "#fbbc04",
    blue: "#8ab4f8",
    green: "#81c995",
  },
  light: {
    background: "#ffffff",
    surface: "#ffffff",
    featured: "#f8fafd",
    text: "#202124",
    muted: "#5f6368",
    line: "#dadce0",
    track: "#e8eaed",
    yellow: "#f9ab00",
    blue: "#1a73e8",
    green: "#188038",
  },
} as const;

export type ScanSceneState = {
  intro: number;
  scan: number;
  review: number;
  metrics: number;
  local: number;
  rank: number;
  settle: number;
};

export type ScanStoryScene = {
  state: ScanSceneState;
  render: (time?: number) => boolean;
  resize: (width: number, height: number) => void;
  setTheme: (theme: ScanStoryTheme) => void;
  dispose: () => void;
};

type CanvasSurface = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
};

type Restaurant = {
  name: string;
  rating: number;
  reviews: number;
  category: string;
  status: string;
  featured?: boolean;
};

const RESTAURANTS: Restaurant[] = [
  {
    name: "Alternativa 1",
    rating: 4.7,
    reviews: 812,
    category: "Restoran · 0,7 km",
    status: "Otvoreno · Zatvara se u 23:30",
  },
  {
    name: "Alternativa 2",
    rating: 4.6,
    reviews: 638,
    category: "Restoran · 1,1 km",
    status: "Otvoreno · Zatvara se u 00:00",
  },
  {
    name: "Vaš restoran",
    rating: POST_REVIEW_RATING,
    reviews: POST_REVIEW_COUNT,
    category: "Restoran · 0,9 km",
    status: "Otvoreno · Zatvara se u 01:00",
    featured: true,
  },
];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const lerp = (from: number, to: number, progress: number) =>
  THREE.MathUtils.lerp(from, to, clamp01(progress));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

function makeSurface(
  width: number,
  height: number,
  anisotropy: number,
): CanvasSurface {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable.");

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(anisotropy, 4);
  texture.needsUpdate = true;
  return { canvas, context, texture };
}

function setFont(
  context: CanvasRenderingContext2D,
  weight: number,
  size: number,
  fontFamily: string,
) {
  context.font = `${weight} ${size}px ${fontFamily}`;
}

function traceRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
) {
  traceRoundedRect(context, x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
}

function strokeRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  stroke: string,
  lineWidth = 2,
) {
  traceRoundedRect(context, x, y, width, height, radius);
  context.strokeStyle = stroke;
  context.lineWidth = lineWidth;
  context.stroke();
}

function drawGoogleMark(
  context: CanvasRenderingContext2D,
  googleImage: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
) {
  fillRoundedRect(context, x, y, size, size, size / 2, "#ffffff");
  if (googleImage) {
    const inset = size * 0.03;
    context.drawImage(googleImage, x + inset, y + inset, size - inset * 2, size - inset * 2);
    return;
  }

  context.save();
  context.fillStyle = "#5f6368";
  context.font = `700 ${Math.round(size * 0.52)}px Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("G", x + size / 2, y + size * 0.52);
  context.restore();
}

function loadGoogleMark() {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = "/brand/google-g.png";
  });
}

function loadImageAsset(source: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function loadGoogleLogoModel() {
  return new Promise<THREE.Group | null>((resolve) => {
    new GLTFLoader().load(
      "/models/google_logo.glb",
      (gltf) => resolve(gltf.scene),
      undefined,
      () => resolve(null),
    );
  });
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(
    image,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function traceStar(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number,
) {
  context.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const radius = point % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    if (point === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function drawRatingStar(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  fillProgress: number,
  fill: string,
  outline: string,
  lineWidth: number,
) {
  traceStar(context, centerX, centerY, radius, radius * 0.48);
  context.strokeStyle = outline;
  context.lineWidth = lineWidth;
  context.lineJoin = "round";
  context.stroke();

  const progress = clamp01(fillProgress);
  if (progress <= 0) return;
  context.save();
  context.beginPath();
  context.rect(centerX - radius, centerY - radius, radius * 2 * progress, radius * 2);
  context.clip();
  traceStar(context, centerX, centerY, radius, radius * 0.48);
  context.fillStyle = fill;
  context.fill();
  context.restore();
}

function drawGenericAvatar(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  theme: ScanStoryTheme,
) {
  const background = theme === "dark" ? "#5f6368" : "#d2e3fc";
  const person = theme === "dark" ? "#e8eaed" : "#5f6368";
  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = background;
  context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  context.fillStyle = person;
  context.beginPath();
  context.arc(centerX, centerY - radius * 0.23, radius * 0.3, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.ellipse(
    centerX,
    centerY + radius * 0.72,
    radius * 0.72,
    radius * 0.62,
    0,
    Math.PI,
    Math.PI * 2,
  );
  context.fill();
  context.restore();
}

function drawReviewSurface(
  surface: CanvasSurface,
  fontFamily: string,
  dataFontFamily: string,
  rating: number,
  reviewCount: number,
  actionProgress: number,
  barRevealProgress: number,
  theme: ScanStoryTheme,
) {
  const { canvas, context } = surface;
  const google = GOOGLE_PALETTES[theme];
  const ratingProgress = clamp01(
    (rating - AUREA_METRICS.initial.rating) /
      (POST_REVIEW_RATING - AUREA_METRICS.initial.rating),
  );
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  traceRoundedRect(context, 18, 18, canvas.width - 36, canvas.height - 36, 64);
  context.clip();
  fillRoundedRect(context, 18, 18, canvas.width - 36, canvas.height - 36, 64, google.background);
  strokeRoundedRect(context, 18, 18, canvas.width - 36, canvas.height - 36, 64, google.line, 3);

  setFont(context, 500, 43, fontFamily);
  context.fillStyle = google.text;
  context.fillText("Vaš restoran", 54, 92);
  context.strokeStyle = google.muted;
  context.lineWidth = 3;
  context.beginPath();
  context.arc(945, 75, 14, 0, Math.PI * 2);
  context.stroke();
  setFont(context, 700, 18, dataFontFamily);
  context.fillStyle = google.muted;
  context.textAlign = "center";
  context.fillText("i", 945, 82);
  context.textAlign = "start";

  const initialBars = [0.42, 0.31, 0.18, 0.08, 0.04];
  const finalBars = [0.93, 0.16, 0.05, 0.018, 0.012];
  setFont(context, 500, 25, dataFontFamily);
  for (let index = 0; index < 5; index += 1) {
    const rowY = 150 + index * 52;
    const targetValue = lerp(initialBars[index], finalBars[index], ratingProgress);
    const value = index === 0 ? targetValue * barRevealProgress : targetValue;
    context.fillStyle = google.muted;
    context.fillText(String(5 - index), 54, rowY + 21);
    fillRoundedRect(context, 92, rowY, 600, 22, 11, google.track);
    fillRoundedRect(
      context,
      92,
      rowY,
      600 * clamp01(value),
      22,
      11,
      google.yellow,
    );
  }

  setFont(context, 450, 106, dataFontFamily);
  context.fillStyle = google.text;
  context.textAlign = "center";
  context.fillText(rating.toFixed(1).replace(".", ","), 840, 250);
  for (let index = 0; index < 5; index += 1) {
    drawRatingStar(context, 756 + index * 42, 310, 17, rating - index, google.yellow, google.muted, 2);
  }
  setFont(context, 450, 26, dataFontFamily);
  context.fillStyle = google.muted;
  context.fillText(`(${formatReviewCount(reviewCount)})`, 840, 363);
  context.textAlign = "start";

  context.strokeStyle = google.line;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(18, 470);
  context.lineTo(canvas.width - 18, 470);
  context.stroke();

  drawGenericAvatar(context, 98, 610, 45, theme);
  for (let index = 0; index < 5; index += 1) {
    const starProgress = clamp01(actionProgress * 5 - index);
    drawRatingStar(
      context,
      215 + index * 116,
      610,
      43,
      starProgress,
      google.yellow,
      google.muted,
      6,
    );
  }

  const tapProgress = smooth((actionProgress - 0.78) / 0.22);
  if (tapProgress > 0 && tapProgress < 1) {
    const ripple = Math.sin(tapProgress * Math.PI);
    context.strokeStyle = google.blue;
    context.globalAlpha = ripple * 0.82;
    context.lineWidth = 5;
    context.beginPath();
    context.arc(679, 610, 49 + tapProgress * 25, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 1;
  }

  if (actionProgress > 0.9) {
    const badgeProgress = smooth((actionProgress - 0.9) / 0.1);
    context.globalAlpha = badgeProgress;
    fillRoundedRect(context, 775, 565, 174, 74, 37, google.featured);
    strokeRoundedRect(context, 775, 565, 174, 74, 37, google.blue, 3);
    setFont(context, 650, 23, dataFontFamily);
    context.fillStyle = google.blue;
    context.textAlign = "center";
    context.fillText("+1 recenzija", 862, 611);
    context.textAlign = "start";
    context.globalAlpha = 1;
  }

  context.strokeStyle = google.line;
  context.beginPath();
  context.moveTo(18, 744);
  context.lineTo(canvas.width - 18, 744);
  context.stroke();

  context.restore();
  surface.texture.needsUpdate = true;
}

function drawLocalBackdrop(
  surface: CanvasSurface,
  fontFamily: string,
  dataFontFamily: string,
  googleImage: HTMLImageElement | null,
  mapImage: HTMLImageElement | null,
  theme: ScanStoryTheme,
) {
  const { canvas, context } = surface;
  const google = GOOGLE_PALETTES[theme];
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  traceRoundedRect(context, 18, 18, canvas.width - 36, canvas.height - 36, 64);
  context.clip();
  if (mapImage) drawImageCover(context, mapImage, canvas.width, canvas.height);
  else {
    context.fillStyle = theme === "dark" ? "#263238" : "#e8f0fe";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.fillStyle = theme === "dark" ? "rgba(18, 20, 22, 0.3)" : "rgba(255, 255, 255, 0.08)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  fillRoundedRect(context, 18, 18, canvas.width - 36, canvas.height - 36, 64, "rgba(0,0,0,0)");
  strokeRoundedRect(context, 18, 18, canvas.width - 36, canvas.height - 36, 64, google.line, 3);

  fillRoundedRect(context, 56, 48, 620, 88, 44, google.background);
  strokeRoundedRect(context, 56, 48, 620, 88, 44, google.line, 2);
  drawGoogleMark(context, googleImage, 78, 66, 52);
  setFont(context, 520, 32, fontFamily);
  context.fillStyle = google.text;
  context.fillText("restorani u blizini", 152, 103);
  setFont(context, 600, 17, dataFontFamily);
  context.fillStyle = google.muted;
  context.fillText("GOOGLE MAPE · TRI REZULTATA", 70, 174);
  context.restore();
  surface.texture.needsUpdate = true;
}

function drawRestaurantCard(
  surface: CanvasSurface,
  fontFamily: string,
  dataFontFamily: string,
  restaurant: Restaurant,
  rank: number,
  theme: ScanStoryTheme,
) {
  const { canvas, context } = surface;
  const google = GOOGLE_PALETTES[theme];
  context.clearRect(0, 0, canvas.width, canvas.height);
  const background = restaurant.featured ? google.featured : google.surface;
  fillRoundedRect(context, 4, 4, canvas.width - 8, canvas.height - 8, 28, background);
  strokeRoundedRect(
    context,
    4,
    4,
    canvas.width - 8,
    canvas.height - 8,
    28,
    restaurant.featured ? google.blue : google.line,
    restaurant.featured ? 4 : 2,
  );

  fillRoundedRect(
    context,
    18,
    18,
    82,
    canvas.height - 36,
    22,
    restaurant.featured ? google.blue : google.background,
  );
  setFont(context, 700, 38, dataFontFamily);
  context.fillStyle = restaurant.featured ? "#ffffff" : google.muted;
  context.textAlign = "center";
  context.fillText(String(rank).padStart(2, "0"), 59, 98);
  context.textAlign = "start";

  setFont(context, 650, 32, fontFamily);
  context.fillStyle = google.text;
  context.fillText(restaurant.name, 128, 51);

  setFont(context, 520, 23, dataFontFamily);
  context.fillStyle = google.muted;
  context.fillText(restaurant.rating.toFixed(1).replace(".", ","), 128, 91);
  for (let index = 0; index < 5; index += 1) {
    drawRatingStar(
      context,
      190 + index * 34,
      84,
      13,
      restaurant.rating - index,
      google.yellow,
      google.yellow,
      2,
    );
  }
  context.fillStyle = google.muted;
  context.fillText(`(${formatReviewCount(restaurant.reviews)})`, 372, 91);

  setFont(context, 450, 20, fontFamily);
  context.fillStyle = google.muted;
  context.fillText(restaurant.category, 128, 132);
  context.fillStyle = google.green;
  context.fillText(restaurant.status, 430, 132);

  fillRoundedRect(context, 808, 31, 188, 98, 26, google.background);
  strokeRoundedRect(context, 808, 31, 188, 98, 26, restaurant.featured ? google.blue : google.line, 2);
  setFont(context, 600, 19, fontFamily);
  context.fillStyle = restaurant.featured ? google.blue : google.text;
  context.textAlign = "center";
  context.fillText(restaurant.featured ? "Vaš profil" : "Detalji", 902, 88);
  context.textAlign = "start";
  surface.texture.needsUpdate = true;
}

function qrCellActive(row: number, column: number, size: number) {
  const finder = (originRow: number, originColumn: number) => {
    const localRow = row - originRow;
    const localColumn = column - originColumn;
    if (localRow < 0 || localRow > 6 || localColumn < 0 || localColumn > 6) return false;
    const outer = localRow === 0 || localRow === 6 || localColumn === 0 || localColumn === 6;
    const center = localRow >= 2 && localRow <= 4 && localColumn >= 2 && localColumn <= 4;
    return outer || center;
  };

  if (finder(0, 0) || finder(0, size - 7) || finder(size - 7, 0)) return true;
  const inFinderQuietZone =
    (row <= 7 && column <= 7) ||
    (row <= 7 && column >= size - 8) ||
    (row >= size - 8 && column <= 7);
  if (inFinderQuietZone) return false;
  if (row === 6 || column === 6) return (row + column) % 2 === 0;
  const hash = (row * 73 + column * 151 + row * column * 19 + 17) % 101;
  return hash < 44 || ((row + column) % 11 === 0 && hash < 72);
}

function createQrPositions(size = QR_SIZE) {
  const positions: THREE.Vector3[] = [];
  const seeds: number[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!qrCellActive(row, column, size)) continue;
      positions.push(
        new THREE.Vector3(
          (column - (size - 1) / 2) * QR_STEP,
          ((size - 1) / 2 - row) * QR_STEP,
          0.31,
        ),
      );
      seeds.push(((row * 31 + column * 47) % 97) / 97);
    }
  }
  return { positions, seeds };
}

function createReviewTargets(starts: THREE.Vector3[]) {
  const orderedStarts = starts
    .map((position, index) => ({ position, index }))
    .sort((a, b) => a.position.x - b.position.x || b.position.y - a.position.y);
  const targets = Array.from({ length: starts.length }, () => new THREE.Vector3());
  const rows = 4;
  const columns = Math.ceil(starts.length / rows);
  const barStartX = -2.21;
  const barWidth = 1.33;
  const barCenterY = 1.86;
  orderedStarts.forEach(({ index }, order) => {
    const column = order % columns;
    const row = Math.floor(order / columns);
    targets[index].set(
      lerp(barStartX, barStartX + barWidth, column / Math.max(1, columns - 1)),
      barCenterY + (row - (rows - 1) / 2) * 0.034,
      0.43 + ((order * 17) % 7) * 0.002,
    );
  });
  return targets;
}

function createRoundedRectShape(width: number, height: number, radius: number) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth + radius, -halfHeight);
  shape.lineTo(halfWidth - radius, -halfHeight);
  shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + radius);
  shape.lineTo(halfWidth, halfHeight - radius);
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - radius, halfHeight);
  shape.lineTo(-halfWidth + radius, halfHeight);
  shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - radius);
  shape.lineTo(-halfWidth, -halfHeight + radius);
  shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + radius, -halfHeight);
  shape.closePath();
  return shape;
}

function makeLimeMaterial(palette: ScanScenePalette) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.accentPlate),
    emissive: new THREE.Color(palette.accentEmissive),
    emissiveIntensity: 0.12,
    metalness: 0.18,
    roughness: 0.4,
  });
}

export async function createScanStoryScene(
  canvas: HTMLCanvasElement,
  fontFamily: string,
  initialTheme: ScanStoryTheme = "dark",
): Promise<ScanStoryScene> {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  try {
    return await buildScanStoryScene(renderer, fontFamily, initialTheme);
  } catch (error) {
    renderer.dispose();
    renderer.forceContextLoss();
    throw error;
  }
}

async function buildScanStoryScene(
  renderer: THREE.WebGLRenderer,
  fontFamily: string,
  initialTheme: ScanStoryTheme,
): Promise<ScanStoryScene> {
  let currentTheme = initialTheme;
  let palette = THEME_PALETTES[currentTheme];
  const dataFontFamily = getComputedStyle(document.body).fontFamily || "monospace";
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = palette.exposure;
  renderer.setClearColor(palette.background, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 40);
  camera.position.set(0.08, 0.04, 11.55);

  const state: ScanSceneState = {
    intro: 0,
    scan: 0,
    review: 0,
    metrics: 0,
    local: 0,
    rank: 0,
    settle: 0,
  };

  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(room, 0.04);
  scene.environment = environmentTarget.texture;
  pmrem.dispose();
  room.dispose();

  const hemisphere = new THREE.HemisphereLight(
    palette.hemisphereSky,
    palette.hemisphereGround,
    currentTheme === "light" ? 0.88 : 0.82,
  );
  const keyLight = new THREE.DirectionalLight(
    palette.keyLight,
    currentTheme === "light" ? 1.18 : 1.5,
  );
  keyLight.position.set(5.4, 5.6, 2.4);
  const rimLight = new THREE.DirectionalLight(
    palette.rimLight,
    currentTheme === "light" ? 0.46 : 0.82,
  );
  rimLight.position.set(-4.8, -1.2, 2.1);
  const scanLight = new THREE.PointLight(0xc6ff4a, 0, 7, 2);
  scanLight.position.set(0, 3, 2.2);
  scene.add(hemisphere, keyLight, rimLight, scanLight);

  const productRig = new THREE.Group();
  scene.add(productRig);

  const metalMaterial = new THREE.MeshStandardMaterial({
    color: palette.metal,
    metalness: currentTheme === "light" ? 0.46 : 0.76,
    roughness: currentTheme === "light" ? 0.52 : 0.4,
    envMapIntensity: currentTheme === "light" ? 0.42 : 0.62,
  });
  const chassisGeometry = new RoundedBoxGeometry(5.95, 5.95, 0.62, 6, 0.29);
  const chassis = new THREE.Mesh(chassisGeometry, metalMaterial);
  productRig.add(chassis);

  const limeMaterial = makeLimeMaterial(palette);
  limeMaterial.emissiveIntensity = currentTheme === "light" ? 0.035 : 0.12;
  const accentGeometry = new THREE.ShapeGeometry(createRoundedRectShape(5.72, 5.72, 0.35), 12);
  const accentPlate = new THREE.Mesh(accentGeometry, limeMaterial);
  accentPlate.position.z = 0.316;
  productRig.add(accentPlate);

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: palette.glass,
    metalness: currentTheme === "light" ? 0.02 : 0.08,
    roughness: currentTheme === "light" ? 0.7 : 0.78,
    clearcoat: 0.06,
    clearcoatRoughness: 0.82,
    envMapIntensity: currentTheme === "light" ? 0.08 : 0.04,
  });
  const glassGeometry = new THREE.ShapeGeometry(createRoundedRectShape(5.58, 5.58, 0.3), 12);
  const glassFront = new THREE.Mesh(glassGeometry, glassMaterial);
  glassFront.position.z = 0.328;
  productRig.add(glassFront);

  const qrData = createQrPositions();
  const qrTargets = createReviewTargets(qrData.positions);
  const qrGeometry = new RoundedBoxGeometry(0.145, 0.145, 0.105, 2, 0.032);
  const qrScanY = { value: 4 };
  const qrScanStrength = { value: 0 };
  const qrMaterial = new THREE.MeshStandardMaterial({
    color: palette.qr,
    metalness: currentTheme === "light" ? 0.12 : 0.28,
    roughness: currentTheme === "light" ? 0.5 : 0.36,
    emissive: 0x000000,
    emissiveIntensity: 0,
    transparent: true,
    opacity: 1,
  });
  const qrGoogleYellow = new THREE.Color(GOOGLE_PALETTES.dark.yellow);
  qrMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uScanY = qrScanY;
    shader.uniforms.uScanStrength = qrScanStrength;
    shader.vertexShader = `uniform float uScanY;\nuniform float uScanStrength;\nvarying float vScanWave;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       vScanWave = 0.0;
       #ifdef USE_INSTANCING
         float scanDistance = instanceMatrix[3].y - uScanY;
         vScanWave = (1.0 - smoothstep(0.038, 0.082, abs(scanDistance))) * uScanStrength;
         transformed.xy *= 1.0 + vScanWave * 0.12;
         transformed.z += vScanWave * 0.3;
       #endif`,
    );
    shader.fragmentShader = `varying float vScanWave;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.565, 1.0, 0.068), vScanWave * 0.94);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
       totalEmissiveRadiance += vec3(0.48, 0.88, 0.04) * vScanWave * 1.1;`,
    );
  };
  qrMaterial.customProgramCacheKey = () => "scanme-rounded-row-scan-v2";

  const qrMesh = new THREE.InstancedMesh(qrGeometry, qrMaterial, qrData.positions.length);
  qrMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  qrMesh.position.z = 0.02;
  qrMesh.frustumCulled = false;
  productRig.add(qrMesh);

  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const [googleImage, mapImage, googleLogoModel] = await Promise.all([
    loadGoogleMark(),
    loadImageAsset("/scan-story-map.png"),
    loadGoogleLogoModel(),
  ]);

  const googleLogoRig = new THREE.Group();
  const googleLogoSpinner = new THREE.Group();
  googleLogoRig.add(googleLogoSpinner);
  productRig.add(googleLogoRig);
  if (googleLogoModel) {
    const bounds = new THREE.Box3().setFromObject(googleLogoModel);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z) || 1;
    googleLogoModel.position.sub(center);
    googleLogoModel.scale.setScalar(1 / maxDimension);
    googleLogoModel.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = false;
      object.receiveShadow = false;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        material.depthWrite = true;
        material.needsUpdate = true;
      });
    });
    googleLogoSpinner.add(googleLogoModel);
  }
  googleLogoRig.position.set(0, 0, 0.92);
  googleLogoRig.scale.setScalar(0.84);
  googleLogoRig.visible = Boolean(googleLogoModel);

  const reviewSurface = makeSurface(1024, 1024, anisotropy);
  drawReviewSurface(
    reviewSurface,
    fontFamily,
    dataFontFamily,
    AUREA_METRICS.initial.rating,
    AUREA_METRICS.initial.reviews,
    0,
    0,
    currentTheme,
  );
  const reviewMaterial = new THREE.MeshBasicMaterial({
    map: reviewSurface.texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  });
  const reviewGeometry = new THREE.PlaneGeometry(5.42, 5.42);
  const reviewPanel = new THREE.Mesh(reviewGeometry, reviewMaterial);
  reviewPanel.position.z = 0.36;
  productRig.add(reviewPanel);

  const localFace = new THREE.Group();
  localFace.rotation.y = Math.PI;
  localFace.position.z = -0.315;
  productRig.add(localFace);

  const localBackdropSurface = makeSurface(1024, 1024, anisotropy);
  drawLocalBackdrop(
    localBackdropSurface,
    fontFamily,
    dataFontFamily,
    googleImage,
    mapImage,
    currentTheme,
  );
  const localBackdropMaterial = new THREE.MeshBasicMaterial({
    map: localBackdropSurface.texture,
    transparent: true,
    toneMapped: false,
  });
  const localBackdropGeometry = new THREE.PlaneGeometry(5.58, 5.58);
  const localBackdrop = new THREE.Mesh(localBackdropGeometry, localBackdropMaterial);
  localBackdrop.position.z = 0.015;
  localFace.add(localBackdrop);

  const rowGeometry = new THREE.PlaneGeometry(4.86, 0.76);
  const rowGroups: THREE.Group[] = [];
  const rowSurfaces: CanvasSurface[] = [];
  const rowRanks = [1, 2, 3];
  const slotY = [-0.66, -1.48, -2.3];
  RESTAURANTS.forEach((restaurant, index) => {
    const surface = makeSurface(1024, 160, anisotropy);
    drawRestaurantCard(
      surface,
      fontFamily,
      dataFontFamily,
      restaurant,
      index + 1,
      currentTheme,
    );
    rowSurfaces.push(surface);
    const material = new THREE.MeshBasicMaterial({
      map: surface.texture,
      transparent: true,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(rowGeometry, material);
    const group = new THREE.Group();
    group.position.set(0, slotY[index], 0.055 + index * 0.002);
    group.add(mesh);
    localFace.add(group);
    rowGroups.push(group);
  });

  const dummy = new THREE.Object3D();
  let lastRating = -1;
  let lastReviews = -1;
  let lastReviewAction = -1;
  let lastBarReveal = -1;
  let lastReviewProgress = -1;
  let currentWidth = 1;
  let currentHeight = 1;
  let usePostprocessing = false;
  let disposed = false;

  let composer: EffectComposer | null = null;
  let renderPass: RenderPass | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  let outputPass: OutputPass | null = null;

  function ensurePostprocessing() {
    if (composer) return;
    composer = new EffectComposer(renderer);
    renderPass = new RenderPass(scene, camera);
    bloomPass = new UnrealBloomPass(new THREE.Vector2(512, 512), 0, 0.12, 0.92);
    outputPass = new OutputPass();
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(outputPass);
  }

  function updateQrInstances(reviewProgress: number) {
    if (Math.abs(reviewProgress - lastReviewProgress) < 0.0001) return;
    lastReviewProgress = reviewProgress;
    const travel = smooth(reviewProgress / 0.7);
    const fusion = smooth((reviewProgress - 0.62) / 0.38);
    const liftEnvelope = Math.sin(travel * Math.PI);
    for (let index = 0; index < qrData.positions.length; index += 1) {
      const start = qrData.positions[index];
      const target = qrTargets[index];
      const seed = qrData.seeds[index];
      dummy.position.set(
        lerp(start.x, target.x, travel),
        lerp(start.y, target.y, travel),
        lerp(start.z, target.z, travel) + liftEnvelope * (0.3 + seed * 0.6),
      );
      dummy.rotation.set(
        liftEnvelope * (seed - 0.5) * 0.7,
        liftEnvelope * (0.25 + seed * 0.8),
        liftEnvelope * (seed - 0.5) * 0.42,
      );
      const scale = lerp(1, 0.62, travel) * lerp(1, 0.035, fusion);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      qrMesh.setMatrixAt(index, dummy.matrix);
    }
    qrMesh.instanceMatrix.needsUpdate = true;
  }

  function updateMetrics() {
    const countProgress = smooth(state.metrics / 0.78);
    const actionProgress = smooth((state.metrics - 0.78) / 0.22);
    const ratingBoost = smooth((actionProgress - 0.82) / 0.18) * 0.1;
    const rating =
      Math.round(
        (lerp(AUREA_METRICS.initial.rating, AUREA_METRICS.final.rating, countProgress) +
          ratingBoost) *
          10,
      ) / 10;
    const reviews =
      Math.round(
        lerp(AUREA_METRICS.initial.reviews, AUREA_METRICS.final.reviews, countProgress),
      ) + (actionProgress > 0.9 ? 1 : 0);
    const quantizedAction = Math.round(actionProgress * 50) / 50;
    const quantizedBarReveal = Math.round(smooth(state.review) * 50) / 50;
    if (
      rating === lastRating &&
      reviews === lastReviews &&
      quantizedAction === lastReviewAction &&
      quantizedBarReveal === lastBarReveal
    ) {
      return;
    }
    lastRating = rating;
    lastReviews = reviews;
    lastReviewAction = quantizedAction;
    lastBarReveal = quantizedBarReveal;
    drawReviewSurface(
      reviewSurface,
      fontFamily,
      dataFontFamily,
      rating,
      reviews,
      quantizedAction,
      quantizedBarReveal,
      currentTheme,
    );
  }

  function redrawThemeSurfaces() {
    const countProgress = smooth(state.metrics / 0.78);
    const actionProgress = smooth((state.metrics - 0.78) / 0.22);
    const ratingBoost = smooth((actionProgress - 0.82) / 0.18) * 0.1;
    const rating =
      Math.round(
        (lerp(AUREA_METRICS.initial.rating, AUREA_METRICS.final.rating, countProgress) +
          ratingBoost) *
          10,
      ) / 10;
    const reviews =
      Math.round(
        lerp(AUREA_METRICS.initial.reviews, AUREA_METRICS.final.reviews, countProgress),
      ) + (actionProgress > 0.9 ? 1 : 0);

    drawReviewSurface(
      reviewSurface,
      fontFamily,
      dataFontFamily,
      rating,
      reviews,
      actionProgress,
      smooth(state.review),
      currentTheme,
    );
    drawLocalBackdrop(
      localBackdropSurface,
      fontFamily,
      dataFontFamily,
      googleImage,
      mapImage,
      currentTheme,
    );
    rowSurfaces.forEach((surface, index) => {
      drawRestaurantCard(
        surface,
        fontFamily,
        dataFontFamily,
        RESTAURANTS[index],
        rowRanks[index],
        currentTheme,
      );
    });
  }

  function setTheme(theme: ScanStoryTheme) {
    if (disposed || theme === currentTheme) return;
    currentTheme = theme;
    palette = THEME_PALETTES[currentTheme];

    renderer.toneMappingExposure = palette.exposure;
    renderer.setClearColor(palette.background, 0);
    hemisphere.color.set(palette.hemisphereSky);
    hemisphere.groundColor.set(palette.hemisphereGround);
    hemisphere.intensity = currentTheme === "light" ? 0.88 : 0.82;
    keyLight.color.set(palette.keyLight);
    keyLight.intensity = currentTheme === "light" ? 1.18 : 1.5;
    rimLight.color.set(palette.rimLight);
    rimLight.intensity = currentTheme === "light" ? 0.46 : 0.82;
    scanLight.color.set(palette.lime);

    metalMaterial.color.set(palette.metal);
    metalMaterial.metalness = currentTheme === "light" ? 0.46 : 0.76;
    metalMaterial.roughness = currentTheme === "light" ? 0.52 : 0.4;
    metalMaterial.envMapIntensity = currentTheme === "light" ? 0.42 : 0.62;

    limeMaterial.color.set(palette.accentPlate);
    limeMaterial.emissive.set(palette.accentEmissive);
    limeMaterial.emissiveIntensity = currentTheme === "light" ? 0.035 : 0.12;

    glassMaterial.color.set(palette.glass);
    glassMaterial.metalness = currentTheme === "light" ? 0.02 : 0.08;
    glassMaterial.roughness = currentTheme === "light" ? 0.7 : 0.78;
    glassMaterial.envMapIntensity = currentTheme === "light" ? 0.08 : 0.04;

    qrMaterial.color.set(palette.qr);
    qrMaterial.metalness = currentTheme === "light" ? 0.12 : 0.28;
    qrMaterial.roughness = currentTheme === "light" ? 0.5 : 0.36;

    redrawThemeSurfaces();
    render();
  }

  function applyState() {
    const intro = smooth(state.intro);
    const review = smooth(state.review);
    const local = smooth(state.local);
    const rank = smooth(state.rank);
    const settle = smooth(state.settle);

    const primaryScanOpacity = Math.pow(Math.sin(clamp01(state.scan) * Math.PI), 0.72);
    const transitionScanOpacity = Math.sin(clamp01(state.local) * Math.PI) * 0.38;
    const useTransitionScan = transitionScanOpacity > primaryScanOpacity;
    const scanOpacity = Math.max(primaryScanOpacity, transitionScanOpacity);
    const scanY = useTransitionScan
      ? lerp(-2.8, 2.8, state.local)
      : lerp(3.05, -3.05, state.scan);
    const scanRowY = THREE.MathUtils.clamp(
      QR_TOP_ROW_Y - Math.round((QR_TOP_ROW_Y - scanY) / QR_STEP) * QR_STEP,
      -QR_TOP_ROW_Y,
      QR_TOP_ROW_Y,
    );

    scanLight.position.y = scanRowY;
    scanLight.intensity = scanOpacity * 0.14;
    qrScanY.value = scanRowY;
    qrScanStrength.value = primaryScanOpacity;

    updateQrInstances(review);
    const fusion = smooth((review - 0.62) / 0.38);
    const fusionPulse = Math.sin(fusion * Math.PI);
    qrMaterial.color.set(palette.qr).lerp(qrGoogleYellow, fusion);
    qrMaterial.opacity = 1 - smooth((review - 0.62) / 0.32);
    qrMesh.visible = state.local < 0.55 && qrMaterial.opacity > 0.01;

    const logoTravel = smooth((review - 0.12) / 0.7);
    const logoExit = 1 - smooth(local / 0.34);
    googleLogoRig.position.set(0, lerp(0, -1.94, logoTravel), 0.92 + logoTravel * 0.04);
    googleLogoRig.scale.setScalar(lerp(0.84, 0.96, logoTravel) * logoExit);
    googleLogoRig.visible = Boolean(googleLogoModel) && logoExit > 0.01;

    reviewMaterial.opacity = smooth((review - 0.08) / 0.5) * (1 - smooth(local / 0.55));
    reviewPanel.visible = state.local < 0.58 && reviewMaterial.opacity > 0.005;
    updateMetrics();

    if (bloomPass) {
      bloomPass.strength = Math.max(
        scanOpacity * 0.055,
        fusionPulse * 0.34,
        Math.sin(rank * Math.PI) * 0.14,
      );
    }

    const reviewOcclusion = Math.sin(review * Math.PI);
    productRig.rotation.set(
      lerp(0.045, -0.018, intro) - reviewOcclusion * 0.05,
      lerp(-0.085, 0.035, intro) + reviewOcclusion * 1.08 + local * Math.PI,
      lerp(-0.012, 0.008, intro) + reviewOcclusion * 0.018,
    );
    productRig.position.set(
      lerp(0.14, 0, intro),
      lerp(0.18, 0, intro) + Math.sin(review * Math.PI) * 0.06,
      lerp(-0.12, 0, intro),
    );
    const productScale = lerp(0.94, 1, intro) - Math.sin(local * Math.PI) * 0.035;
    productRig.scale.setScalar(productScale);

    rowGroups.forEach((group, index) => {
      const finalRank = index === 2 ? 1 : index + 2;
      const reorderArc = Math.sin(rank * Math.PI);
      group.position.x = index === 2 ? reorderArc * 0.42 : -reorderArc * 0.06;
      group.position.y = lerp(slotY[index], slotY[finalRank - 1], rank);
      group.position.z =
        index === 2 ? 0.14 + reorderArc * 0.46 : 0.055 + index * 0.004;
      const displayedRank = Math.round(lerp(index + 1, finalRank, rank));
      if (rowRanks[index] !== displayedRank) {
        rowRanks[index] = displayedRank;
        drawRestaurantCard(
          rowSurfaces[index],
          fontFamily,
          dataFontFamily,
          RESTAURANTS[index],
          displayedRank,
          currentTheme,
        );
      }
      const featurePulse = index === 2 ? reorderArc * 0.035 : 0;
      group.scale.setScalar(1 + featurePulse);
    });

    camera.position.set(
      lerp(0.16, 0.02, intro) - reviewOcclusion * 0.12,
      lerp(0.09, 0, intro) + rank * 0.08,
      lerp(11.85, 11.48, intro) + Math.sin(local * Math.PI) * 0.32 + settle * 0.18
        - primaryScanOpacity * 0.14,
    );
    camera.lookAt(0, rank * 0.08, 0);
  }

  function resize(width: number, height: number) {
    if (disposed) return;
    currentWidth = Math.max(1, Math.round(width));
    currentHeight = Math.max(1, Math.round(height));
    const mobile = currentWidth < 640;
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
    usePostprocessing = window.innerWidth >= 768;
    if (usePostprocessing) ensurePostprocessing();
    renderer.setPixelRatio(dpr);
    renderer.setSize(currentWidth, currentHeight, false);
    if (composer) {
      composer.setPixelRatio(dpr);
      composer.setSize(currentWidth, currentHeight);
    }
    camera.aspect = currentWidth / currentHeight;
    camera.fov = mobile ? 34 : 31;
    camera.updateProjectionMatrix();
  }

  function render(time = performance.now()) {
    if (disposed) return false;
    googleLogoSpinner.rotation.y = (time * 0.00072) % (Math.PI * 2);
    applyState();
    if (usePostprocessing && composer) composer.render();
    else renderer.render(scene, camera);
    return googleLogoRig.visible;
  }

  const initialRect = renderer.domElement.getBoundingClientRect();
  resize(initialRect.width || 640, initialRect.height || 640);
  updateQrInstances(0);
  applyState();
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    renderer.compile(scene, camera);
  }
  render();

  return {
    state,
    render,
    resize,
    setTheme,
    dispose() {
      if (disposed) return;
      disposed = true;

      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
        meshMaterials.forEach((material) => {
          materials.add(material);
          Object.values(material).forEach((value) => {
            if (value instanceof THREE.Texture) textures.add(value);
          });
        });
      });
      rowSurfaces.forEach((surface) => textures.add(surface.texture));
      [reviewSurface, localBackdropSurface].forEach((surface) =>
        textures.add(surface.texture),
      );

      textures.forEach((texture) => texture.dispose());
      materials.forEach((material) => material.dispose());
      geometries.forEach((geometry) => geometry.dispose());
      environmentTarget.dispose();
      renderPass?.dispose();
      bloomPass?.dispose();
      outputPass?.dispose();
      composer?.dispose();
      renderer.renderLists.dispose();
      renderer.dispose();
      scene.clear();
    },
  };
}
