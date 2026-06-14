"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type {
  CapabilityCatalog,
  CapabilityPack,
  OperatorIndexItem
} from "@/lib/capabilities";
import { formatBytes, operatorSignature } from "@/lib/capabilities";
import { SqlCode } from "@/components/SqlCode";

type CapabilityExplorerProps = {
  catalog: CapabilityCatalog;
};

type ViewMode = "packs" | "operators";
type VisibilityMode = "public" | "all";

function textMatches(text: string, query: string) {
  return text.toLowerCase().includes(query);
}

function packSearchText(pack: CapabilityPack) {
  return [
    pack.id,
    pack.title,
    pack.description,
    pack.kind,
    pack.visibility,
    pack.device,
    pack.sourceModel,
    pack.sourceProvider,
    pack.backendName,
    pack.runtimeName,
    pack.tags.join(" "),
    pack.operators.map((operator) => operator.name).join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function operatorSearchText(operator: OperatorIndexItem) {
  return [
    operator.name,
    operator.description,
    operator.returnType,
    operator.parser,
    operator.argNames.join(" "),
    operator.argTypes.join(" "),
    operator.capabilities.map((capability) => capability.title).join(" "),
    operator.capabilities.map((capability) => capability.id).join(" "),
    operator.capabilities.flatMap((capability) => capability.tags).join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="capability-badge">{children}</span>;
}

function ResourceSummary({ pack }: { pack: CapabilityPack }) {
  const ram = formatBytes(pack.ramRequiredBytes);
  const vram = formatBytes(pack.vramRequiredBytes);
  const modelSize = formatBytes(pack.modelSizeBytes);

  if (!ram && !vram && !modelSize) return <>not declared</>;

  return (
    <span className="capability-resource-summary">
      {ram ? <span>RAM {ram}</span> : null}
      {vram ? <span>VRAM {vram}</span> : null}
      {modelSize ? <span>model {modelSize}</span> : null}
    </span>
  );
}

function CapabilityCard({ pack }: { pack: CapabilityPack }) {
  return (
    <article className="capability-pack-card">
      <div className="capability-card-topline">
        <span>{pack.id}</span>
        <Badge>{pack.visibility}</Badge>
      </div>
      <h2>{pack.title}</h2>
      <p>{pack.description}</p>
      <div className="capability-badge-row">
        {pack.systemRuntime ? <Badge>runtime</Badge> : null}
        {pack.capabilityRole ? <Badge>{pack.capabilityRole}</Badge> : null}
        {pack.device ? <Badge>{pack.device}</Badge> : null}
        {pack.gpuRequired ? <Badge>gpu</Badge> : null}
        {pack.gpuPlacement ? <Badge>{pack.gpuPlacement}</Badge> : null}
        {pack.kind ? <Badge>{pack.kind}</Badge> : null}
      </div>
      <dl className="capability-meta-grid">
        <div>
          <dt>Backend</dt>
          <dd>{pack.backendName ?? pack.runtimeName ?? "runtime"}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{pack.sourceModel ?? "bundled runtime"}</dd>
        </div>
        <div>
          <dt>Operators</dt>
          <dd>{pack.operators.length}</dd>
        </div>
        <div>
          <dt>Resources</dt>
          <dd>
            <ResourceSummary pack={pack} />
          </dd>
        </div>
      </dl>
      <div className="capability-operator-list">
        {pack.operators.map((operator) => (
          <span key={operator.name}>{operator.name}</span>
        ))}
      </div>
      <details className="capability-sql">
        <summary>SQL deployment</summary>
        <SqlCode ariaLabel={`${pack.title} deployment SQL`}>{pack.deploySql}</SqlCode>
      </details>
    </article>
  );
}

function OperatorCard({ operator }: { operator: OperatorIndexItem }) {
  return (
    <article className="capability-operator-card">
      <div className="capability-card-topline">
        <span>{operator.returnType || "void"}</span>
        <Badge>{operator.capabilities.length} pack{operator.capabilities.length === 1 ? "" : "s"}</Badge>
      </div>
      <h2>{operator.name}</h2>
      <code>{operatorSignature(operator)}</code>
      <p>{operator.description || "No description declared."}</p>
      <div className="capability-pack-links">
        {operator.capabilities.map((capability) => (
          <span key={capability.id}>{capability.title}</span>
        ))}
      </div>
    </article>
  );
}

export function CapabilityExplorer({ catalog }: CapabilityExplorerProps) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("packs");
  const [visibility, setVisibility] = useState<VisibilityMode>("public");

  const normalizedQuery = query.trim().toLowerCase();

  const visiblePacks = useMemo(() => {
    return catalog.capabilities.filter((pack) => {
      if (visibility === "public" && pack.visibility !== "public") return false;
      if (!normalizedQuery) return true;
      return textMatches(packSearchText(pack), normalizedQuery);
    });
  }, [catalog.capabilities, normalizedQuery, visibility]);

  const visibleOperators = useMemo(() => {
    return catalog.operators.filter((operator) => {
      const hasVisibleCapability = operator.capabilities.some((capability) =>
        visibility === "public" ? capability.visibility === "public" : true
      );
      if (!hasVisibleCapability) return false;
      if (!normalizedQuery) return true;
      return textMatches(operatorSearchText(operator), normalizedQuery);
    });
  }, [catalog.operators, normalizedQuery, visibility]);

  return (
    <section className="capability-explorer">
      <div className="capability-controls">
        <label className="capability-search">
          <Search aria-hidden="true" size={18} />
          <span className="sr-only">Search capabilities and operators</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search models, tags, operators, runtimes..."
            type="search"
            value={query}
          />
        </label>
        <div className="capability-segment" aria-label="Catalog view">
          <button
            aria-pressed={view === "packs"}
            onClick={() => setView("packs")}
            type="button"
          >
            Capability Packs
          </button>
          <button
            aria-pressed={view === "operators"}
            onClick={() => setView("operators")}
            type="button"
          >
            Operators
          </button>
        </div>
        <div className="capability-segment" aria-label="Visibility filter">
          <button
            aria-pressed={visibility === "public"}
            onClick={() => setVisibility("public")}
            type="button"
          >
            Public
          </button>
          <button
            aria-pressed={visibility === "all"}
            onClick={() => setVisibility("all")}
            type="button"
          >
            All
          </button>
        </div>
      </div>

      <div className="capability-result-line">
        {view === "packs" ? (
          <span>
            Showing {visiblePacks.length} of {catalog.capabilities.length} shipped
            catalog packs.
          </span>
        ) : (
          <span>
            Showing {visibleOperators.length} of {catalog.operators.length} SQL
            operators.
          </span>
        )}
        <span>Generated from {catalog.sourcePath}</span>
      </div>

      {view === "packs" ? (
        <div className="capability-pack-grid">
          {visiblePacks.map((pack) => (
            <CapabilityCard key={pack.id} pack={pack} />
          ))}
        </div>
      ) : (
        <div className="capability-operator-grid">
          {visibleOperators.map((operator) => (
            <OperatorCard key={operator.name} operator={operator} />
          ))}
        </div>
      )}
    </section>
  );
}
