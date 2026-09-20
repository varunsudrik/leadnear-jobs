// Self-hosted via next/font rather than the spec's <link> to Google Fonts:
// that link is render-blocking and ships layout shift. next/font inlines the
// @font-face and preloads the files from our own origin.
import { Instrument_Sans, IBM_Plex_Mono } from "next/font/google";

export const sans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

// Carries every metric, score, count and date in this design. Not decorative.
export const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});
