import sharp from "sharp";

export type ImageSignature = {
  perceptualHash: string;
  averageColor: string;
  colorSignature: number[];
};

export type AnalyzedImage = ImageSignature & {
  normalizedBuffer: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
  sizeBytes: number;
};

const NORMALIZED_MAX_SIZE = 1600;
const HASH_SIZE = 8;
const COLOR_GRID_SIZE = 4;

export const imageAnalysisService = {
  async analyze(buffer: Buffer): Promise<AnalyzedImage> {
    const normalizedBuffer = await sharp(buffer, { failOn: "warning" })
      .rotate()
      .resize({
        width: NORMALIZED_MAX_SIZE,
        height: NORMALIZED_MAX_SIZE,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: 82 })
      .toBuffer();

    const metadata = await sharp(normalizedBuffer).metadata();
    const signature = await this.signature(normalizedBuffer);

    return {
      ...signature,
      normalizedBuffer,
      mimeType: "image/webp",
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      sizeBytes: normalizedBuffer.byteLength
    };
  },

  async signature(buffer: Buffer): Promise<ImageSignature> {
    const hashPixels = await sharp(buffer)
      .rotate()
      .resize(HASH_SIZE, HASH_SIZE, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer();

    const averageLuma = hashPixels.reduce((sum, value) => sum + value, 0) / hashPixels.length;
    const perceptualHash = [...hashPixels].map((value) => (value >= averageLuma ? "1" : "0")).join("");

    const colorPixels = await sharp(buffer)
      .rotate()
      .resize(COLOR_GRID_SIZE, COLOR_GRID_SIZE, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer();

    const colorSignature = [...colorPixels];
    const averageColor = averageHexColor(colorSignature);

    return {
      perceptualHash,
      averageColor,
      colorSignature
    };
  },

  similarity(a: ImageSignature, b: ImageSignature) {
    const hashScore = hammingSimilarity(a.perceptualHash, b.perceptualHash);
    const colorScore = colorSimilarity(a.colorSignature, b.colorSignature);
    return hashScore * 0.62 + colorScore * 0.38;
  }
};

function hammingSimilarity(a: string, b: string) {
  const length = Math.min(a.length, b.length);
  if (length === 0) {
    return 0;
  }

  let distance = 0;
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) {
      distance += 1;
    }
  }

  return 1 - distance / length;
}

function colorSimilarity(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  if (length === 0) {
    return 0;
  }

  let squaredDistance = 0;
  for (let index = 0; index < length; index += 1) {
    squaredDistance += ((a[index] ?? 0) - (b[index] ?? 0)) ** 2;
  }

  const maxDistance = Math.sqrt(length * 255 ** 2);
  return Math.max(0, 1 - Math.sqrt(squaredDistance) / maxDistance);
}

function averageHexColor(values: number[]) {
  if (values.length === 0) {
    return "#000000";
  }

  let red = 0;
  let green = 0;
  let blue = 0;
  const pixels = Math.floor(values.length / 3);
  for (let index = 0; index < pixels; index += 1) {
    red += values[index * 3] ?? 0;
    green += values[index * 3 + 1] ?? 0;
    blue += values[index * 3 + 2] ?? 0;
  }

  return `#${[red, green, blue]
    .map((value) => Math.round(value / Math.max(pixels, 1)).toString(16).padStart(2, "0"))
    .join("")}`;
}
