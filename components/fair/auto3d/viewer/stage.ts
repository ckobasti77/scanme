// Renderer i petlja na zahtev (A03 §1.4): frejm se crta samo kad se nešto menja, petlja staje van
// ekrana i na skrivenom tabu, a gubitak WebGL konteksta se javlja gore.

import { NeutralToneMapping, SRGBColorSpace, WebGLRenderer } from "three";

export type StageEvents = {
  contextLost(): void;
  contextRestored(): void;
  /** Prosek 40 uzastopnih frejmova u pokretu je duži od 20 ms (adaptivni DPR, A03 §1.6). */
  slow(): void;
};

const SLOW_WINDOW = 40;
const SLOW_MS = 20;
/** Pojedinačan zastoj (parsiranje, prvo prevođenje šejdera, React) nije sporo crtanje: ne broji se. */
const HITCH_MS = 100;

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly rendererName: string;
  frames = 0;
  private raf = 0;
  private offscreen = false;
  private hiddenTab = typeof document !== "undefined" && document.visibilityState === "hidden";
  private lost = false;
  private disposed = false;
  private io: IntersectionObserver | null = null;
  /** Vreme prethodnog frejma iste serije pokreta (0 = serija je prekinuta mirovanjem ili pauzom). */
  private lastTs = 0;
  private slowSum = 0;
  private slowN = 0;
  /** Adaptivni DPR meri tek kad je model spreman (pre toga frejmove razvlače parsiranje i prevođenje). */
  adaptive = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    host: HTMLElement,
    opts: { msaa: boolean },
    private onFrame: () => boolean,
    private events: StageEvents,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: opts.msaa,
      alpha: false,
      stencil: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
    });
    const r = this.renderer;
    r.outputColorSpace = SRGBColorSpace;
    r.toneMapping = NeutralToneMapping;
    r.toneMappingExposure = 1;
    r.setClearColor("#0A0D11", 1);
    r.localClippingEnabled = true;
    // Provera šejdera je skupa i u produkciji samo ispisuje upozorenja drajvera (three preporučuje isključenje).
    r.debug.checkShaderErrors = process.env.NODE_ENV !== "production";
    const gl = r.getContext();
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    this.rendererName = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");

    canvas.addEventListener("webglcontextlost", this.onLost, false);
    canvas.addEventListener("webglcontextrestored", this.onRestored, false);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.io = new IntersectionObserver(
      (entries) => {
        // Jedan posmatran element: važi poslednji unos u paketu (raniji su zastareli).
        const visible = entries[entries.length - 1].isIntersecting;
        this.offscreen = !visible;
        if (visible) this.requestRender();
        else this.cancel();
      },
      { threshold: 0.01 },
    );
    this.io.observe(host);
  }

  get paused(): boolean {
    return this.offscreen || this.hiddenTab || this.lost || this.disposed;
  }

  requestRender = () => {
    if (this.raf || this.paused) return;
    this.raf = requestAnimationFrame(this.tick);
  };

  /** Crta odmah, sinhrono (prvi frejm pre prelaza postera → canvas). */
  renderNow() {
    if (this.disposed || this.lost) return;
    this.onFrame();
    this.frames++;
  }

  private tick = (ts: number) => {
    this.raf = 0;
    if (this.paused) {
      this.lastTs = 0;
      return;
    }
    const moving = this.onFrame();
    this.frames++;
    if (this.adaptive && this.lastTs && ts - this.lastTs < HITCH_MS) {
      this.slowSum += ts - this.lastTs;
      if (++this.slowN === SLOW_WINDOW) {
        if (this.slowSum / SLOW_WINDOW > SLOW_MS) this.events.slow();
        this.slowSum = 0;
        this.slowN = 0;
      }
    }
    this.lastTs = moving ? ts : 0;
    if (moving) this.requestRender();
  };

  private cancel() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.lastTs = 0;
  }

  setSize(width: number, height: number, dpr: number) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
  }

  private onVisibility = () => {
    this.hiddenTab = document.visibilityState === "hidden";
    if (this.hiddenTab) this.cancel();
    else this.requestRender();
  };

  private onLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    this.cancel();
    this.events.contextLost();
  };

  private onRestored = () => {
    this.lost = false;
    this.events.contextRestored();
    this.requestRender();
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    this.io?.disconnect();
    this.io = null;
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.canvas.removeEventListener("webglcontextlost", this.onLost, false);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored, false);
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
