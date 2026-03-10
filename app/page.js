export default function Home() {
  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem', color: '#e8e4dc', background: '#111', minHeight: '100vh' }}>
      <h1 style={{ color: '#CFB584', fontWeight: 300 }}>ZipJeweler Proxy</h1>
      <p style={{ color: '#888' }}>API is running. POST to <code>/api/generate-render</code></p>
    </div>
  );
}
