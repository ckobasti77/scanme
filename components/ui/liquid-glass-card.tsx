"use client";

import { gsap } from "gsap";
import { useEffect, useRef, useState, type ReactNode } from "react";

const VERTEX_SHADER_SOURCE = `
  attribute vec2 position;
  varying vec2 vUv;

  void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER_SOURCE = `
  precision mediump float;

  varying vec2 vUv;
  uniform vec3 iResolution;
  uniform float iTime;
  uniform vec4 iMouse;
  uniform sampler2D iChannel0;
  uniform vec4 uCardRect;
  uniform vec2 uViewport;
  uniform float uDarkenFactor;

  void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    float cardBottomOnScreen = uViewport.y - (uCardRect.y + uCardRect.w);
    vec2 screenCoord = vec2(
      uCardRect.x + fragCoord.x,
      cardBottomOnScreen + fragCoord.y
    );
    vec2 screenUV = clamp(screenCoord / uViewport, 0.0, 1.0);
    vec2 localUV = fragCoord / iResolution.xy;
    vec2 localMouse = iMouse.xy / iResolution.xy;
    vec2 delta = localUV - localMouse;
    float aspect = iResolution.x / iResolution.y;
    float dist = length(delta * vec2(aspect, 1.0));

    float ripple = smoothstep(0.32, 0.0, dist);
    vec2 distortion = normalize(delta + 0.0001) * ripple * 0.014;
    vec2 wave = vec2(
      sin(localUV.y * 6.28 + iTime * 1.2) * 0.003,
      cos(localUV.x * 6.28 + iTime * 1.2) * 0.003
    );
    vec2 lensUV = clamp(screenUV - distortion - wave, 0.0, 1.0);

    vec4 blurredColor = vec4(0.0);
    float total = 0.0;
    const float SAMPLE_RANGE = 2.0;
    const float SAMPLE_OFFSET = 1.6;

    for (float x = -SAMPLE_RANGE; x <= SAMPLE_RANGE; x++) {
      for (float y = -SAMPLE_RANGE; y <= SAMPLE_RANGE; y++) {
        vec2 offset = vec2(x, y) * SAMPLE_OFFSET / uViewport;
        blurredColor += texture2D(iChannel0, lensUV + offset);
        total += 1.0;
      }
    }

    blurredColor /= total;

    float specular = smoothstep(0.12, 0.0, dist) * 0.12;
    float rimX =
      smoothstep(0.0, 0.03, localUV.x) *
      smoothstep(1.0, 0.97, localUV.x);
    float rimY =
      smoothstep(0.0, 0.03, localUV.y) *
      smoothstep(1.0, 0.97, localUV.y);
    float rim = 1.0 - (rimX * rimY);
    vec3 darkenedColor = blurredColor.rgb * uDarkenFactor;
    vec4 lighting = clamp(
      vec4(darkenedColor, blurredColor.a) +
      vec4(specular * 0.8) +
      vec4(rim * 0.04),
      0.0,
      1.0
    );

    gl_FragColor = lighting;
  }
