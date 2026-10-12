"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { HeatScene } from "@/lib/admin-v2/analytics/heat-blocks";
import { liftLabels } from "@/lib/admin-v2/analytics/label-lift";
import { ADMIN_DURATION } from "@/lib/admin-v2/motion";
import { fairHeatColor } from "@/lib/fair-heat";

// ADMIN v2 X3 — the hall heat map in 3D (ZADATAK §6), loaded only when „3D“
// is chosen (heat-map.tsx imports this file with a dynamic import()). Every
// stand of the floor plan is a block: its height is the number of scans, its
// colour the heat level of „Gde je gužva“. One scene; a frame is drawn only
// when something changes (the camera, the data, the size, the choice), never
// in a loop; everything is disposed on the way out. Drag turns the hall, the
// wheel or two fingers zoom, a click on a stand opens its detail. Stands are
// irregular polygons, so each is its own extruded mesh (fewer than 40 here),
// not an instanced box. Without WebGL the parent shows the 2D map.

type Callbacks = { onPick: (locationId: string | null) => void; onUnavailable: () => void };

type Controller = {
  setScene: (scene: HeatScene) => void;
  setPicked: (locationId: string | null) => void;
  reset: () => void;
  dispose: () => void;
};

/** GSAP's power3.out: the blocks rise fast and settle, no overshoot. */
const easeOut = (t: number) => 1 - (1 - t) ** 4;
/** A click is a press and a release closer than this (px); farther is a drag of the camera. */
const CLICK_SLOP = 5;

function shapeOf(polygon: ReadonlyArray<readonly [number, number]>): THREE.Shape {
  const shape = new THREE.Shape();
  polygon.forEach(([x, y], index) => (index === 0 ? shape.moveTo(x, -y) : shape.lineTo(x, -y)));
  shape.closePath();
  return shape;
}

