// app/layout.js
// Editorial design system foundation: Hanken Grotesk (UI) + Newsreader (serif
// accent), design tokens via globals.css, and the Editorial nav on every page.

import './globals.css';
import localFont from 'next/font/local';
import AuthNav from './AuthNav';
import CaptureBar from '../components/CaptureBar';

// Fonts are self-hosted (SIL Open Font License, files in app/fonts) so a build
// never depends on Google Fonts being reachable. CI failed intermittently on that
// fetch before 8 Nov 2026. Variable fonts: one file covers every weight.
const hanken = localFont({
  src: [
    { path: './fonts/hanken-grotesk-latin-wght-normal.woff2', style: 'normal' },
    { path: './fonts/hanken-grotesk-latin-wght-italic.woff2', style: 'italic' },
  ],
  variable: '--font-hanken',
  display: 'swap',
});

const newsreader = localFont({
  src: [
    { path: './fonts/newsreader-latin-wght-normal.woff2', style: 'normal' },
    { path: './fonts/newsreader-latin-wght-italic.woff2', style: 'italic' },
  ],
  variable: '--font-newsreader',
  display: 'swap',
});

export const metadata = {
  title: 'HERB — cook smarter, eat well',
  description: 'Herb plans your week, tracks the macros and the cost, and rebalances when life gets in the way. Food, health and culture — not a diet.',
};

// THE mobile fix: without this, phones render the page at ~980px desktop width
// and zoom out — tiny text, and the hero/spotlight overlays fall out of ratio
// so text sits over the exposed image. This one export is the biggest single
// mobile win and kills most of the "text bleeding into images" symptom.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${hanken.variable} ${newsreader.variable}`}>
        <AuthNav />
        {children}
        <CaptureBar />
      </body>
    </html>
  );
}
