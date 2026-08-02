import './globals.css';

export const metadata = {
  title: 'HERB — Keto recipes',
  description: 'Real macros and cost per portion, rolled up from canonical data.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
