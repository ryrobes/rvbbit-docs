import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const root = process.cwd();
const sourcePath =
  process.env.CAPABILITY_CATALOG_SOURCE ??
  path.resolve(root, "../rvbbit-sql/capabilities/catalog.json");
const outputPath = path.join(root, "content", "capabilities", "catalog.json");

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function resolveSourcePath(relativePath) {
  if (!relativePath || typeof relativePath !== "string") return null;
  if (path.isAbsolute(relativePath)) return relativePath;

  const candidates = [
    path.resolve(path.dirname(sourcePath), relativePath),
    path.resolve(path.dirname(sourcePath), "..", relativePath),
    path.resolve(root, "../rvbbit-sql", relativePath)
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function readYamlObject(relativePath) {
  const resolvedPath = resolveSourcePath(relativePath);
  if (!resolvedPath) return {};

  try {
    return asObject(yaml.load(fs.readFileSync(resolvedPath, "utf8")));
  } catch {
    return {};
  }
}

function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const number = asNumber(value);
    if (number !== null) return number;
  }
  return null;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function normalizeResources(entry, manifest) {
  const resources = asObject(entry.resources ?? manifest.resources);
  const gpu = asObject(resources.gpu);
  const memory = asObject(
    resources.memory ?? resources.ram ?? resources.host_memory ?? resources.cpu
  );

  return {
    gpuRequired: Boolean(entry.gpu_required ?? gpu.required ?? false),
    gpuPlacement: firstString(entry.gpu_placement, gpu.placement),
    modelSizeBytes: firstNumber(
      entry.model_size_bytes,
      gpu.model_size_bytes,
      manifest.resources?.gpu?.model_size_bytes
    ),
    vramRequiredBytes: firstNumber(
      entry.vram_required_bytes,
      gpu.vram_required_bytes,
      gpu.required_bytes,
      manifest.resources?.gpu?.vram_required_bytes
    ),
    ramRequiredBytes: firstNumber(
      entry.ram_required_bytes,
      entry.memory_required_bytes,
      entry.host_ram_required_bytes,
      memory.ram_required_bytes,
      memory.memory_required_bytes,
      memory.required_bytes,
      memory.estimated_bytes,
      memory.max_rss_bytes
    ),
    resourceHeadroomPct: firstNumber(
      entry.vram_headroom_pct,
      entry.ram_headroom_pct,
      gpu.headroom_pct,
      memory.headroom_pct
    ),
    resourceEstimateSource: firstString(
      entry.resource_estimate_source,
      gpu.estimate_source,
      memory.estimate_source
    )
  };
}

function normalizeOperator(operator, capability) {
  const op =
    typeof operator === "string"
      ? { name: operator }
      : asObject(operator);

  return {
    name: String(op.name ?? op.operator_name ?? ""),
    description: firstString(
      op.description,
      op.summary,
      `Operator exported by ${capability.title}.`
    ),
    returnType: String(op.return_type ?? op.returnType ?? ""),
    parser: String(op.parser ?? ""),
    argNames: asArray(op.arg_names ?? op.argNames).map(String),
    argTypes: asArray(op.arg_types ?? op.argTypes).map(String),
    capabilityId: capability.id,
    capabilityTitle: capability.title,
    capabilityTags: capability.tags,
    capabilityVisibility: capability.visibility,
    backendName: capability.backendName,
    runtimeName: capability.runtimeName,
    device: capability.device
  };
}

function selectorFor(entry, manifest) {
  const resources = asObject(entry.resources ?? manifest.resources);
  const gpu = asObject(resources.gpu);
  if (entry.capability_role === "operator_runtime") return { docker: true };
  if (entry.gpu_required ?? gpu.required) return { gpu: true };
  return {};
}

function sqlLiteral(value) {
  return String(value).replaceAll("'", "''");
}

function deploySql(id, selector) {
  return `SELECT rvbbit.deploy_catalog_capability(
  catalog_id => '${sqlLiteral(id)}',
  target_selector => '${JSON.stringify(selector).replaceAll("'", "''")}'::jsonb
);`;
}

const raw = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const capabilities = asArray(raw.capabilities).map((item) => {
  const itemObject = asObject(item);
  const fileManifest = readYamlObject(itemObject.manifest_path);
  const manifest = asObject(
    itemObject.capability_manifest ??
      (asArray(fileManifest.operators).length > 0 ? fileManifest : itemObject)
  );
  const entry = asObject(itemObject.catalog_entry ?? itemObject);
  const resourceEstimate = normalizeResources(entry, manifest);
  const visibility = String(entry.catalog_visibility ?? "public");
  const id = String(entry.id ?? manifest.name ?? "");
  const selector = selectorFor(entry, manifest);
  const capability = {
    id,
    name: String(manifest.name ?? entry.name ?? id),
    title: String(manifest.title ?? entry.title ?? id),
    description: String(manifest.description ?? entry.description ?? ""),
    kind: String(manifest.kind ?? entry.kind ?? ""),
    visibility,
    tags: asArray(manifest.tags ?? entry.tags).map(String).sort(),
    device: String(entry.device ?? manifest.runtime?.device ?? ""),
    systemRuntime: Boolean(entry.system_runtime ?? false),
    capabilityRole: entry.capability_role ?? null,
    sourceProvider: entry.source_provider ?? manifest.source?.provider ?? null,
    sourceModel: entry.source_model ?? manifest.source?.model ?? null,
    sourceUrl: entry.source_url ?? manifest.source?.url ?? null,
    backendName: entry.backend_name ?? manifest.backend?.name ?? null,
    backendTransport: entry.backend_transport ?? manifest.backend?.transport ?? null,
    runtimeName: entry.runtime_name ?? null,
    runtimeLanguage: entry.runtime_language ?? null,
    runtimeTemplate: entry.runtime_template ?? manifest.runtime?.template ?? null,
    runtimeHandler: entry.runtime_handler ?? manifest.runtime?.handler ?? null,
    runtimeMode: entry.runtime_mode ?? null,
    packPath: entry.pack_path ?? null,
    manifestPath: entry.manifest_path ?? null,
    gpuRequired: resourceEstimate.gpuRequired,
    gpuPlacement: resourceEstimate.gpuPlacement,
    vramRequiredBytes: resourceEstimate.vramRequiredBytes,
    ramRequiredBytes: resourceEstimate.ramRequiredBytes,
    modelSizeBytes: resourceEstimate.modelSizeBytes,
    resourceHeadroomPct: resourceEstimate.resourceHeadroomPct,
    resourceEstimateSource: resourceEstimate.resourceEstimateSource,
    operators: [],
    deploySelector: selector,
    deploySql: deploySql(id, selector)
  };

  const operators = asArray(manifest.operators).length
    ? asArray(manifest.operators)
    : asArray(entry.operators);

  capability.operators = operators
    .map((operator) => normalizeOperator(operator, capability))
    .filter((operator) => operator.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  return capability;
});

const operatorsByName = new Map();
for (const capability of capabilities) {
  for (const operator of capability.operators) {
    const existing = operatorsByName.get(operator.name) ?? {
      name: operator.name,
      description: operator.description,
      returnType: operator.returnType,
      parser: operator.parser,
      argNames: operator.argNames,
      argTypes: operator.argTypes,
      capabilities: []
    };

    existing.capabilities.push({
      id: capability.id,
      title: capability.title,
      visibility: capability.visibility,
      tags: capability.tags,
      backendName: capability.backendName,
      runtimeName: capability.runtimeName,
      device: capability.device
    });
    operatorsByName.set(operator.name, existing);
  }
}

const output = {
  generatedAt: new Date().toISOString(),
  sourcePath: path.relative(root, sourcePath),
  sourceSchemaVersion: raw.schema_version ?? null,
  sourceCatalogLayout: raw.catalog_layout ?? null,
  sourceCatalog: raw.catalog_source ?? null,
  capabilities: capabilities.sort((a, b) => a.title.localeCompare(b.title)),
  operators: Array.from(operatorsByName.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  )
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(
  `Exported ${output.capabilities.length} capabilities and ${output.operators.length} operators to ${path.relative(root, outputPath)}`
);
