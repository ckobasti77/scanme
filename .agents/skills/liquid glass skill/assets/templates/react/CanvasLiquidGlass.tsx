"use client";

import type { PropsWithChildren } from "react";
import { useEffect, useRef, useState } from "react";

const vertexShaderSource = `
  attribute vec2 aPosition;

  void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision mediump float;

  uniform sampler2D uScene;
  uniform vec2 uViewportCss;
  uniform vec4 uCardRectCss;
  uniform float uDpr;
  uniform float uTime;
  uniform float uMotion;

  void main() {
    vec2 localCss = gl_FragCoord.xy / uDpr;
    float cardBottom = uViewportCss.y - (uCardRectCss.y + uCardRectCss.w);
    vec2 screenUv = (vec2(uCardRectCss.x, cardBottom) + localCss) / uViewportCss;
    vec2 localUv = localCss / uCardRectCss.zw;

    vec2 wavePixels = vec2(
      sin(localUv.y * 8.0 + uTime * 0.7),
      cos(localUv.x * 7.0 + uTime * 0.65)
    ) * (2.4 * uMotion);

    vec2 sampleUv = clamp(screenUv + wavePixels / uViewportCss, 0.0, 1.0);
    vec2 texel = 1.35 / uViewportCss;
    vec4 scene = texture2D(uScene, sampleUv) * 0.28;
    scene += texture2D(uScene, sampleUv + vec2(texel.x, 0.0)) * 0.12;
    scene += texture2D(uScene, sampleUv - vec2(texel.x, 0.0)) * 0.12;
    scene += texture2D(uScene, sampleUv + vec2(0.0, texel.y)) * 0.12;
    scene += texture2D(uScene, sampleUv - vec2(0.0, texel.y)) * 0.12;
    scene += texture2D(uScene, sampleUv + texel) * 0.06;
    scene += texture2D(uScene, sampleUv - texel) * 0.06;
    scene += texture2D(uScene, sampleUv + vec2(texel.x, -texel.y)) * 0.06;
    scene += texture2D(uScene, sampleUv + vec2(-texel.x, texel.y)) * 0.06;

    float edge = min(min(localUv.x, 1.0 - localUv.x), min(localUv.y, 1.0 - localUv.y));
    float rim = 1.0 - smoothstep(0.0, 0.035, edge);
    vec3 tint = vec3(0.035, 0.045, 0.065);
    vec3 color = mix(scene.rgb, tint, 0.15) + rim * 0.055;

    gl_FragColor = vec4(color, 0.96);
  }
`;

type CanvasLiquidGlassProps = PropsWithChildren<{
  sourceCanvasId: string;
  className?: string;
}>;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Unknown shader error.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

export function CanvasLiquidGlass({
  sourceCanvasId,
  className = "",
  children,
}: CanvasLiquidGlassProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    const gl = canvas.getContext("webgl", { alpha: true, antialias: false });
    if (!gl) return;

    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Unable to link WebGL program.");
    }

    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    if (!buffer || !texture) return;

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // ORIENTATION_CONTRACT: upload-time Y correction only. Do not also flip shader UVs.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    const sceneLocation = gl.getUniformLocation(program, "uScene");
    const viewportLocation = gl.getUniformLocation(program, "uViewportCss");
    const rectLocation = gl.getUniformLocation(program, "uCardRectCss");
    const dprLocation = gl.getUniformLocation(program, "uDpr");
    const timeLocation = gl.getUniformLocation(program, "uTime");
    const motionLocation = gl.getUniformLocation(program, "uMotion");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const startedAt = performance.now();
    let frameId = 0;

    const render = (now: number) => {
      const source = document.getElementById(sourceCanvasId);
      const rect = root.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      if (source instanceof HTMLCanvasElement && rect.width > 0 && rect.height > 0) {
        gl.viewport(0, 0, width, height);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.uniform1i(sceneLocation, 0);
        gl.uniform2f(viewportLocation, window.innerWidth, window.innerHeight);
        gl.uniform4f(rectLocation, rect.left, rect.top, rect.width, rect.height);
        gl.uniform1f(dprLocation, dpr);
        gl.uniform1f(timeLocation, (now - startedAt) / 1000);
        gl.uniform1f(motionLocation, reduceMotion.matches ? 0 : 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        setReady(true);
      }

      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frameId);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, [sourceCanvasId]);

  return (
    <div
      ref={rootRef}
      className={`liquidGlass canvasLiquidGlass ${className}`.trim()}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="canvasLiquidGlassLayer"
        style={{ opacity: ready ? 1 : 0 }}
      />
      <div className="liquidGlassContent">{children}</div>
    </div>
  );
}
