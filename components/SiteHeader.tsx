import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  Boxes,
  PackageSearch,
  TerminalSquare,
  Workflow
} from "lucide-react";
import { RabbitMark } from "@/components/RabbitMark";

const navItems = [
  { href: "/docs", label: "Docs", icon: BookOpen },
  { href: "/docs/cascades", label: "Cascades", icon: Workflow },
  { href: "/capabilities", label: "Capabilities", icon: PackageSearch },
  { href: "/benchmarks", label: "Benchmarks", icon: BarChart3 },
  { href: "/docs/beaverdam", label: "Beaverdam", icon: Boxes },
  { href: "/docs/quickstart", label: "Quickstart", icon: TerminalSquare }
];

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.37.5 0 5.78 0 12.292c0 5.211 3.438 9.63 8.205 11.188.6.111.82-.254.82-.567 0-.28-.01-1.022-.015-2.005-3.338.711-4.042-1.582-4.042-1.582-.546-1.361-1.335-1.725-1.335-1.725-1.087-.731.084-.716.084-.716 1.205.082 1.838 1.215 1.838 1.215 1.07 1.803 2.809 1.282 3.495.981.108-.763.418-1.282.762-1.577-2.665-.295-5.466-1.309-5.466-5.827 0-1.287.465-2.339 1.235-3.164-.135-.297-.54-1.497.105-3.121 0 0 1.005-.316 3.3 1.209.957-.262 1.98-.392 3-.398 1.02.006 2.043.136 3 .398 2.28-1.525 3.285-1.209 3.285-1.209.645 1.624.24 2.824.12 3.121.765.825 1.23 1.877 1.23 3.164 0 4.53-2.805 5.527-5.475 5.817.42.354.81 1.077.81 2.182 0 1.578-.015 2.846-.015 3.229 0 .309.21.678.825.561C20.565 21.917 24 17.495 24 12.292 24 5.78 18.627.5 12 .5z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="RVBBIT home">
        <span className="brand-mark">
          <RabbitMark title="" variant="filled" />
        </span>
        <span>RVBBIT</span>
      </Link>
      <nav className="top-nav" aria-label="Primary navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <Icon aria-hidden="true" size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="header-actions">
        <a
          className="icon-link"
          href="https://github.com/ryrobes/rvbbit-sql"
          target="_blank"
          rel="noreferrer"
          aria-label="RVBBIT on GitHub"
        >
          <GithubIcon />
        </a>
        <a
          className="icon-link"
          href="https://x.com/ryrobes"
          target="_blank"
          rel="noreferrer"
          aria-label="@ryrobes on X"
        >
          <XIcon />
        </a>
      </div>
    </header>
  );
}
