"use client";

import { FileImage } from "lucide-react";
import Image from "next/image";
import { useMemo, type CSSProperties } from "react";
import { offerSr as dict } from "@/lib/i18n/sr/offer";
import { qrMatrix } from "@/lib/qr/qrcodegen";
import {
  getProduct,
  type ProductDimension,
  type ProductSelection,
  type TemplateId,
} from "@/lib/scanme-pricing";
import {
  ProductMockup,
  type ProductMockupTransformConfig,
} from "./ProductMockup";
import styles from "./offer-product-preview.module.css";

const TEMPLATE_ASSETS: Partial<Record<TemplateId, string>> = {
  "template-1": "/offer/templates/template-1.webp",
  "template-2": "/offer/templates/template-2.webp",
  "template-3": "/offer/templates/template-3.webp",
  "template-4": "/offer/templates/template-4.webp",
  "template-5": "/offer/templates/template-5.webp",
};

const DIMENSION_SCALE: Record<ProductDimension, number> = {
  a4: 1,
  a5: 0.86,
  a6: 0.72,
  small: 0.72,
  medium: 0.86,
  large: 1,
};

const QR_QUIET_ZONE = 4;

const COMPACT_STAND_TRANSFORM: ProductMockupTransformConfig = {
  plane: { top: 10.8, left: 18.9, width: 57.3, height: 79.3 },
  projective: {
    a: 0.8632706582,
    b: -0.094,
    c: 0.094,
    d: 0.0306326611,
    e: 0.9180164139,
    f: 0,
    g: -0.0427293418,
    h: -0.0086215833,
  },
  transformOrigin: "0 0",
  borderRadius: "4.5% 4.5% 1.2% 1.2% / 2.4% 2.4% 0.8% 0.8%",
};

