import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const root = process.cwd();
const docsDir = path.join(root, "content", "docs");

function markdownFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(fullPath);
    if (entry.isFile() && entry.name.endsWith(".md")) return [fullPath];
    return [];
  });
}

const missing = [];

for (const file of markdownFiles(docsDir)) {
  const parsed = matter(fs.readFileSync(file, "utf8"));
  const sources = parsed.data.sourceDocs ?? [];

  for (const source of sources) {
    const absolute = path.resolve(root, source);
    if (!fs.existsSync(absolute)) {
      missing.push({ file: path.relative(root, file), source });
    }
  }
}

if (missing.length > 0) {
  console.error("Missing source docs:");
  for (const item of missing) {
    console.error(`- ${item.file}: ${item.source}`);
  }
  process.exit(1);
}

console.log("All source doc references exist.");

