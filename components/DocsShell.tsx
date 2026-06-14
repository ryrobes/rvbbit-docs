import Link from "next/link";
import type { DocMeta } from "@/lib/docs";

type DocsShellProps = {
  docs: DocMeta[];
  currentSlug: string;
  children: React.ReactNode;
  sourceDocs?: string[];
};

export function DocsShell({
  docs,
  currentSlug,
  children
}: DocsShellProps) {
  const sections = new Map<string, DocMeta[]>();

  docs.forEach((doc) => {
    const group = sections.get(doc.section) ?? [];
    group.push(doc);
    sections.set(doc.section, group);
  });

  return (
    <main className="docs-layout">
      <aside className="docs-sidebar">
        <Link className="docs-home" href="/docs">
          Documentation
        </Link>
        <nav aria-label="Documentation navigation">
          {Array.from(sections.entries()).map(([section, items]) => (
            <div className="docs-nav-section" key={section}>
              <p>{section}</p>
              {items.map((item) => (
                <Link
                  aria-current={item.slug === currentSlug ? "page" : undefined}
                  className={item.slug === currentSlug ? "active" : ""}
                  href={item.href}
                  key={item.slug}
                >
                  {item.title}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <article className="docs-article">{children}</article>
    </main>
  );
}

