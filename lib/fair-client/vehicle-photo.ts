import type { CSSProperties } from "react";

// Fill each frame; keep the focal point on the vehicle rather than the sky/ceiling.
const POSITIONS: Record<string, string> = {
  "bentu-mango.webp": "50% 55%",
  "chery-arrizo-8-phev.webp": "50% 78%",
  "chery-tiggo-4-pro-hev.webp": "50% 78%",
  "chery-tiggo-9-phev.webp": "50% 78%",
  "foton-cavan-c1-plus.webp": "50% 84%",
  "foton-etunland.webp": "50% 70%",
  "foton-eview-grand.webp": "50% 84%",
  "foton-eview.webp": "50% 84%",
  "jmev-elight-event.jpg": "50% 70%",
  "jmev-elight.jpg": "50% 70%",
  "jmev-ev3-event.jpg": "50% 65%",
  "jmev-ev3.jpg": "50% 65%",
  "jmev-ewind-event.jpg": "50% 65%",
  "jmev-ewind.jpg": "50% 65%",
  "mazda-cx-5-homura.webp": "50% 80%",
  "mazda-cx-60-homura-plus.webp": "50% 80%",
  "mazda-cx-6e-takumi-plus.webp": "50% 65%",
  "yudo-air-ultra.webp": "50% 55%",
};

export function fairVehiclePhotoStyle(src: string): CSSProperties {
  const filename = src.split(/[?#]/)[0].split("/").pop() ?? "";
  return { objectFit: "cover", objectPosition: POSITIONS[filename] ?? "50% 65%" };
}
