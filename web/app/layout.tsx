import type { Metadata } from "next";
import { Space_Grotesk, Inter, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  weight: ["500", "700"],
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const deva = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-deva",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute base for preview images and links. Set SITE_URL to the public address in production.
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:3100"),
  title: "Sabhora — hear the doubts before you build",
  description:
    "Put your idea before an AI panel. Sharks debate it, a simulated crowd reacts, and reviewers critique your landing page. A fast way to find the objections to test with real people.",
  openGraph: {
    title: "Sabhora — hear the doubts before you build",
    description: "AI investor, crowd and reviewer personas tell you what may push back on your idea, before you test it with real people.",
    siteName: "Sabhora",
    locale: "en_IN",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

// Light is the hard default; dark is a persisted opt-in. This runs before paint
// to set data-theme synchronously and avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem('pp-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${display.variable} ${sans.variable} ${deva.variable} h-full antialiased`}
      // the theme script may set data-theme before React hydrates
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