function PreviewQr() {
  const { path, dimension } = useMemo(() => {
    const matrix = qrMatrix("https://scanme.rs/review/basic-preview", "MEDIUM");
    const dimension = matrix.length + QR_QUIET_ZONE * 2;
    let path = "";
    for (let y = 0; y < matrix.length; y += 1) {
      for (let x = 0; x < matrix.length; x += 1) {
        if (matrix[y][x]) {
          path += `M${x + QR_QUIET_ZONE},${y + QR_QUIET_ZONE}h1v1h-1z`;
        }
      }
    }
    return { path, dimension };
  }, []);

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${dimension} ${dimension}`}
      shapeRendering="crispEdges"
      className={styles.basicQr}
    >
      <rect width={dimension} height={dimension} rx="2" fill="#f8f5ed" />
      <path d={path} fill="#171a17" />
    </svg>
  );
}

export function BasicReviewArtwork({
  dark = false,
  transparent = false,
}: {
  dark?: boolean;
  transparent?: boolean;
}) {
  return (
    <div
      className={styles.basicArtwork}
      data-dark={dark ? "true" : "false"}
      data-transparent={transparent ? "true" : "false"}
    >
      <div className={styles.basicBrand}>
        <span className={styles.basicScan}>Scan</span>
        <span className={styles.basicMe}>Me</span>
      </div>
      <p className={styles.basicEyebrow}>{dict.basicReviewEyebrow}</p>
      <h3 className={styles.basicTitle}>{dict.basicReviewTitle}</h3>
      <div aria-hidden="true" className={styles.basicStars}>★★★★★</div>
      <PreviewQr />
      <p className={styles.basicInstruction}>{dict.basicReviewInstruction}</p>
    </div>
  );
}

function DesignArtwork({
  selected,
  logoUrl,
  transparentBase = false,
}: {
  selected: ProductSelection;
  logoUrl: string | null;
  transparentBase?: boolean;
}) {
  const dark = selected.background === "black";

  return (
    <div className={styles.designArtwork} data-dark={dark ? "true" : "false"}>
      {selected.design.kind === "template" ? (
        selected.design.templateId === "basic" ? (
          <BasicReviewArtwork dark={dark} transparent={transparentBase} />
        ) : (
          <Image
            src={TEMPLATE_ASSETS[selected.design.templateId] ?? TEMPLATE_ASSETS["template-1"]!}
            alt=""
            fill
            sizes="(max-width: 767px) 62vw, 320px"
            loading="eager"
            className={styles.templateArtwork}
          />
        )
      ) : (
        <div className={styles.customArtwork}>
          <FileImage aria-hidden="true" className={styles.customIcon} strokeWidth={1.4} />
          <span className={styles.customTitle}>{dict.previewCustom}</span>
          <span className={styles.customBody}>{dict.previewCustomBody}</span>
        </div>
      )}
      {logoUrl ? (
        <div className={styles.logoSafeZone}>
          <Image src={logoUrl} alt="" fill unoptimized className={styles.logoImage} />
        </div>
      ) : null}
    </div>
  );
}

export function BasicTemplateThumbnail() {
  return (
    <div className={styles.basicThumbnail}>
      <BasicReviewArtwork />
    </div>
  );
}

function previewScale(dimension: ProductDimension): CSSProperties {
  return { "--product-scale": DIMENSION_SCALE[dimension] } as CSSProperties;
}

function StickerPreview({
  selected,
  logoUrl,
}: {
  selected: ProductSelection;
  logoUrl: string | null;
}) {
  return (
    <div
      aria-hidden="true"
      className={`${styles.previewRoot} ${styles.stickerPreview}`}
      data-shape={selected.shape ?? "square"}
      style={previewScale(selected.dimension)}
    >
      <div className={styles.stickerProduct}>
        <DesignArtwork selected={selected} logoUrl={logoUrl} />
      </div>
    </div>
  );
}

function WindowFilmPreview({
  selected,
  logoUrl,
}: {
  selected: ProductSelection;
  logoUrl: string | null;
}) {
  return (
    <div
      aria-hidden="true"
      className={`${styles.previewRoot} ${styles.windowFilmPreview}`}
      style={previewScale(selected.dimension)}
    >
      <div
        className={styles.windowFilmProduct}
        data-background={selected.background ?? "transparent"}
        data-finish={selected.finish ?? "matte"}
      >
        <DesignArtwork
          selected={selected}
          logoUrl={logoUrl}
          transparentBase={selected.background === "transparent"}
        />
      </div>
    </div>
  );
}

function TwoPiecePreview({
  selected,
  logoUrl,
}: {
  selected: ProductSelection;
  logoUrl: string | null;
}) {
  const orientation = selected.orientation ?? "portrait";
  return (
    <div
      aria-hidden="true"
      className={`${styles.previewRoot} ${styles.twoPiecePreview}`}
      data-orientation={orientation}
      style={previewScale(selected.dimension)}
    >
      <div className={styles.twoPieceObject} data-orientation={orientation}>
        <div className={styles.twoPieceInsert}>
          <DesignArtwork selected={selected} logoUrl={logoUrl} />
        </div>
        <Image
          src={
            orientation === "landscape"
              ? "/offer/products/two-piece-shell-landscape.png"
              : "/offer/products/two-piece-shell.png"
          }
          alt=""
          fill
          sizes="(max-width: 767px) 68vw, 430px"
          loading="eager"
          className={styles.twoPieceShell}
        />
      </div>
    </div>
  );
}

function CompactStandPreview({
  selected,
  logoUrl,
}: {
  selected: ProductSelection;
  logoUrl: string | null;
}) {
  return (
    <div
      aria-hidden="true"
      className={`${styles.previewRoot} ${styles.compactPreview}`}
      style={previewScale(selected.dimension)}
    >
      <div
        className={styles.compactObject}
        data-material={selected.material ?? "plastic"}
        data-background={selected.background ?? "white"}
      >
        <ProductMockup
          fill
          baseImageSrc="/offer/products/compact-shell-white.png"
          baseImageAlt=""
          sizes="(max-width: 767px) 64vw, 390px"
          transformConfig={COMPACT_STAND_TRANSFORM}
          baseImageClassName={styles.compactShell}
          overlayClassName={styles.compactFace}
          overlayBlendMode={selected.background === "white" ? "multiply" : "normal"}
          inkFilter="drop-shadow(0.35px 0.35px 0 rgb(255 255 255 / 0.2)) drop-shadow(-0.35px -0.35px 0 rgb(0 0 0 / 0.24))"
        >
          <DesignArtwork selected={selected} logoUrl={logoUrl} />
        </ProductMockup>
      </div>
    </div>
  );
}

function PremiumPreview({
  selected,
  logoUrl,
}: {
  selected: ProductSelection;
  logoUrl: string | null;
}) {
  const product = getProduct(selected.productId);
  if (!product) return null;
  return (
    <div
      aria-hidden="true"
      className={`${styles.previewRoot} ${styles.premiumPreview}`}
      style={previewScale(selected.dimension)}
    >
      <Image
        src={product.previewAsset}
        alt=""
        fill
        sizes="(max-width: 767px) 56vw, 320px"
        loading="eager"
        className={styles.premiumAsset}
      />
      <div
        className={styles.premiumPlane}
        style={{
          left: `${product.previewPlane.left}%`,
          top: `${product.previewPlane.top}%`,
          width: `${product.previewPlane.width}%`,
          height: `${product.previewPlane.height}%`,
        }}
      >
        <DesignArtwork selected={selected} logoUrl={logoUrl} />
      </div>
    </div>
  );
}

export function OfferProductPreview({
  selected,
  logoUrl,
}: {
  selected: ProductSelection;
  logoUrl: string | null;
}) {
  if (selected.productId === "stickers") {
    return <StickerPreview selected={selected} logoUrl={logoUrl} />;
  }
  if (selected.productId === "window-film") {
    return <WindowFilmPreview selected={selected} logoUrl={logoUrl} />;
  }
  if (selected.productId === "two-piece-stand") {
    return <TwoPiecePreview selected={selected} logoUrl={logoUrl} />;
  }
  if (selected.productId === "compact-stand") {
    return <CompactStandPreview selected={selected} logoUrl={logoUrl} />;
  }
  return <PremiumPreview selected={selected} logoUrl={logoUrl} />;
}
