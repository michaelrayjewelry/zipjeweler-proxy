export const metadata = {
  title: 'ZipJeweler — Platform & Investor Roadmap',
  description: 'The operating system for modern jewelry production. AI-powered workspace for design, pricing, and manufacturing.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, overflow: 'hidden' }}>{children}</body>
    </html>
  );
}
