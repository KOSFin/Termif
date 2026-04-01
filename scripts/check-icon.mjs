import fs from "node:fs";
import path from "node:path";

const iconPath = path.resolve("src-tauri", "icons", "icon.ico");
const requiredSizes = [16, 24, 32, 48, 64, 128, 256];
const recommendedSizes = [40, 96];

function fail(message) {
  console.error(`Icon check failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(iconPath)) {
  fail(`file not found: ${iconPath}`);
}

const data = fs.readFileSync(iconPath);
if (data.length < 6) {
  fail("icon file is too small");
}

const reserved = data.readUInt16LE(0);
const type = data.readUInt16LE(2);
const count = data.readUInt16LE(4);

if (reserved !== 0 || type !== 1) {
  fail("not a valid ICO header");
}

if (count <= 0) {
  fail("icon has no image entries");
}

const entries = [];
for (let i = 0; i < count; i += 1) {
  const offset = 6 + i * 16;
  if (offset + 16 > data.length) {
    fail(`entry ${i + 1} is truncated`);
  }

  const wRaw = data.readUInt8(offset);
  const hRaw = data.readUInt8(offset + 1);
  const width = wRaw === 0 ? 256 : wRaw;
  const height = hRaw === 0 ? 256 : hRaw;
  const bitDepth = data.readUInt16LE(offset + 6);
  const bytesInRes = data.readUInt32LE(offset + 8);
  const imageOffset = data.readUInt32LE(offset + 12);

  entries.push({ width, height, bitDepth, bytesInRes, imageOffset });
}

const squareOnly = entries.every((entry) => entry.width === entry.height);
if (!squareOnly) {
  fail("all icon entries must be square");
}

const uniqueSizes = [...new Set(entries.map((entry) => entry.width))].sort((a, b) => a - b);
const missingRequired = requiredSizes.filter((size) => !uniqueSizes.includes(size));

if (missingRequired.length > 0) {
  fail(
    `missing required sizes: ${missingRequired.join(", ")} (present: ${uniqueSizes.join(", ")})`
  );
}

const lowBitDepth = entries.filter((entry) => entry.bitDepth < 32);
if (lowBitDepth.length > 0) {
  fail("all icon entries must be 32-bit (RGBA) for quality and transparency");
}

const missingRecommended = recommendedSizes.filter((size) => !uniqueSizes.includes(size));

console.log(`Icon check passed: ${iconPath}`);
console.log(`Entries: ${entries.length}`);
console.log(`Sizes: ${uniqueSizes.join(", ")}`);
if (missingRecommended.length > 0) {
  console.warn(`Recommended sizes missing: ${missingRecommended.join(", ")}`);
}
