import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import ts from "typescript";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultAssetsDirectory = path.resolve(scriptDirectory, "../dist/assets");

// Derived from the post-PR-06 production build (553,481 B raw / 168,928 B gzip),
// with roughly 15% room for intentional dependency or product changes.
export const MAX_LARGEST_JAVASCRIPT_BYTES = 637_000;
export const MAX_LARGEST_JAVASCRIPT_GZIP_BYTES = 195_000;

export interface BundleSizeResult {
  filePath: string;
  rawBytes: number;
  gzipBytes: number;
}

export function findLargestJavaScriptBundle(assetsDirectory = defaultAssetsDirectory): BundleSizeResult {
  const files = ts.sys.readDirectory(assetsDirectory, [".js"], undefined, ["**/*.js"]);
  if (files.length === 0) {
    throw new Error(`No JavaScript bundles found in ${assetsDirectory}. Run npm run build first.`);
  }

  return files
    .map((filePath) => {
      const contents = readFileSync(filePath);
      return { filePath, rawBytes: contents.byteLength, gzipBytes: gzipSync(contents).byteLength };
    })
    .sort((left, right) => right.rawBytes - left.rawBytes)[0];
}

export function checkBundleSize(
  assetsDirectory = defaultAssetsDirectory,
  rawLimit = MAX_LARGEST_JAVASCRIPT_BYTES,
  gzipLimit = MAX_LARGEST_JAVASCRIPT_GZIP_BYTES,
): BundleSizeResult {
  const bundle = findLargestJavaScriptBundle(assetsDirectory);
  console.log(`Largest JS: ${path.relative(process.cwd(), bundle.filePath)} (${bundle.rawBytes} B raw, ${bundle.gzipBytes} B gzip)`);
  console.log(`Budget: ${rawLimit} B raw, ${gzipLimit} B gzip`);

  if (bundle.rawBytes > rawLimit || bundle.gzipBytes > gzipLimit) {
    throw new Error("Largest JavaScript bundle exceeds its regression budget.");
  }

  return bundle;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    checkBundleSize();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
