// Materijali pregledača (A03 §2): rendgen ljuska i staklo (neosvetljen fresnel u dva prolaza), delovi
// u bojama sistema, lak (PBR iz GLB-a, karoserija u izabranoj boji) i isticanje hover/izbor/prigušenje.
// A10: svi materijali delova dele jednu ravan preseka (`clippingPlanes`), a ivica preseka svetli u
// boji sistema dela. Kad je presek isključen, ravan je daleko, pa nema ni novog programa ni troška.
//
// Pravilo slotova je `xrayKind` iz lib/auto3d/xray.ts (isto kao `apply_xray` u 3d/auto3d/lib/views.py).

import {
  BackSide,
  Color,
  DoubleSide,
  FrontSide,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Material,
  type Plane,
  type Side,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { SYSTEMS, type SystemId } from "@/lib/auto3d/catalog";
import { lighten } from "@/lib/auto3d/color";
import { DEFAULT_PAINT, paintById } from "@/lib/auto3d/paints";
import { xrayKind, type XrayKind } from "@/lib/auto3d/xray";
import type { Mode } from "@/lib/auto3d/filter";
import type { XrayLook } from "@/lib/auto3d/manifest";
import type { MeshTag, Registry } from "./registry";

type U<T> = { value: T };

/** Uniform-i jednog dela (sve instance i svi slotovi dela dele isti objekat). */
export type PartUniforms = {
  hover: U<number>;
  select: U<number>;
  dim: U<number>;
  /** Providnost rendgen ljuske (1 normalno, manje kad je deo prigušen). */
  fade: U<number>;
  hiColor: U<Color>;
  /** Boja ivice preseka (boja sistema, posvetljena). */
  cut: U<Color>;
};

/** Lak karoserije: boja i parametri (lib/auto3d/paints.ts). */
export type PaintLook = { hex: string; metalness: number; roughness: number };

type Kind = XrayKind;

type Rec = {
  mesh: Mesh;
  tag: MeshTag;
  u: PartUniforms;
  kind: Kind;
  xray: Material;
  front: Mesh | null;
  lak: Material;
  lakOpacity: number;
  lakTransparent: boolean;
};

const SYSTEM_COLOR = new Map<SystemId, string>(SYSTEMS.map((s) => [s.id, s.color]));
const SELECT_COLOR = new Color("#FFFFFF");

export const DEFAULT_PAINT_LOOK: PaintLook = paintById(DEFAULT_PAINT);

/**
 * Ivica preseka (A10): udaljenost fragmenta od ravni preseka (iste vrednosti koje three koristi za
 * odsecanje) daje traku stalne širine na ekranu (oko 3 px, najmanje 8 mm) uz svaku presečenu ivicu.
 */
const CUT_BAND = `#if NUM_CLIPPING_PLANES > 0
  float a3Cut = clippingPlanes[ 0 ].w - dot( vClipPosition, clippingPlanes[ 0 ].xyz );
  float a3Band = 1.0 - smoothstep( 0.0, max( fwidth( a3Cut ) * 3.0, 0.008 ), a3Cut );
#else
  float a3Band = 0.0;
#endif`;
function kindOf(tag: MeshTag): Kind {
  return xrayKind(tag.system, tag.slot);
}

const XRAY_VERTEX_HEAD = "#include <common>\nvarying vec3 vA3N;\nvarying vec3 vA3V;";
const XRAY_VERTEX_BODY = "#include <project_vertex>\nvA3N = normalize( normalMatrix * normal );\nvA3V = -mvPosition.xyz;";
const XRAY_FRAGMENT_HEAD = `#include <common>
varying vec3 vA3N;
varying vec3 vA3V;
uniform vec3 uA3Tint;
uniform vec3 uA3Rim;
uniform float uA3RimPower;
uniform float uA3BaseAlpha;
uniform float uA3RimAlpha;
uniform float uA3BackAlpha;
uniform float uA3Fade;
uniform vec3 uA3Hi;
uniform float uA3Hover;
uniform float uA3Select;
uniform vec3 uA3Cut;`;
const XRAY_FRAGMENT_BODY = `float a3Ndv = abs( dot( normalize( vA3N ), normalize( vA3V ) ) );
float a3Rim = pow( clamp( 1.0 - a3Ndv, 0.0, 1.0 ), uA3RimPower );
float a3HiK = max( uA3Hover * 0.6, uA3Select );
vec3 a3Col = mix( uA3Tint, uA3Rim, a3Rim );
a3Col = mix( a3Col, uA3Hi, a3Rim * a3HiK ) + uA3Hi * ( uA3Hover * 0.10 + uA3Select * 0.18 );
float a3A = mix( uA3BaseAlpha, uA3RimAlpha, a3Rim ) * uA3Fade;
a3A = max( a3A, uA3Select * 0.22 * uA3Fade );
a3A *= gl_FrontFacing ? 1.0 : uA3BackAlpha;
${CUT_BAND}
a3Col = mix( a3Col, uA3Cut, a3Band );
a3A = max( a3A, a3Band * 0.9 * uA3Fade );
vec4 diffuseColor = vec4( a3Col, a3A * opacity );`;

const LIT_HEAD = `#include <common>
uniform vec3 uA3Sys;
uniform float uA3SysRim;
uniform vec3 uA3Hi;
uniform float uA3Hover;
uniform float uA3Select;
uniform float uA3Dim;
uniform vec3 uA3Cut;`;
const LIT_EMISSIVE = `#include <emissivemap_fragment>
{
  float a3Ndv = saturate( dot( normal, normalize( vViewPosition ) ) );
  float a3Rim = pow( 1.0 - a3Ndv, 2.0 );
  totalEmissiveRadiance += uA3Sys * a3Rim * uA3SysRim;
  totalEmissiveRadiance += uA3Hi * ( a3Rim * max( uA3Hover, uA3Select ) + uA3Hover * 0.35 + uA3Select * 0.3 );
  ${CUT_BAND}
  totalEmissiveRadiance += uA3Cut * a3Band * 2.5;
}`;
const LIT_DIM = `#include <opaque_fragment>
{
#if NUM_CLIPPING_PLANES > 0
  // Kroz presek se vide unutrašnja (zadnja) lica: boje se kao puna površina preseka.
  if ( !gl_FrontFacing && abs( clippingPlanes[ 0 ].w ) < 1000.0 ) gl_FragColor.rgb = mix( gl_FragColor.rgb, uA3Cut * 0.5, 0.7 );
#endif
  float a3Lum = dot( gl_FragColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( a3Lum ) * 0.6, uA3Dim );
}`;

function xrayMaterial(look: XrayLook, kind: "shell" | "glass", u: PartUniforms, side: Side, lite: boolean): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, side });
  m.name = `a3_xray_${kind}`;
  const uniforms = {
    uA3Tint: { value: new Color(look.tint) },
    uA3Rim: { value: new Color(look.rim) },
    uA3RimPower: { value: kind === "shell" && lite ? Math.max(1.6, look.rimPower - 0.4) : look.rimPower },
    uA3BaseAlpha: { value: look.baseAlpha },
    uA3RimAlpha: { value: look.rimAlpha },
    uA3BackAlpha: { value: 0.7 },
    uA3Fade: u.fade,
    uA3Hi: u.hiColor,
    uA3Hover: u.hover,
    uA3Select: u.select,
    uA3Cut: u.cut,
  };
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", XRAY_VERTEX_HEAD)
      .replace("#include <project_vertex>", XRAY_VERTEX_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", XRAY_FRAGMENT_HEAD)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", XRAY_FRAGMENT_BODY);
  };
  m.customProgramCacheKey = () => "a3-xray";
  return m;
}

