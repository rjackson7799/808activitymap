"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/taxonomy", label: "Taxonomy" },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/freshness", label: "Freshness" },
  { href: "/admin/change-requests", label: "Corrections" },
  { href: "/admin/audit", label: "Audit log" },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="-mx-2 flex min-w-0 gap-1 overflow-x-auto px-2 pb-1 lg:mx-0 lg:px-0 lg:pb-0">
      {items.map((item) => {
        const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center rounded-field px-3 text-sm font-semibold transition-colors",
              active ? "bg-ink text-white" : "text-secondary hover:bg-neutral hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
