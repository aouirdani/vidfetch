// Optional maintenance command; sharp is provided by Next.js.
// Refuses to overwrite an existing image. Preserve it before regenerating.
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
const svg = await readFile("public/og-image.svg");
const jpeg = await sharp(svg).jpeg({ quality: 88 }).toBuffer();
await writeFile("public/og-image-v3.jpg", jpeg, { flag: "wx" });
console.log("Created public/og-image-v3.jpg (1200 × 630)");