function injectLit(m: MeshStandardMaterial, u: PartUniforms, sys: Color, sysRim: number, key: string) {
  const uniforms = {
    uA3Sys: { value: sys },
    uA3SysRim: { value: sysRim },
    uA3Hi: u.hiColor,
    uA3Hover: u.hover,
    uA3Select: u.select,
    uA3Dim: u.dim,
    uA3Cut: u.cut,
  };
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", LIT_HEAD)
      .replace("#include <emissivemap_fragment>", LIT_EMISSIVE)
      .replace("#include <opaque_fragment>", LIT_DIM);
  };
  m.customProgramCacheKey = () => key;
}

/** Boja sistema kao u Blender `system_material`: osnova × 0,55, emisija boje sistema 0,35. */
function systemMaterial(hex: string, u: PartUniforms): MeshStandardMaterial {
  const c = new Color(hex);
  const m = new MeshStandardMaterial({
    color: c.clone().multiplyScalar(0.55),
    metalness: 0,
    roughness: 0.45,
    emissive: c,
    emissiveIntensity: 0.35,
    side: DoubleSide,
  });
  m.name = "a3_system";
  // Prigušen (providan) dvostrani materijal se inače crta u dva prolaza: dupli draw call-ovi.
  m.forceSinglePass = true;
  injectLit(m, u, c, 0.35, "a3-system");
  return m;
}

