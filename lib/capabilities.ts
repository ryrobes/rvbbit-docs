import catalogData from "@/content/capabilities/catalog.json";

export type CapabilityOperator = {
  name: string;
  description: string;
  returnType: string;
  parser: string;
  argNames: string[];
  argTypes: string[];
  capabilityId: string;
  capabilityTitle: string;
  capabilityTags: string[];
  capabilityVisibility: string;
  backendName: string | null;
  runtimeName: string | null;
  device: string;
};

export type CapabilityPack = {
  id: string;
  name: string;
  title: string;
  description: string;
  kind: string;
  visibility: string;
  tags: string[];
  device: string;
  systemRuntime: boolean;
  capabilityRole: string | null;
  sourceProvider: string | null;
  sourceModel: string | null;
  sourceUrl: string | null;
  backendName: string | null;
  backendTransport: string | null;
  runtimeName: string | null;
  runtimeLanguage: string | null;
  runtimeTemplate: string | null;
  runtimeHandler: string | null;
  runtimeMode: string | null;
  packPath: string | null;
  manifestPath: string | null;
  gpuRequired: boolean;
  gpuPlacement: string | null;
  vramRequiredBytes: number | null;
  ramRequiredBytes: number | null;
  modelSizeBytes: number | null;
  resourceHeadroomPct: number | null;
  resourceEstimateSource: string | null;
  operators: CapabilityOperator[];
  deploySelector: Record<string, unknown>;
  deploySql: string;
};

export type OperatorIndexItem = {
  name: string;
  description: string;
  returnType: string;
  parser: string;
  argNames: string[];
  argTypes: string[];
  capabilities: Array<{
    id: string;
    title: string;
    visibility: string;
    tags: string[];
    backendName: string | null;
    runtimeName: string | null;
    device: string;
  }>;
};

export type CapabilityCatalog = {
  generatedAt: string;
  sourcePath: string;
  sourceSchemaVersion: number | null;
  sourceCatalogLayout: string | null;
  sourceCatalog: string | null;
  capabilities: CapabilityPack[];
  operators: OperatorIndexItem[];
};

export const capabilityCatalog = catalogData as CapabilityCatalog;

export function operatorSignature(operator: {
  name: string;
  argNames: string[];
  argTypes: string[];
}) {
  const args = operator.argNames.map((name, index) => {
    const type = operator.argTypes[index] ?? "unknown";
    return `${name} ${type}`;
  });
  return `rvbbit.${operator.name}(${args.join(", ")})`;
}

export function formatBytes(value: number | null | undefined) {
  if (!value) return null;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GiB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MiB`;
  return `${value} bytes`;
}
