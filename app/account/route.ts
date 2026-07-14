import { NextResponse } from "next/server";

// Customer self-service (subscriptions, license keys, invoices) is Polar's
// hosted portal — rvbbit.ai/account is the branded front door.
export function GET() {
  return NextResponse.redirect("https://polar.sh/rvbbit/portal", 307);
}
