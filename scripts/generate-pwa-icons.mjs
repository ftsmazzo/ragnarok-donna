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
    .resize(size, size)
    .png()
    .toFile(join(root, "public/branding", name));
  console.log(`wrote ${name}`);
}

// Next.js + iOS leem estes caminhos ao adicionar à tela inicial
const appIcons = [
  ["src/app/apple-icon.png", 180],
  ["src/app/icon.png", 192],
  ["src/app/pwa/apple-icon.png", 180],
  ["src/app/pwa/icon.png", 192],
  ["public/apple-touch-icon.png", 180],
];
for (const [rel, size] of appIcons) {
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(join(root, rel));
  console.log(`wrote ${rel}`);
}
