import {
  siFacebook,
  siInstagram,
  siTelegram,
  siTiktok,
  siViber,
  siWhatsapp,
  siYoutube,
  type SimpleIcon,
} from "simple-icons";
import {
  CalendarDays,
  Contact,
  Globe2,
  Link as LinkIcon,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";

const brandIcons: Record<string, SimpleIcon> = {
  facebook: siFacebook,
  instagram: siInstagram,
  telegram: siTelegram,
  tiktok: siTiktok,
  viber: siViber,
  whatsapp: siWhatsapp,
  youtube: siYoutube,
};

const genericIcons = {
  calendar: CalendarDays,
  globe: Globe2,
  link: LinkIcon,
  linkedin: Contact,
  mail: Mail,
  "map-pin": MapPin,
  phone: Phone,
};

export function TemplateIcon({
  iconKey,
  className,
}: {
  iconKey: string;
  className?: string;
}) {
  const brand = brandIcons[iconKey];
  if (brand) {
    return (
      <svg
        viewBox="0 0 24 24"
        role="img"
        aria-hidden="true"
        className={className}
        fill="currentColor"
      >
        <path d={brand.path} />
      </svg>
    );
  }
  const Icon = genericIcons[iconKey as keyof typeof genericIcons] ?? LinkIcon;
  return <Icon aria-hidden="true" className={className} strokeWidth={1.8} />;
}
