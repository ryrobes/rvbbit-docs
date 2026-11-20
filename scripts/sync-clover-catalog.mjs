// Refresh release-controlled entries in the public subscription/integration
// catalog from rvbbit-sql's extension seed. Other managed entries (for
// example Hare) have independent release lifecycles and are deliberately
// preserved.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const seedPath =
  process.env.CAPABILITY_CATALOG_SEED ??
  path.resolve(root, "../rvbbit-sql/crates/pg_rvbbit/src/capability_catalog_seed.json");
const publicPath = path.join(root, "public", "catalog.json");
const syncedIds = ["managed/clover", "integrations/google-meet-brain"];

const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
const baseRef = process.env.CLOVER_SYNC_BASE_REF;
const currentText = baseRef
  ? execFileSync("git", ["show", `${baseRef}:public/catalog.json`], {
      cwd: root,
      encoding: "utf8"
    })
  : fs.readFileSync(publicPath, "utf8");
const current = JSON.parse(currentText);
const replacements = [];
for (const id of syncedIds) {
  const source = (seed.capabilities ?? []).find(
    (item) => (item.catalog_entry?.id ?? item.id) === id
  );
  if (!source) throw new Error(`${id} not found in capability seed`);

  const entry = source.catalog_entry ?? source;
  const index = (current.capabilities ?? []).findIndex((item) => item.id === id);
  const previous = index >= 0 ? current.capabilities[index] : null;
  // Preserve the intentionally compact, stable Clover document shape. New
  // integration entries publish their complete catalog metadata plus the
  // install manifest required by DataRabbit's URL importer.
  const sourcePublic = previous && id === "managed/clover"
    ? Object.fromEntries(
        Object.keys(previous).map((key) => [
          key,
          key === "capability_manifest" ? source.capability_manifest ?? {} : entry[key]
        ])
      )
    : { ...entry, capability_manifest: source.capability_manifest ?? {} };
  const replacement = previous
    ? mergePreservingShape(previous, sourcePublic)
    : sourcePublic;

  if (index >= 0) current.capabilities[index] = replacement;
  else current.capabilities.push(replacement);
  replacements.push(replacement);
}
current.generated_at = new Date().toISOString();

// Hosted Clover (checkout, clover.rvbb.it, subscription copy) must not be
// republished. Calliope wires Hutch itself; this catalog is not an installer.
for (const cap of current.capabilities ?? []) {
  if (cap.id !== "managed/clover") continue;
  cap.description =
    "Self-hosted Clover operators inside Calliope. Hutch routes model calls through your OpenRouter key. There is no Clover account or subscription.";
  const managed = cap.capability_manifest?.managed;
  if (!managed) continue;
  for (const key of ["pricing", "key_env", "endpoint", "free_tier", "value_props", "highlights", "privacy", "tagline"]) {
    delete managed[key];
  }
  managed.install = {
    ...(managed.install ?? {}),
    sql: [
      "-- Hosted Clover is retired. Calliope registers operators during install. See https://rvbbit.ai/clover"
    ]
  };
}

fs.writeFileSync(publicPath, `${JSON.stringify(current, null, 2)}\n`);
console.log(
  `synced ${replacements.map((entry) => entry.id).join(", ")} to ${path.relative(root, publicPath)}`
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
