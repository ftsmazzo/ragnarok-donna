import sharp from "sharp";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "public/branding/ragnarok-app-icon.svg"));

const sizes = [
  { name: "ragnarok-app-icon-180.png", size: 180 },
  { name: "ragnarok-app-icon-192.png", size: 192 },
  { name: "ragnarok-app-icon-512.png", size: 512 },
  { name: "ragnarok-favicon.png", size: 192 },
];

for (const { name, size } of sizes) {
  await sharp(svg, { density: 300 })
    .resize(size, size, { fit: "contain", background: "#fbf7ee" })
    .flatten({ background: "#fbf7ee" })
    .png()
    .toFile(join(root, "public/branding", name));
  console.log(`wrote ${name}`);
}

// Ícones estáticos em /public — iOS exige acesso público sem auth (middleware).
const publicIcons = [
  ["public/apple-touch-icon.png", 180],
  ["public/apple-touch-icon-precomposed.png", 180],
  ["public/icon-192.png", 192],
];
for (const [rel, size] of publicIcons) {
  await sharp(svg, { density: 300 })
    .resize(size, size, { fit: "contain", background: "#fbf7ee" })
    .flatten({ background: "#fbf7ee" })
    .png()
    .toFile(join(root, rel));
  console.log(`wrote ${rel}`);
}

const logoSvg = readFileSync(join(root, "public/branding/ragnarok-logo.svg"));
await sharp(logoSvg, { density: 300 })
  .resize(600, 200, { fit: "inside", background: { r: 255, g: 255, b: 255, alpha: 0 } })
  .png()
  .toFile(join(root, "public/branding/ragnarok-logo.png"));
console.log("wrote ragnarok-logo.png");
