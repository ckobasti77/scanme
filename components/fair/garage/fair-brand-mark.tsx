import Image from "next/image";
import {
  siAudi,
  siBmw,
  siCitroen,
  siFord,
  siToyota,
  siVolvo,
  type SimpleIcon,
} from "simple-icons";

const icons: Record<string, SimpleIcon> = {
  audi: siAudi,
  bmw: siBmw,
  citroen: siCitroen,
  "citroën": siCitroen,
  ford: siFord,
  toyota: siToyota,
  volvo: siVolvo,
};

export function FairBrandMark({ brandName, className }: { brandName: string; className?: string }) {
  const key = brandName.replace(/^TEST\s+/i, "").trim().toLocaleLowerCase("sr-Latn");
  const icon = icons[key];

  if (key === "geely") {
    return <Image className={className} src="/fair/brands/geely.svg" width={76} height={42} alt="" aria-hidden="true" />;
  }

  if (!icon) {
    return <span className={className} aria-hidden="true">{key.slice(0, 2).toUpperCase()}</span>;
  }

  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={icon.path} fill="currentColor" />
    </svg>
  );
}
