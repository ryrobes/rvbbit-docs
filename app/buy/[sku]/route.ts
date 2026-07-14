import { NextResponse } from "next/server";
import links from "@/lib/checkout-links.json";

// Branded, stable purchase URLs: rvbbit.ai/buy/clover-pro → Polar checkout.
// Published links (catalog, docs, tweets) point HERE, so the Polar links can
// rotate without breaking anything anyone has ever shared.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sku: string }> }
) {
  const { sku } = await params;
  const url = (links as Record<string, string>)[sku];
  if (!url) {
    return NextResponse.redirect("https://rvbbit.ai/capabilities", 302);
  }
  return NextResponse.redirect(url, 307);
}