function createController(host: HTMLElement, callbacks: Callbacks): Controller | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearAlpha(0);
  const canvas = renderer.domElement;
  canvas.className = "block h-full w-full touch-none";
  canvas.setAttribute("aria-hidden", "true");
  host.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.screenSpacePanning = true;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minZoom = 0.6;
  controls.maxZoom = 6;

  const root = new THREE.Group();
  scene.add(root);
  const disposables: Array<{ dispose: () => void }> = [];
  let blocks: Array<{ id: string; mesh: THREE.Mesh; height: number; center: [number, number]; edges: THREE.LineBasicMaterial }> = [];
  let frame = 0;
  let tween = 0;
  let progress = 1;
  let picked: string | null = null;
  /** Half the width and the height of the scene as the starting camera sees it (world units). */
  let extent = { halfWidth: 1, halfHeight: 1 };
  let first = true;
  let disposed = false;
  let current: HeatScene | null = null;

  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const token = (name: string, fallback: string) => new THREE.Color(getComputedStyle(host).getPropertyValue(name).trim() || fallback);

  const fit = () => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const half = Math.max(extent.halfHeight, extent.halfWidth / aspect);
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
  };

  const placeLabels = () => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    const point = new THREE.Vector3();
    const shown: { label: HTMLElement; x: number; y: number; width: number; height: number }[] = [];
    for (const block of blocks) {
      const label = host.querySelector<HTMLElement>(`[data-block-label="${block.id}"]`);
      if (!label) continue;
      point.set(block.center[0], block.height * progress, block.center[1]).project(camera);
      const visible = Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1;
      label.style.opacity = visible ? "1" : "0";
      if (visible) shown.push({ label, x: ((point.x + 1) / 2) * width, y: ((1 - point.y) / 2) * height, width: label.offsetWidth, height: label.offsetHeight });
    }
    // On a narrow canvas neighbouring labels meet: the one further back moves up above the nearer one.
    const lifted = liftLabels(shown);
    shown.forEach((item, index) => {
      item.label.style.transform = `translate(${item.x}px, ${lifted[index]}px) translate(-50%, -100%)`;
    });
  };

  const render = () => {
    frame = 0;
    if (disposed) return;
    for (const block of blocks) block.mesh.scale.y = Math.max(0.001, block.height * progress);
    renderer.render(scene, camera);
    placeLabels();
  };
  const requestRender = () => {
    if (!frame && !disposed) frame = requestAnimationFrame(render);
  };
  controls.addEventListener("change", requestRender);

  const paintPicked = () => {
    const ink = token("--admin-text", "#171918");
    const quiet = token("--admin-text-muted", "#5f6462");
    for (const block of blocks) {
      const on = block.id === picked;
      block.edges.color.copy(on ? ink : quiet);
      block.edges.opacity = on ? 1 : 0.35;
    }
  };

  const clear = () => {
    root.clear();
    for (const item of disposables.splice(0)) item.dispose();
    blocks = [];
  };

  const setScene = (next: HeatScene) => {
    current = next;
    clear();
    const keep = <T extends { dispose: () => void }>(item: T) => {
      disposables.push(item);
      return item;
    };
    const flat = (polygon: ReadonlyArray<readonly [number, number]>, color: THREE.Color, y: number) => {
      const geometry = keep(new THREE.ShapeGeometry(shapeOf(polygon)));
      geometry.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, keep(new THREE.MeshBasicMaterial({ color })));
      mesh.position.y = y;
      root.add(mesh);
    };
    const floor = token("--admin-surface-muted", "#eeeee8");
    const tile = token("--admin-surface-strong", "#fffefa");
    for (const zone of next.zones) {
      flat(zone.outline ?? [[zone.offsetX, 0], [zone.offsetX + zone.width, 0], [zone.offsetX + zone.width, zone.height], [zone.offsetX, zone.height]], floor, 0);
    }
    // The tallest stand is a small part of the floor, so it never hides the stands behind it.
    const tallest = next.width * 0.14;
    const lowest = next.width * 0.006;
    const tileHeight = next.width * 0.002;
    for (const block of next.blocks) {
      const geometry = keep(new THREE.ExtrudeGeometry(shapeOf(block.polygon), { depth: 1, bevelEnabled: false }));
      geometry.rotateX(-Math.PI / 2);
      const top = block.level > 0 ? new THREE.Color(fairHeatColor(block.level)) : tile.clone();
      // Unlit: the top is exactly the colour of the legend, the sides a darker step of it.
      const mesh = new THREE.Mesh(geometry, [keep(new THREE.MeshBasicMaterial({ color: top })), keep(new THREE.MeshBasicMaterial({ color: top.clone().multiplyScalar(block.level > 0 ? 0.72 : 0.9) }))]);
      mesh.userData.locationId = block.locationId;
      const edges = keep(new THREE.LineBasicMaterial({ transparent: true }));
      mesh.add(new THREE.LineSegments(keep(new THREE.EdgesGeometry(geometry)), edges));
      root.add(mesh);
      blocks.push({
        id: block.locationId,
        mesh,
        height: block.height > 0 ? Math.max(lowest, block.height * tallest) : tileHeight,
        center: [block.center[0], block.center[1]],
        edges,
      });
    }
    paintPicked();

    if (first) {
      // Isometric start, no rotation of its own: the whole floor with its tallest block fills the view.
      const center = new THREE.Vector3(next.width / 2, 0, next.depth / 2);
      const radius = Math.max(1, Math.hypot(next.width, next.depth) / 2);
      camera.position.copy(center).addScaledVector(new THREE.Vector3(1, 0.9, 1.1).normalize(), radius * 3);
      camera.near = radius * 0.1;
      camera.far = radius * 8;
      camera.lookAt(center);
      camera.updateMatrixWorld(true);
      const seen = new THREE.Box3();
      for (const x of [0, next.width]) for (const y of [0, tallest]) for (const z of [0, next.depth]) seen.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
      // Room for the labels above the blocks.
      extent = { halfWidth: ((seen.max.x - seen.min.x) / 2) * 1.06, halfHeight: ((seen.max.y - seen.min.y) / 2) * 1.14 };
      const shift = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar((seen.min.x + seen.max.x) / 2)
        .add(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar((seen.min.y + seen.max.y) / 2));
      camera.position.add(shift);
      controls.target.copy(center).add(shift);
      fit();
      controls.update();
      controls.saveState();
    }
    // The blocks rise once, when the view opens; new data or reduced motion draws the final state at once.
    cancelAnimationFrame(tween);
    if (first && !reduceMotion()) {
      const start = performance.now();
      const duration = ADMIN_DURATION.frame * 1000;
      const step = (now: number) => {
        if (disposed) return;
        const t = Math.min(1, (now - start) / duration);
        progress = easeOut(t);
        render();
        if (t < 1) tween = requestAnimationFrame(step);
      };
      progress = 0;
      tween = requestAnimationFrame(step);
    } else {
      progress = 1;
      requestRender();
    }
    first = false;
  };

  // A click (not a drag) on a stand opens its detail; a click on the floor closes it.
  const raycaster = new THREE.Raycaster();
  let down: { x: number; y: number } | null = null;
  const hit = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1), camera);
    const found = raycaster.intersectObjects(blocks.map((block) => block.mesh), false)[0];
    return (found?.object.userData.locationId as string | undefined) ?? null;
  };
  const onPointerDown = (event: PointerEvent) => {
    down = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = down;
    down = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP) return;
    callbacks.onPick(hit(event));
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || event.buttons) return;
    canvas.style.cursor = hit(event) ? "pointer" : "grab";
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
    callbacks.onUnavailable();
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("webglcontextlost", onContextLost);

  const resize = new ResizeObserver(() => {
    fit();
    requestRender();
  });
  resize.observe(host);
  // The theme switch changes the tokens the floor, the tiles and the edges are painted with.
  const theme = new MutationObserver(() => {
    if (current) setScene(current);
  });
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

  return {
    setScene,
    setPicked: (locationId) => {
      picked = locationId;
      paintPicked();
      requestRender();
    },
    reset: () => {
      controls.reset();
      requestRender();
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(tween);
      resize.disconnect();
      theme.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      controls.removeEventListener("change", requestRender);
      controls.dispose();
      clear();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

export default function HeatMap3D({ scene, picked, onPick, onUnavailable, label, resetLabel, blockLabel }: {
  scene: HeatScene;
  picked: string | null;
  onPick: (locationId: string | null) => void;
  /** WebGL could not start or its context was lost: the parent goes back to the 2D map. */
  onUnavailable: () => void;
  label: string;
  resetLabel: string;
  /** The text over a block with scans (the stand and its number). */
  blockLabel: (block: HeatScene["blocks"][number]) => string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<Controller | null>(null);
  const callbacks = useRef<Callbacks>({ onPick, onUnavailable });
  useEffect(() => {
    callbacks.current = { onPick, onUnavailable };
  });
  useEffect(() => {
    if (!host.current) return;
    const created = createController(host.current, {
      onPick: (locationId) => callbacks.current.onPick(locationId),
      onUnavailable: () => callbacks.current.onUnavailable(),
    });
    controller.current = created;
    if (!created) {
      callbacks.current.onUnavailable();
      return;
    }
    return () => {
      created.dispose();
      controller.current = null;
    };
  }, []);
  useEffect(() => {
    controller.current?.setScene(scene);
  }, [scene]);
  useEffect(() => {
    controller.current?.setPicked(picked);
  }, [picked]);

  return (
    <div ref={host} data-heat-3d="" className="relative h-[20rem] min-w-0 overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] @2xl:h-[28rem]">
      <p className="sr-only">{label}</p>
      {scene.blocks.filter((block) => block.value > 0).map((block) => (
        <span
          key={block.locationId}
          aria-hidden="true"
          data-block-label={block.locationId}
          className="pointer-events-none absolute top-0 left-0 rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-1.5 py-0.5 text-[0.6875rem] leading-4 font-bold whitespace-nowrap text-[var(--admin-text)] tabular-nums opacity-0 shadow-[var(--admin-shadow-xs)]"
        >
          {blockLabel(block)}
        </span>
      ))}
      <button
        type="button"
        onClick={() => controller.current?.reset()}
        className="absolute top-2 right-2 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-3 text-xs font-semibold text-[var(--admin-text)] hover:bg-[var(--admin-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)] lg:min-h-8"
      >
        <RotateCcw aria-hidden="true" className="size-3.5" />
        {resetLabel}
      </button>
    </div>
  );
}
