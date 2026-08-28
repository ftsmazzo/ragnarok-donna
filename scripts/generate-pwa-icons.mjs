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
