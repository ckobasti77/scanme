"use client";

export const SCANME_LOGO_ACCEPT =
  "image/png,image/jpeg,image/webp,image/svg+xml";
export const SCANME_LOGO_MAX_BYTES = 5 * 1024 * 1024;

const SUPPORTED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Operacija je prekinuta.", "AbortError");
  }
}

function inferredMimeType(file: File) {
  if (file.type) return file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "svg") return "image/svg+xml";
  return "";
}

export function validateScanMeLogo(file: File) {
  const mimeType = inferredMimeType(file);
  if (!SUPPORTED_LOGO_TYPES.has(mimeType)) {
    throw new Error("Logo mora biti PNG, JPG, JPEG, WebP ili SVG fajl.");
  }
  if (file.size <= 0) {
    throw new Error("Izabrani logo je prazan.");
  }
  if (file.size > SCANME_LOGO_MAX_BYTES) {
    throw new Error("Logo može imati najviše 5 MB.");
  }
  return mimeType;
}

export async function withObjectUrl<T>(
  blob: Blob,
  callback: (url: string) => Promise<T>,
) {
  const url = URL.createObjectURL(blob);
  try {
    return await callback(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function withDecodedImage<T>(
  blob: Blob,
  signal: AbortSignal | undefined,
  callback: (image: HTMLImageElement) => Promise<T>,
) {
  return withObjectUrl(blob, async (url) => {
    throwIfAborted(signal);
    const image = new Image();
    image.decoding = "async";
    image.src = url;

    const abort = () => {
      image.src = "";
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      await image.decode();
      throwIfAborted(signal);
      return await callback(image);
    } catch (error) {
      if (signal?.aborted) {
        throw signal.reason ?? new DOMException("Operacija je prekinuta.", "AbortError");
      }
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  });
}

export function validateSvgSourceSafety(source: string) {
  if (
    /<!ENTITY/i.test(source) ||
    /<script[\s>]/i.test(source) ||
    /<foreignObject[\s>]/i.test(source) ||
    /\son[a-z]+\s*=/i.test(source) ||
    /\b(?:href|xlink:href)\s*=\s*["']\s*(?!#|data:image\/(?:png|jpe?g|webp|gif);)[^"']+/i.test(
      source,
    ) ||
    /url\(\s*["']?\s*(?!#|data:image\/(?:png|jpe?g|webp|gif);)[^)]+/i.test(
      source,
    ) ||
    /@import/i.test(source)
  ) {
    throw new Error("SVG logo sadrži spoljne ili izvršne elemente.");
  }
}

function sanitizedSvgBlob(source: string) {
  validateSvgSourceSafety(source);
  const documentNode = new DOMParser().parseFromString(source, "image/svg+xml");
  if (documentNode.querySelector("parsererror")) {
    throw new Error("SVG logo nije ispravan.");
  }
  const svg = documentNode.documentElement;
  if (svg.localName.toLowerCase() !== "svg") {
    throw new Error("Fajl ne sadrži ispravan SVG dokument.");
  }
  return new Blob([new XMLSerializer().serializeToString(svg)], {
    type: "image/svg+xml",
  });
}

function svgCanvasSize(image: HTMLImageElement, maximum: number) {
  const naturalWidth = image.naturalWidth || 1024;
  const naturalHeight = image.naturalHeight || 1024;
  const scale = Math.min(1, maximum / Math.max(naturalWidth, naturalHeight));
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("SVG logo nije moguće rasterizovati."));
    }, "image/png");
  });
}

export async function rasterizeSvgLogo(
  file: File,
  options?: { signal?: AbortSignal; maximumDimension?: number },
) {
  if (validateScanMeLogo(file) !== "image/svg+xml") return file;
  throwIfAborted(options?.signal);
  const source = await file.text();
  throwIfAborted(options?.signal);
  const safeSvg = sanitizedSvgBlob(source);
  const maximumDimension = Math.min(
    2048,
    Math.max(256, options?.maximumDimension ?? 1600),
  );

  const png = await withDecodedImage(safeSvg, options?.signal, async (image) => {
    const { width, height } = svgCanvasSize(image, maximumDimension);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", {
      alpha: true,
      willReadFrequently: false,
    });
    if (!context) {
      throw new Error("Pregledač ne podržava obradu SVG logotipa.");
    }
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvasToPng(canvas);
  });

  return new File([png], file.name.replace(/\.svg$/i, ".png"), {
    type: "image/png",
    lastModified: file.lastModified,
  });
}

export async function extractLogoColors(
  file: File,
  options?: { signal?: AbortSignal },
) {
  const mimeType = validateScanMeLogo(file);
  const source =
    mimeType === "image/svg+xml"
      ? await rasterizeSvgLogo(file, options)
      : file;

  return withDecodedImage(source, options?.signal, async (image) => {
    const { getPalette } = await import("colorthief");
    const palette = await getPalette(image, {
      colorCount: 10,
      quality: 6,
      colorSpace: "oklch",
      gamut: "srgb",
      worker: true,
      signal: options?.signal,
      ignoreWhite: true,
      whiteThreshold: 247,
      alphaThreshold: 120,
    });
    const colors = (palette ?? []).map((color) => color.hex().toUpperCase());
    if (!colors.length) {
      throw new Error(
        "Iz logotipa nije moguće izdvojiti upotrebljivu paletu. Probajte drugi fajl.",
      );
    }
    return colors;
  });
}
