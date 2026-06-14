import Link from "next/link";
import {
  Activity,
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

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="RVBBIT home">
        <span className="brand-mark">
          <RabbitMark title="" />
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
      <Link
        className="icon-link"
        href="/docs/operations"
        aria-label="Operations docs"
      >
        <Activity aria-hidden="true" size={18} />
      </Link>
    </header>
  );
}
