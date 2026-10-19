// Studio: okruženje iz RoomEnvironment (bez HDR fajla, odluka E18), dva svetla bez senki, pod koji
// se pretapa u pozadinu #0A0D11 i meka kontaktna senka ispod auta.
//
// A10: lak dobija drugu verziju iste sobe, sa četiri duge svetle trake na zidovima u visini
// horizonta (kao softboksovi u studiju za fotografisanje auta). Clearcoat na bokovima i vratima tako
// odražava jasnu svetlu liniju, a ne samo sivi zid. Rendgen i kostur ostaju na izvornoj sobi.

import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  type InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  PlaneGeometry,
  type Scene,
  type WebGLRenderTarget,
  type WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

function radialTexture(width: number, height: number, stops: Array<[number, number]>): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(width / 2, height / 2);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const [at, v] of stops) g.addColorStop(at, `rgb(${v},${v},${v})`);
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  const t = new CanvasTexture(canvas);
  t.needsUpdate = true;
  return t;
}

/** Svetle trake u sobi za lak: [x, y, z, širina x, visina, dubina z, jačina]. */
const PAINT_STRIPS: ReadonlyArray<readonly [number, number, number, number, number, number, number]> = [
  [-15.4, 2.6, 0.5, 0.1, 0.7, 22, 4],
  [14.3, 2.6, 0.5, 0.1, 0.7, 22, 4],
  [-0.5, 2.6, 14.2, 24, 0.7, 0.1, 3.5],
  [-0.5, 2.6, -13.0, 24, 0.7, 0.1, 3],
];

/**
 * Soba posle PMREM-a. `RoomEnvironment.dispose()` oslobađa geometriju i materijale, ali ne i bafer
 * instanci svog InstancedMesh-a (6 kutija), pa je posle odlaska sa strane ostajao po jedan GL bafer
 * po sobi (A12, brojanje živih GL objekata).
 */
function disposeRoom(room: RoomEnvironment) {
  room.traverse((o) => {
    if ((o as InstancedMesh).isInstancedMesh) (o as InstancedMesh).dispose();
  });
  room.dispose();
}

/**
 * Jačine po izgledu. U laku auto osvetljava pre svega okruženje (kao u studiju za fotografisanje):
 * jako direktno svetlo bi tamni metalik pretvorilo u sivu mrlju na haubi i bokovima.
 */
const LIGHTS = {
  xray: { key: 2.2, rim: 0.8, env: 0.6 },
  paint: { key: 1.2, rim: 0.5, env: 1 },
} as const;

/** Zidovi i kutije sobe za lak su tamniji, da svetle trake i paneli daju kontrast na laku. */
const PAINT_ROOM_WALLS = 0.35;

function paintRoom(): RoomEnvironment {
  const room = new RoomEnvironment();
  const walls = new Set<MeshStandardMaterial>();
  room.traverse((o) => {
    const m = (o as Mesh).material;
    if (m instanceof MeshStandardMaterial) walls.add(m);
  });
  for (const m of walls) m.color.multiplyScalar(PAINT_ROOM_WALLS);
  const geometry = new BoxGeometry();
  for (const [x, y, z, sx, sy, sz, intensity] of PAINT_STRIPS) {
    const strip = new Mesh(geometry, new MeshLambertMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: intensity }));
    strip.position.set(x, y, z);
    strip.scale.set(sx, sy, sz);
    room.add(strip);
  }
  return room;
}

export class Studio {
  private pmrem: PMREMGenerator;
  private target: WebGLRenderTarget | null = null;
  private paintTarget: WebGLRenderTarget | null = null;
  private paintLook = false;
  private key: DirectionalLight;
  private rim: DirectionalLight;
  private disposables: Array<{ dispose(): void }> = [];

  constructor(
    private renderer: WebGLRenderer,
    private scene: Scene,
  ) {
    this.pmrem = new PMREMGenerator(renderer);
    this.buildEnvironment();

    const key = new DirectionalLight(new Color("#FFFFFF"), LIGHTS.xray.key);
    key.position.set(3, 5, 4);
    const rim = new DirectionalLight(new Color("#BFE8FF"), LIGHTS.xray.rim);
    this.key = key;
    this.rim = rim;
    rim.position.set(-4, 3, -5);
    scene.add(key, rim);

    // Pod: disk koji se od sredine pretapa u boju pozadine (bez šava sa clear color-om).
    const floorAlpha = radialTexture(256, 256, [
      [0, 255],
      [0.45, 200],
      [1, 0],
    ]);
    const floorMat = new MeshBasicMaterial({ color: "#151A21", transparent: true, alphaMap: floorAlpha, depthWrite: false, toneMapped: false });
    const floorGeo = new CircleGeometry(7, 64);
    const floor = new Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.renderOrder = -2;
    floor.name = "a3_floor";
    floor.raycast = () => {};

    // Kontaktna senka: elipsa ispod auta (širina po x, dužina po z).
    const shadowAlpha = radialTexture(128, 256, [
      [0, 255],
      [0.55, 170],
      [1, 0],
    ]);
    const shadowMat = new MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.6, alphaMap: shadowAlpha, depthWrite: false, toneMapped: false });
    const shadowGeo = new PlaneGeometry(2.5, 5.6);
    const shadow = new Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.002, -0.1);
    shadow.renderOrder = -1;
    shadow.name = "a3_shadow";
    shadow.raycast = () => {};

    scene.add(floor, shadow);
    this.disposables.push(floorAlpha, floorMat, floorGeo, shadowAlpha, shadowMat, shadowGeo);
  }

  /**
   * Posle vraćenog WebGL konteksta: stari PMREM resursi pripadaju izgubljenom kontekstu i ne brišu se
   * (brisanje bi dalo INVALID_OPERATION); pravi se nov generator i novo okruženje.
   */
  rebuildAfterRestore() {
    this.pmrem = new PMREMGenerator(this.renderer);
    this.target = null;
    this.paintTarget = null;
    this.buildEnvironment();
  }

  /** PMREM iz RoomEnvironment (rendgen i kostur) i iz iste sobe sa trakama (lak). */
  buildEnvironment() {
    this.target?.dispose();
    this.paintTarget?.dispose();
    const room = new RoomEnvironment();
    this.target = this.pmrem.fromScene(room, 0.04);
    disposeRoom(room);
    const studio = paintRoom();
    this.paintTarget = this.pmrem.fromScene(studio, 0.02);
    disposeRoom(studio);
    this.applyEnvironment();
  }

  private applyEnvironment() {
    const t = this.paintLook ? this.paintTarget : this.target;
    this.scene.environment = t?.texture ?? null;
  }

  /** Okruženje i jačina po režimu: lak dobija sobu sa trakama i punu jačinu. */
  setLook(lak: boolean) {
    this.paintLook = lak;
    const l = lak ? LIGHTS.paint : LIGHTS.xray;
    this.scene.environmentIntensity = l.env;
    this.key.intensity = l.key;
    this.rim.intensity = l.rim;
    this.applyEnvironment();
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.paintTarget?.dispose();
    this.target?.dispose();
    this.pmrem.dispose();
    this.scene.environment = null;
  }
}
