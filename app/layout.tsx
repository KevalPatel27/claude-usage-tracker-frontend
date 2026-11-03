import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";


const siteUrl = process.env.PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Usage ledger | Claude Code usage tracker', template: '%s | Usage ledger' },
  applicationName: 'Usage ledger',
  description: 'A clear record of Claude Code usage across your configured PCs. People, devices, tokens and estimated API costs in one ledger.',
  openGraph: { type: 'website', siteName: 'Usage ledger', title: 'Usage ledger', description: 'Claude Code usage across your configured PCs.' },
  twitter: { card: 'summary_large_image', title: 'Usage ledger', description: 'Claude Code usage across your configured PCs.' },
  appleWebApp: { capable: true, title: 'Usage ledger', statusBarStyle: 'default' },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: '#163447' };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
