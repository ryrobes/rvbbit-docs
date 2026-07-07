import fs from "node:fs";
import path from "node:path";

const publicRoot = path.join(process.cwd(), "public");

function publicFilePath(src: string) {
  const cleanSrc = src.split("?")[0]?.replace(/^\/+/, "") ?? "";
  const filePath = path.join(publicRoot, cleanSrc);
  const relative = path.relative(publicRoot, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return filePath;
}

export function publicAssetVersion(src: string): string | null {
  const filePath = publicFilePath(src);
  if (!filePath) return null;

  try {
    const stat = fs.statSync(filePath);
    return `${Math.floor(stat.mtimeMs).toString(36)}-${stat.size.toString(36)}`;
  } catch {
    return null;
  }
}

export function versionedPublicAssetSrc(src: string): string {
  if (!src.startsWith("/shots/") && !src.startsWith("shots/")) return src;

  const version = publicAssetVersion(src);
  if (!version) return src;

  const separator = src.includes("?") ? "&" : "?";
  return `${src}${separator}v=${version}`;
}
