export const metadata = {
  title: 'Sketch Dissector — ZipJeweler',
  description: 'Upload sketch pages and dissect them into individual sketches for your project.',
};

export default function SketchDissectorLayout({ children }) {
  return (
    <div style={{ overflow: 'auto', height: '100vh' }}>
      {children}
    </div>
  );
}
