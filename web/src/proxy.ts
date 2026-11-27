import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { clerkEnabled } from "@/lib/saas/clerk-enabled";

// Signed-out visitors to the dashboard get a real redirect to sign-in. Pages still check
// auth themselves; this is only the early, cheap gate.
export default clerkEnabled
  ? clerkMiddleware(async (auth, req) => {
      if (req.nextUrl.pathname.startsWith("/dashboard")) await auth.protect();
    })
  : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Always run for Clerk-specific frontend API routes
    "/__clerk/(.*)",
  ],
};
