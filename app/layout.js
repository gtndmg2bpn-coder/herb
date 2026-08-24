// app/layout.js
// Editorial design system foundation: Hanken Grotesk (UI) + Newsreader (serif
// accent), design tokens via globals.css, and the Editorial nav on every page.

import './globals.css';
import { Hanken_Grotesk, Newsreader } from 'next/font/google';
import AuthNav from './AuthNav';

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-hanken',
  display: 'swap',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  weight: ['400', '500'],
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
      </body>
    </html>
  );
}
