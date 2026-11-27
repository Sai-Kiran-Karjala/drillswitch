import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { clerkEnabled } from "@/lib/saas/clerk-enabled";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Runs before first paint. Clerk's __client_uat cookie is 0 when signed out and a timestamp
// when signed in, so the header can hide its signed-out buttons until the server's answer streams in.
const SIGNED_IN_HINT = `if(/(?:^|; )__client_uat(?:_[^=]*)?=[1-9]/.test(document.cookie))document.documentElement.dataset.signedIn=""`;

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DrillSwitch — incident drills for on-call teams",
  description:
    "Can you roll back a broken feature for only the customers it hurts? A live incident drill on self-hosted Flagsmith.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const app = (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">{children}</main>
      <Toaster position="bottom-right" theme="dark" />
    </>
  );
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      {clerkEnabled && (
        <head>
          <script dangerouslySetInnerHTML={{ __html: SIGNED_IN_HINT }} />
        </head>
      )}
      <body className="flex min-h-full flex-col">
        {clerkEnabled ? <ClerkProvider appearance={{ theme: shadcn }}>{app}</ClerkProvider> : app}
      </body>
    </html>
  );
}