`;

const TEXTURE_UPLOAD_INTERVAL_MS = 48;

type LiquidGlassCardProps = {
  children: ReactNode;
  className?: string;
  active?: boolean;
  darkenFactor?: number;
  tiltEnabled?: boolean;
};

export function LiquidGlassCard({
  children,
  className = "",
  active = true,
  darkenFactor = 1,
  tiltEnabled = true,
}: LiquidGlassCardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef(active);
  const darkenFactorRef = useRef(darkenFactor);
  const mouseRef = useRef<[number, number]>([0, 0]);
  const lastActiveTimeRef = useRef(0);
  const currentMouseRef = useRef<[number, number]>([0, 0]);
  const lastUploadedFrameRef = useRef("");
  const lastUploadedSizeRef = useRef<[number, number]>([0, 0]);
  const lastUploadTimeRef = useRef(0);
  const [hasWebGL, setHasWebGL] = useState(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    darkenFactorRef.current = darkenFactor;
  }, [darkenFactor]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      mouseRef.current = [event.clientX, window.innerHeight - event.clientY];
      lastActiveTimeRef.current = performance.now();
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
    });
    if (!gl) {
      return;
    }

    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) {
        return null;
      }

      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }

      return shader;
    };

    const vertexShader = createShader(
      gl.VERTEX_SHADER,
      VERTEX_SHADER_SOURCE,
    );
    const fragmentShader = createShader(
      gl.FRAGMENT_SHADER,
      FRAGMENT_SHADER_SOURCE,
    );
    if (!vertexShader || !fragmentShader) {
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      return;
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return;
    }

    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const positionLocation = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {
      resolution: gl.getUniformLocation(program, "iResolution"),
      time: gl.getUniformLocation(program, "iTime"),
      mouse: gl.getUniformLocation(program, "iMouse"),
      texture: gl.getUniformLocation(program, "iChannel0"),
      cardRect: gl.getUniformLocation(program, "uCardRect"),
      viewport: gl.getUniformLocation(program, "uViewport"),
      darkenFactor: gl.getUniformLocation(program, "uDarkenFactor"),
    };

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(rect.width));
      const nextHeight = Math.max(1, Math.round(rect.height));

      if (nextWidth === width && nextHeight === height) {
        return;
      }

      width = nextWidth;
      height = nextHeight;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      lastUploadedFrameRef.current = "";
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    setHasWebGL(true);
    const startTime = performance.now();
    let animationFrameId = 0;

    const render = (now: number) => {
      if (activeRef.current && width > 0 && height > 0) {
        const frameCanvas = document.getElementById(
          "hero-frame-canvas",
        ) as HTMLCanvasElement | null;
        const activeFrameVideo = document.querySelector<HTMLVideoElement>(
          "[data-hero-frame-video='true'][data-active='true']",
        );
        const rect = container.getBoundingClientRect();

        if (frameCanvas) {
          const videoIsReady =
            activeFrameVideo &&
            activeFrameVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
          const frameSource: HTMLCanvasElement | HTMLVideoElement =
            videoIsReady ? activeFrameVideo : frameCanvas;
          const idleTime = now - lastActiveTimeRef.current;
          const pointerStrength =
            idleTime <= 1_500
              ? 1
              : Math.max(0, 1 - (idleTime - 1_500) / 1_000);
          const elapsed = (now - startTime) / 1_000;
          const orbitX =
            width / 2 + Math.cos(elapsed * 0.9) * width * 0.16;
          const orbitY =
            height / 2 + Math.sin(elapsed * 0.72) * height * 0.16;
          const cardBottom =
            window.innerHeight - (rect.top + rect.height);
          const pointerX = mouseRef.current[0] - rect.left;
          const pointerY = mouseRef.current[1] - cardBottom;
          const targetX =
            orbitX + (pointerX - orbitX) * pointerStrength;
          const targetY =
            orbitY + (pointerY - orbitY) * pointerStrength;

          currentMouseRef.current[0] +=
            (targetX - currentMouseRef.current[0]) * 0.08;
          currentMouseRef.current[1] +=
            (targetY - currentMouseRef.current[1]) * 0.08;

          const frame = videoIsReady
            ? `video-${activeFrameVideo.currentTime.toFixed(3)}`
            : frameCanvas.getAttribute("data-frame") ?? "";
          const sourceWidth = videoIsReady
            ? activeFrameVideo.videoWidth
            : frameCanvas.width;
          const sourceHeight = videoIsReady
            ? activeFrameVideo.videoHeight
            : frameCanvas.height;
          const [lastWidth, lastHeight] = lastUploadedSizeRef.current;
          const sourceChanged =
            frame !== lastUploadedFrameRef.current ||
            sourceWidth !== lastWidth ||
            sourceHeight !== lastHeight;
          const canUpload =
            now - lastUploadTimeRef.current >=
            TEXTURE_UPLOAD_INTERVAL_MS;

          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, texture);

          if (sourceChanged && canUpload) {
            gl.texImage2D(
              gl.TEXTURE_2D,
              0,
              gl.RGBA,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              frameSource,
            );
            lastUploadedFrameRef.current = frame;
            lastUploadedSizeRef.current = [
              sourceWidth,
              sourceHeight,
            ];
            lastUploadTimeRef.current = now;
          }

          gl.uniform1i(uniforms.texture, 0);
          gl.uniform3f(uniforms.resolution, width, height, 1);
          gl.uniform1f(uniforms.time, elapsed);
          gl.uniform1f(
            uniforms.darkenFactor,
            darkenFactorRef.current,
          );
          gl.uniform4f(
            uniforms.mouse,
            currentMouseRef.current[0],
            currentMouseRef.current[1],
            0,
            0,
          );
          gl.uniform4f(
            uniforms.cardRect,
            rect.left,
            rect.top,
            width,
            height,
          );
          gl.uniform2f(
            uniforms.viewport,
            window.innerWidth,
            window.innerHeight,
          );
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
      }

      animationFrameId = window.requestAnimationFrame(render);
    };

    animationFrameId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, []);

  useEffect(() => {
    if (!tiltEnabled) return;
    const card = containerRef.current;
    const inner = innerRef.current;
    if (!card || !inner) {
      return;
    }

    const finePointer = window.matchMedia(
      "(hover: hover) and (pointer: fine)",
    );
    if (!finePointer.matches) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const rect = card.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const px = x / rect.width - 0.5;
      const py = y / rect.height - 0.5;

      gsap.to(card, {
        rotateX: -py * 8,
        rotateY: px * 8,
        transformPerspective: 1000,
        boxShadow: `${-px * 15}px ${-py * 15}px 40px rgba(0, 0, 0, 0.15)`,
        duration: 0.45,
        ease: "power2.out",
        overwrite: "auto",
      });
      gsap.to(inner, {
        x: -px * 12,
        y: -py * 12,
        duration: 0.45,
        ease: "power2.out",
        overwrite: "auto",
      });
    };

    const handleMouseLeave = () => {
      gsap.to(card, {
        rotateX: 0,
        rotateY: 0,
        boxShadow: "0 25px 60px rgba(0, 0, 0, 0.12)",
        duration: 0.6,
        ease: "power3.out",
        overwrite: "auto",
      });
      gsap.to(inner, {
        x: 0,
        y: 0,
        duration: 0.6,
        ease: "power3.out",
        overwrite: "auto",
      });
    };

    card.addEventListener("mousemove", handleMouseMove);
    card.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      card.removeEventListener("mousemove", handleMouseMove);
      card.removeEventListener("mouseleave", handleMouseLeave);
      gsap.killTweensOf([card, inner]);
    };
  }, [tiltEnabled]);

  return (
    <div
      ref={containerRef}
      data-glass-active={active ? "true" : "false"}
      data-glass-renderer={hasWebGL ? "webgl" : "native"}
      className={`relative isolate overflow-hidden rounded-3xl border border-white/60 shadow-[0_25px_60px_rgba(0,0,0,0.15)] ${
        hasWebGL
          ? "bg-transparent"
          : "bg-[#fcfbf8]/80 backdrop-blur-2xl backdrop-saturate-180"
      } ${className}`}
      style={{
        backgroundColor:
          hasWebGL
            ? "transparent"
            : darkenFactor < 1
            ? `rgba(0, 0, 0, ${1 - darkenFactor})`
            : undefined,
        transition:
          "background-color 450ms ease, border-color 450ms ease",
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 h-full w-full rounded-[inherit]"
      />
      <div
        ref={innerRef}
        className="relative z-10 flex h-full w-full flex-col"
      >
        {children}
      </div>
    </div>
  );
}
