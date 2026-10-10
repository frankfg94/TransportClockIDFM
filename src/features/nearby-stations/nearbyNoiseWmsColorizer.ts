export type NearbyNoiseWmsWorkerRequest =
  | { id: number; type: "recolor"; blob: Blob }
  | { id: number; type: "cancel" };

export type NearbyNoiseWmsWorkerResponse =
  | { id: number; ok: true; blob: Blob; width: number; height: number; levels: ArrayBuffer }
  | { id: number; ok: false; message: string };

const SOURCE_CLASS_COLORS: readonly { rgb: readonly [number, number, number]; level: 1 | 2 | 3 }[] = [
  { rgb: [221, 235, 247], level: 1 },
  { rgb: [142, 186, 226], level: 1 },
  { rgb: [47, 117, 181], level: 1 },
  { rgb: [190, 190, 190], level: 2 },
  { rgb: [255, 211, 71], level: 2 },
  { rgb: [173, 83, 170], level: 2 },
  { rgb: [128, 128, 128], level: 3 },
  { rgb: [184, 155, 84], level: 3 },
  { rgb: [213, 9, 9], level: 3 },
];

const DISPLAY_CLASS_COLORS: Record<1 | 2 | 3, readonly [number, number, number]> = {
  1: [34, 197, 94],
  2: [250, 204, 21],
  3: [239, 68, 68],
};

const OVERLAY_OPACITY = 0.25;

/** Recolor a pixel range while keeping the existing class matching and alpha rules. */
export function recolorNearbyNoisePixelRange(
  pixels: Uint8ClampedArray,
  levels: Uint8Array,
  startPixel: number,
  endPixel: number,
): void {
  const firstPixel = Math.max(0, startPixel);
  const lastPixel = Math.min(levels.length, endPixel);

  for (let pixelIndex = firstPixel; pixelIndex < lastPixel; pixelIndex += 1) {
    const colorOffset = pixelIndex * 4;
    const red = pixels[colorOffset] ?? 0;
    const green = pixels[colorOffset + 1] ?? 0;
    const blue = pixels[colorOffset + 2] ?? 0;
    const alpha = pixels[colorOffset + 3] ?? 0;
    const match = closestNoiseClass(red, green, blue);

    if (alpha === 0 || !match || (red > 248 && green > 248 && blue > 248)) {
      pixels[colorOffset + 3] = 0;
      continue;
    }

    levels[pixelIndex] = match.level;
    const target = DISPLAY_CLASS_COLORS[match.level];
    pixels[colorOffset] = target[0];
    pixels[colorOffset + 1] = target[1];
    pixels[colorOffset + 2] = target[2];
    pixels[colorOffset + 3] = Math.round(alpha * OVERLAY_OPACITY);
  }
}

function closestNoiseClass(red: number, green: number, blue: number): typeof SOURCE_CLASS_COLORS[number] | undefined {
  let closest: typeof SOURCE_CLASS_COLORS[number] | undefined;
  let closestDistance = 68 ** 2;
  for (const candidate of SOURCE_CLASS_COLORS) {
    const deltaRed = red - candidate.rgb[0];
    const deltaGreen = green - candidate.rgb[1];
    const deltaBlue = blue - candidate.rgb[2];
    const distance = deltaRed ** 2 + deltaGreen ** 2 + deltaBlue ** 2;
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}
