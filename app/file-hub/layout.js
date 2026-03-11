export const metadata = {
  title: 'File Hub — ZipJeweler',
  description: 'Upload, organize, and manage design files before sending them to ZipJeweler tools.',
};

export default function FileHubLayout({ children }) {
  return (
    <div style={{ overflow: 'auto', height: '100vh' }}>
      {children}
    </div>
  );
}
