import type { Metadata } from "next";
import { CapabilityExplorer } from "@/components/CapabilityExplorer";
import { SqlCode } from "@/components/SqlCode";
import { capabilityCatalog } from "@/lib/capabilities";

export const metadata: Metadata = {
  title: "Capability Catalog",
  description:
    "Search the shipped RVBBIT capability catalog by pack or SQL operator."
};

export default function CapabilitiesPage() {
  const publicPacks = capabilityCatalog.capabilities.filter(
    (capability) => capability.visibility === "public"
  );
  const runtimePacks = capabilityCatalog.capabilities.filter(
    (capability) => capability.capabilityRole === "operator_runtime"
  );

  return (
    <main className="capability-page">
      <section className="capability-hero">
        <p className="eyebrow">Shipped capability catalog</p>
        <h1>Installable operators for Warren.</h1>
        <p>
          RVBBIT ships a curated catalog with the extension. Packs are catalog
          rows until deployed; Warren installs the selected runtime or model
          backend and exposes its SQL operators.
        </p>
        <div className="capability-hero-metrics" aria-label="Capability summary">
          <div>
            <span>Public packs</span>
            <strong>{publicPacks.length}</strong>
          </div>
          <div>
            <span>SQL operators</span>
            <strong>{capabilityCatalog.operators.length}</strong>
          </div>
          <div>
            <span>Runtime packs</span>
            <strong>{runtimePacks.length}</strong>
          </div>
        </div>
      </section>

      <section className="capability-install-panel">
        <div>
          <p className="eyebrow">SQL deployment</p>
          <h2>CLI is optional once the catalog is seeded.</h2>
          <p>
            Fresh extension installs seed <code>rvbbit.capability_catalog</code>.
            A UI or SQL client can queue an install directly with
            <code> deploy_catalog_capability</code>. The CLI remains useful for
            publishing catalog changes, scaffolding packs, and local
            development workflows.
          </p>
        </div>
        <SqlCode ariaLabel="Capability deployment SQL">{`SELECT rvbbit.deploy_catalog_capability(
  catalog_id => 'extract/gliner-medium-v2.1',
  target_selector => '{}'::jsonb
);

SELECT *
FROM rvbbit.warren_jobs
ORDER BY created_at DESC
LIMIT 5;`}</SqlCode>
      </section>

      <CapabilityExplorer catalog={capabilityCatalog} />
    </main>
  );
}