/** Klon izvornog PBR materijala sa isticanjem; karoserija dobija boju i parametre laka. */
function lakMaterial(source: Material, u: PartUniforms, paint: PaintLook | null): MeshStandardMaterial {
  const base =
    source instanceof MeshStandardMaterial
      ? (source.clone() as MeshStandardMaterial)
      : new MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.6, metalness: 0.5 });
  base.name = source.name;
  if (paint) {
    base.color.set(paint.hex);
    base.metalness = paint.metalness;
    base.roughness = paint.roughness;
    if (base instanceof MeshPhysicalMaterial) {
      base.clearcoat = Math.max(base.clearcoat, 1);
      base.clearcoatRoughness = Math.min(base.clearcoatRoughness, 0.05);
    }
  }
  if (base.transparent) base.depthWrite = false;
  base.forceSinglePass = true;
  base.dithering = true;
  injectLit(base, u, new Color(0, 0, 0), 0, "a3-lak");
  return base;
}

export class MaterialSets {
  readonly uniforms = new Map<string, PartUniforms>();
  private recs: Rec[] = [];
  private byKey = new Map<string, Rec[]>();
  private owned = new Set<Material>();
  private paintMats: MeshStandardMaterial[] = [];
  /** Trenutni lak (posle prelaza), za sledeći prelaz boje. */
  paint: { color: Color; metalness: number; roughness: number };
  mode: Mode = "rendgen";

  constructor(
    private registry: Registry,
    look: { body: XrayLook; glass: XrayLook },
    lite: boolean,
    plane: Plane,
    paint: PaintLook = DEFAULT_PAINT_LOOK,
  ) {
    this.paint = { color: new Color(paint.hex), metalness: paint.metalness, roughness: paint.roughness };
    const cache = new Map<string, Material>();
    const once = <M extends Material>(key: string, make: () => M): M => {
      const hit = cache.get(key);
      if (hit) return hit as M;
      const m = make();
      cache.set(key, m);
      this.owned.add(m);
      return m;
    };

    for (const mesh of registry.meshes) {
      const tag = mesh.userData.a3 as MeshTag;
      const u = this.uniformsFor(tag.key, tag.system);
      const kind = kindOf(tag);
      const source = mesh.material as Material;
      const isPaint = tag.slot === "mat_body_paint";
      const lak = once(`lak|${tag.key}|${tag.slot}`, () => lakMaterial(source, u, isPaint ? paint : null));
      if (isPaint && !this.paintMats.includes(lak)) this.paintMats.push(lak);
      let xray: Material;
      let front: Mesh | null = null;
      if (kind === "shell" || kind === "glass") {
        const look1 = kind === "shell" ? look.body : look.glass;
        xray = once(`xb|${tag.key}|${kind}`, () => xrayMaterial(look1, kind, u, BackSide, lite));
        const frontMat = once(`xf|${tag.key}|${kind}`, () => xrayMaterial(look1, kind, u, FrontSide, lite));
        front = new Mesh(mesh.geometry, frontMat);
        front.name = `${mesh.name}__a3front`;
        front.raycast = () => {};
        front.userData.a3front = true;
        mesh.add(front);
      } else if (kind === "system") {
        xray = once(`sys|${tag.key}|${tag.slot}`, () => systemMaterial(SYSTEM_COLOR.get(tag.system) ?? "#C8D2DC", u));
      } else {
        xray = lak;
      }
      const rec: Rec = { mesh, tag, u, kind, xray, front, lak, lakOpacity: (lak as MeshStandardMaterial).opacity, lakTransparent: lak.transparent };
      this.recs.push(rec);
      const list = this.byKey.get(tag.key) ?? [];
      list.push(rec);
      this.byKey.set(tag.key, list);
    }
    for (const m of this.owned) m.clippingPlanes = [plane];
    this.apply("rendgen");
  }

