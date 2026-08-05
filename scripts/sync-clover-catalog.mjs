// Refresh only the managed/clover entry in the public subscription catalog
// from rvbbit-sql's extension seed. Other managed entries (for example Hare)
// have independent release lifecycles and are deliberately preserved.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const seedPath =
  process.env.CAPABILITY_CATALOG_SEED ??
  path.resolve(root, "../rvbbit-sql/crates/pg_rvbbit/src/capability_catalog_seed.json");
const publicPath = path.join(root, "public", "catalog.json");

const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
const baseRef = process.env.CLOVER_SYNC_BASE_REF;
const currentText = baseRef
  ? execFileSync("git", ["show", `${baseRef}:public/catalog.json`], {
      cwd: root,
      encoding: "utf8"
    })
  : fs.readFileSync(publicPath, "utf8");
const current = JSON.parse(currentText);
const source = (seed.capabilities ?? []).find(
  (item) => (item.catalog_entry?.id ?? item.id) === "managed/clover"
);
if (!source) throw new Error("managed/clover not found in capability seed");

const index = (current.capabilities ?? []).findIndex(
  (item) => item.id === "managed/clover"
);
if (index < 0) throw new Error("managed/clover not found in public catalog");

const entry = source.catalog_entry ?? source;
const previous = current.capabilities[index];
const sourcePublic = Object.fromEntries(
  Object.keys(previous).map((key) => [
    key,
    key === "capability_manifest" ? source.capability_manifest ?? {} : entry[key]
  ])
);
const replacement = mergePreservingShape(previous, sourcePublic);
current.capabilities[index] = replacement;
current.generated_at = new Date().toISOString();

fs.writeFileSync(publicPath, `${JSON.stringify(current, null, 2)}\n`);
console.log(
  `synced managed/clover (${replacement.operators?.length ?? 0} operators) to ${path.relative(root, publicPath)}`
);

function mergePreservingShape(previousValue, nextValue) {
  if (Array.isArray(nextValue)) {
    const previousArray = Array.isArray(previousValue) ? previousValue : [];
    return nextValue.map((item, index) => {
      const namedPrevious =
        item && typeof item === "object" && !Array.isArray(item) && item.name
          ? previousArray.find(
              (candidate) =>
                candidate &&
                typeof candidate === "object" &&
                !Array.isArray(candidate) &&
                candidate.name === item.name
            )
          : previousArray[index];
      return mergePreservingShape(namedPrevious, item);
    });
  }
  if (nextValue && typeof nextValue === "object") {
    const previousObject =
      previousValue && typeof previousValue === "object" && !Array.isArray(previousValue)
        ? previousValue
        : {};
    const output = {};
    for (const key of Object.keys(previousObject)) {
      if (Object.hasOwn(nextValue, key)) {
        output[key] = mergePreservingShape(previousObject[key], nextValue[key]);
      }
    }
    for (const key of Object.keys(nextValue)) {
      if (!Object.hasOwn(output, key)) output[key] = nextValue[key];
    }
    return output;
  }
  return nextValue;
}
