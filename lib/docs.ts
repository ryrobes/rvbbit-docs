import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeStringify from "rehype-stringify";
import { tokenizeSql } from "@/lib/sqlHighlight";

const docsRoot = path.join(process.cwd(), "content", "docs");

export type DocMeta = {
  title: string;
  description: string;
  section: string;
  navOrder: number;
  slug: string;
  href: string;
  sourceDocs: string[];
};

export type DocPage = DocMeta & {
  html: string;
};

type Frontmatter = {
  title?: string;
  description?: string;
  section?: string;
  navOrder?: number;
  sourceDocs?: string[];
};

type HastNode = {
  type?: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function classList(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return [];
}

function hasClass(node: HastNode, className: string) {
  return classList(node.properties?.className).includes(className);
}

function textContent(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return node.children?.map(textContent).join("") ?? "";
}

function addClass(node: HastNode, className: string) {
  const classes = new Set(classList(node.properties?.className));
  classes.add(className);
  node.properties = {
    ...node.properties,
    className: Array.from(classes)
  };
}

function highlightSqlCode(node: HastNode, parent?: HastNode) {
  if (node.type === "element" && node.tagName === "code" && hasClass(node, "language-sql")) {
    addClass(node, "sql-code");
    if (parent?.tagName === "pre") addClass(parent, "sql-pre");

    node.children = tokenizeSql(textContent(node)).map((token) => {
      if (!token.type) {
        return {
          type: "text",
          value: token.value
        };
      }

      return {
        type: "element",
        tagName: "span",
        properties: {
          className: ["sql-token", `sql-${token.type}`]
        },
        children: [
          {
            type: "text",
            value: token.value
          }
        ]
      };
    });
    return;
  }

  node.children?.forEach((child) => highlightSqlCode(child, node));
}

function rehypeSqlHighlight() {
  return (tree: HastNode) => {
    highlightSqlCode(tree);
  };
}

function getMarkdownFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return getMarkdownFiles(fullPath);
      if (entry.isFile() && entry.name.endsWith(".md")) return [fullPath];
      return [];
    })
    .sort();
}

function slugFromFile(filePath: string) {
  const relative = path.relative(docsRoot, filePath);
  return relative.replace(/\.md$/, "").split(path.sep).join("/");
}

function hrefFromSlug(slug: string) {
  return slug === "overview" ? "/docs" : `/docs/${slug}`;
}

function readDocFile(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = matter(raw);
  const data = parsed.data as Frontmatter;
  const slug = slugFromFile(filePath);

  return {
    content: parsed.content,
    meta: {
      title: data.title ?? slug,
      description: data.description ?? "",
      section: data.section ?? "General",
      navOrder: data.navOrder ?? 999,
      sourceDocs: data.sourceDocs ?? [],
      slug,
      href: hrefFromSlug(slug)
    } satisfies DocMeta
  };
}

export function getAllDocs(): DocMeta[] {
  return getMarkdownFiles(docsRoot)
    .map((filePath) => readDocFile(filePath).meta)
    .sort((a, b) => a.navOrder - b.navOrder || a.title.localeCompare(b.title));
}

export function getDocSlugs() {
  return getAllDocs().map((doc) => doc.slug);
}

export async function getDocBySlug(slugParts: string[] = []): Promise<DocPage> {
  const slug = slugParts.length > 0 ? slugParts.join("/") : "overview";
  const filePath = path.join(docsRoot, `${slug}.md`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Unknown doc slug: ${slug}`);
  }

  const { content, meta } = readDocFile(filePath);
  const processed = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSqlHighlight)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "append",
      properties: {
        className: ["heading-anchor"],
        ariaLabel: "Link to this section"
      },
      content: {
        type: "text",
        value: "#"
      }
    })
    .use(rehypeStringify)
    .process(content);

  return {
    ...meta,
    html: processed.toString()
  };
}
