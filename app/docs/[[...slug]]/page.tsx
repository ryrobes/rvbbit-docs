import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DocsShell } from "@/components/DocsShell";
import { getAllDocs, getDocBySlug, getDocSlugs } from "@/lib/docs";

type DocsPageProps = {
  params: Promise<{
    slug?: string[];
  }>;
};

export function generateStaticParams() {
  return getDocSlugs().map((slug) => ({
    slug: slug === "overview" ? [] : slug.split("/")
  }));
}

export async function generateMetadata({
  params
}: DocsPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const doc = await getDocBySlug(slug);
    return {
      title: doc.title,
      description: doc.description
    };
  } catch {
    return {
      title: "Documentation"
    };
  }
}

export default async function DocsPage({ params }: DocsPageProps) {
  const { slug } = await params;
  const docs = getAllDocs();

  try {
    const doc = await getDocBySlug(slug);
    return (
      <DocsShell
        currentSlug={doc.slug}
        docs={docs}
        sourceDocs={doc.sourceDocs}
      >
        <header className="docs-heading">
          <p>{doc.section}</p>
          <h1>{doc.title}</h1>
          <span>{doc.description}</span>
        </header>
        <div
          className="markdown-body"
          dangerouslySetInnerHTML={{ __html: doc.html }}
        />
      </DocsShell>
    );
  } catch {
    notFound();
  }
}