  private uniformsFor(key: string, system: SystemId): PartUniforms {
    let u = this.uniforms.get(key);
    if (!u) {
      u = {
        hover: { value: 0 },
        select: { value: 0 },
        dim: { value: 0 },
        fade: { value: 1 },
        hiColor: { value: new Color(lighten(SYSTEM_COLOR.get(system) ?? "#FFFFFF", 0.35)) },
        cut: { value: new Color(lighten(SYSTEM_COLOR.get(system) ?? "#FFFFFF", 0.5)) },
      };
      this.uniforms.set(key, u);
    }
    return u;
  }

  /** Hover boja (sistem +35 %) ili bela za izabrani deo. */
  setSelectedColor(key: string, system: SystemId, selected: boolean) {
    const u = this.uniforms.get(key);
    if (u) u.hiColor.value.set(selected ? SELECT_COLOR : new Color(lighten(SYSTEM_COLOR.get(system) ?? "#FFFFFF", 0.35)));
  }

  apply(mode: Mode) {
    this.mode = mode;
    for (const r of this.recs) {
      const xray = mode !== "lak";
      r.mesh.material = xray ? r.xray : r.lak;
      if (r.front) r.front.visible = xray;
      this.applyDim(r);
    }
  }

  /** Primena prigušenja jednog dela (posle promene `dim` uniform-a). */
  applyDimFor(key: string) {
    for (const r of this.byKey.get(key) ?? []) this.applyDim(r);
  }

  private applyDim(r: Rec) {
    const d = r.u.dim.value;
    const xray = this.mode !== "lak";
    if (xray && (r.kind === "shell" || r.kind === "glass")) {
      r.u.fade.value = 1 - 0.65 * d;
      const back = r.kind === "shell" ? 2 : 3;
      r.mesh.renderOrder = back;
      if (r.front) r.front.renderOrder = back + 2;
      return;
    }
    const m = r.mesh.material as MeshStandardMaterial;
    const baseOpacity = xray && r.kind === "system" ? 1 : r.lakOpacity;
    const baseTransparent = xray && r.kind === "system" ? false : r.lakTransparent;
    const transparent = baseTransparent || d > 0.001;
    m.opacity = baseOpacity * (1 - 0.9 * d);
    if (m.transparent !== transparent) {
      m.transparent = transparent;
      m.depthWrite = !transparent;
      m.needsUpdate = true;
    }
    r.mesh.renderOrder = baseTransparent ? 3 : transparent ? 1 : 0;
  }

  /** Lak između dva stanja (k 0–1; boja se meša u linearnom prostoru). */
  setPaintMix(from: MaterialSets["paint"], to: MaterialSets["paint"], k: number) {
    for (const m of this.paintMats) {
      m.color.lerpColors(from.color, to.color, k);
      m.metalness = from.metalness + (to.metalness - from.metalness) * k;
      m.roughness = from.roughness + (to.roughness - from.roughness) * k;
    }
  }

  /** Svi materijali (za kompajliranje unapred i ponovnu izgradnju posle gubitka konteksta). */
  all(): Material[] {
    return [...this.owned];
  }

  dispose() {
    for (const r of this.recs) {
      if (r.front) r.mesh.remove(r.front);
    }
    for (const m of this.owned) m.dispose();
    for (const m of this.registry.sources) m.dispose();
    this.owned.clear();
    this.recs = [];
    this.byKey.clear();
  }
}
