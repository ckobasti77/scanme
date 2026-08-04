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
  BookOpen,
  CalendarDays,
  Camera,
  Clock,
  Contact,
  Coffee,
  CreditCard,
  Gift,
  Globe2,
  Heart,
  Home,
  Link as LinkIcon,
  type LucideIcon,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Music,
  Navigation,
  Percent,
  Phone,
  QrCode,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Tag,
  Ticket,
  Truck,
  User,
  Utensils,
} from "lucide-react";
import type { ScanMeLinksIconPackage } from "@/lib/scanme-links-design";
import { cn } from "@/lib/utils";
import styles from "./template-icon.module.css";

const brandIcons: Record<string, SimpleIcon> = {
  facebook: siFacebook,
  instagram: siInstagram,
  telegram: siTelegram,
  tiktok: siTiktok,
  viber: siViber,
  whatsapp: siWhatsapp,
  youtube: siYoutube,
};

// LinkedIn is intentionally NOT a brand glyph: simple-icons removed its mark
// after a trademark takedown, so `linkedin` falls through to a neutral contact
// glyph rather than reproducing LinkedIn's proprietary logo.
const genericIcons: Record<string, LucideIcon> = {
  calendar: CalendarDays,
  globe: Globe2,
  link: LinkIcon,
  linkedin: Contact,
  mail: Mail,
  "map-pin": MapPin,
  phone: Phone,
  store: Store,
  "shopping-bag": ShoppingBag,
  utensils: Utensils,
  coffee: Coffee,
  menu: Menu,
  ticket: Ticket,
  truck: Truck,
  percent: Percent,
  gift: Gift,
  star: Star,
  heart: Heart,
  sparkles: Sparkles,
  clock: Clock,
  music: Music,
  camera: Camera,
  "message-circle": MessageCircle,
  navigation: Navigation,
  tag: Tag,
  "credit-card": CreditCard,
  "book-open": BookOpen,
  user: User,
  home: Home,
  "qr-code": QrCode,
};

const PACKAGE_CLASS: Record<ScanMeLinksIconPackage, string> = {
  line: styles.line,
  solid: styles.solid,
  "soft-3d": styles.soft3d,
};

export function TemplateIcon({
  iconKey,
  className,
  packageStyle = "line",
}: {
  iconKey: string;
  className?: string;
  packageStyle?: ScanMeLinksIconPackage;
}) {
  const treatment = cn(styles.glyph, PACKAGE_CLASS[packageStyle]);
  const brand = brandIcons[iconKey];
  if (brand) {
    return (
      <svg
        viewBox="0 0 24 24"
        role="img"
        aria-hidden="true"
        className={cn(className, treatment)}
        fill="currentColor"
      >
        <path d={brand.path} />
      </svg>
    );
  }
  const Icon = genericIcons[iconKey] ?? LinkIcon;
  return (
    <Icon
      aria-hidden="true"
      className={cn(className, treatment, styles.generic)}
    />
  );
}
