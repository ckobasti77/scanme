"use client";

import { useEffect } from "react";

// Auto Moto Fest paper: fibre texture (420 px tile, fixed seed) and a fine
// grain (160 px), drawn once per page load exactly like the approved
// prototype (public/prototip/pasos-markice.html) and exposed as CSS custom
// properties on <html>. Only .fair-event--auto-moto maps them to
// --fair-paper-tex / --fair-noise; every other event keeps "none".
function paperTexture() {
  const size = 420;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  if (!g) return null;
  let seed = 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = "#fbf7ef";
  g.fillRect(0, 0, size, size);
  for (let k = 0; k < 26; k++) {
    const x = r() * size, y = r() * size, radius = 40 + r() * 120;
    const gradient = g.createRadialGradient(x, y, 0, x, y, radius);
    const alpha = 0.025 + r() * 0.035;
    gradient.addColorStop(0, r() < 0.6 ? `rgba(176,140,90,${alpha})` : `rgba(255,255,255,${alpha * 1.6})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        g.fillStyle = gradient;
        g.save();
        g.translate(ox, oy);
        g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        g.restore();
      }
    }
  }
  g.lineCap = "round";
  for (let k = 0; k < 520; k++) {
    const x = r() * size, y = r() * size, length = 4 + r() * 16, angle = r() * Math.PI * 2, curve = (r() - 0.5) * 6;
    g.strokeStyle = r() < 0.7 ? `rgba(150,118,78,${0.05 + r() * 0.09})` : `rgba(255,255,255,${0.25 + r() * 0.3})`;
    g.lineWidth = 0.35 + r() * 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(angle) * length / 2 + curve, y + Math.sin(angle) * length / 2 - curve, x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    g.stroke();
  }
  for (let k = 0; k < 160; k++) {
    g.fillStyle = `rgba(120,90,55,${0.06 + r() * 0.12})`;
    g.beginPath();
    g.arc(r() * size, r() * size, 0.3 + r() * 0.9, 0, 7);
    g.fill();
  }
  return canvas.toDataURL("image/jpeg", 0.86);
}

function paperGrain() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 160;
  const g = canvas.getContext("2d");
  if (!g) return null;
  const data = g.createImageData(160, 160);
  for (let i = 0; i < data.data.length; i += 4) {
    const value = (215 + Math.random() * 40) | 0;
    data.data[i] = value;
    data.data[i + 1] = value - 8;
    data.data[i + 2] = value - 20;
    data.data[i + 3] = Math.random() < 0.45 ? Math.random() * 30 : 0;
  }
  g.putImageData(data, 0, 0);
  return canvas.toDataURL();
}

export function FairPaperTexture() {
  useEffect(() => {
    if (!document.querySelector(".fair-event--auto-moto")) return;
    const root = document.documentElement.style;
    if (root.getPropertyValue("--fair-paper-texture-url")) return;
    const texture = paperTexture();
    const grain = paperGrain();
    if (texture) root.setProperty("--fair-paper-texture-url", `url(${texture})`);
    if (grain) root.setProperty("--fair-paper-grain-url", `url(${grain})`);
  }, []);
  return null;
}
