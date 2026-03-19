'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// ─── Constants ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'zipjeweler-file-hub';
const DEFAULT_BOX_W = 20;
const DEFAULT_BOX_H = 25;

const colors = {
  bg: '#0a0a0f',
  surface: '#12121a',
  surfaceHover: '#1a1a26',
  border: '#1e1e2e',
  borderHover: '#2a2a3e',
  text: '#e4e4ef',
  textMuted: '#7a7a8e',
  textDim: '#4a4a5e',
  accent: '#6366f1',
  accentHover: '#818cf8',
  accentDim: 'rgba(99, 102, 241, 0.15)',
  gold: '#d4a843',
  goldDim: 'rgba(212, 168, 67, 0.15)',
  danger: '#ef4444',
  dangerDim: 'rgba(239, 68, 68, 0.1)',
  success: '#22c55e',
  successDim: 'rgba(34, 197, 94, 0.1)',
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function saveToFileHub(label, dataUrl, width, height) {
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const filename = `sketch_${label.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.png`;
    // Create a smaller thumbnail
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const maxThumb = 400;
    const scale = Math.min(maxThumb / width, maxThumb / height, 1);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
      const fileObj = {
        id: generateId(),
        name: filename,
        size: Math.round(dataUrl.length * 0.75),
        mimeType: 'image/png',
        uploadedAt: Date.now(),
        tags: ['Sketch'],
        jewelryType: null,
        notes: `Dissected from sketch page: ${label}`,
        destination: null,
        thumbnail,
        dataUrl,
      };
      existing.push(fileObj);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    };
    img.src = dataUrl;
    return filename;
  } catch {
    return null;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function SketchDissector() {
  const [uploadedImage, setUploadedImage] = useState(null);
  const [mode, setMode] = useState('idle'); // idle | placing | drawing | draw-active
  const [activeBox, setActiveBox] = useState(null);
  const [savedObjects, setSavedObjects] = useState([]);
  const [lastBoxSize, setLastBoxSize] = useState({ w: DEFAULT_BOX_W, h: DEFAULT_BOX_H });
  const [dragState, setDragState] = useState(null);
  const [drawOrigin, setDrawOrigin] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  const imgContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  // ── File Upload ─────────────────────────────────────────────────────────────
  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadedImage(e.target.result);
      setActiveBox(null);
      setSavedObjects([]);
      setMode('idle');
      setLastBoxSize({ w: DEFAULT_BOX_W, h: DEFAULT_BOX_H });
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    handleFile(e.dataTransfer?.files?.[0]);
  }, [handleFile]);

  // ── Position Helper ─────────────────────────────────────────────────────────
  const getRelativePos = useCallback((e) => {
    const rect = imgContainerRef.current?.getBoundingClientRect();
    if (!rect) return { px: 0, py: 0 };
    return {
      px: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      py: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  }, []);

  // ── Box Actions ─────────────────────────────────────────────────────────────
  const addBox = () => {
    setActiveBox({
      label: `Object ${savedObjects.length + 1}`,
      x: 50 - lastBoxSize.w / 2,
      y: 50 - lastBoxSize.h / 2,
      w: lastBoxSize.w,
      h: lastBoxSize.h,
    });
    setMode('placing');
  };

  const enterDrawMode = () => {
    setActiveBox(null);
    setMode('drawing');
  };

  const handleImageMouseDown = useCallback((e) => {
    if (mode !== 'drawing') return;
    e.preventDefault();
    const pos = getRelativePos(e);
    setDrawOrigin({ x: pos.px, y: pos.py });
    setActiveBox({
      label: `Object ${savedObjects.length + 1}`,
      x: pos.px,
      y: pos.py,
      w: 0.1,
      h: 0.1,
    });
    setMode('draw-active');
  }, [mode, getRelativePos, savedObjects.length]);

  // ── Save / Cancel ───────────────────────────────────────────────────────────
  const cropAndSave = useCallback((box, callback) => {
    if (!box || !uploadedImage) return;
    if (box.w < 1 || box.h < 1) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const sx = Math.max(0, Math.round((box.x / 100) * img.width));
      const sy = Math.max(0, Math.round((box.y / 100) * img.height));
      const sw = Math.min(Math.round((box.w / 100) * img.width), img.width - sx);
      const sh = Math.min(Math.round((box.h / 100) * img.height), img.height - sy);
      if (sw > 0 && sh > 0) {
        canvas.width = sw;
        canvas.height = sh;
        ctx.clearRect(0, 0, sw, sh);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        const dataUrl = canvas.toDataURL('image/png');
        const savedObj = { ...box, dataUrl, width: sw, height: sh };
        // Save to file hub
        saveToFileHub(box.label, dataUrl, sw, sh);
        callback(savedObj);
      }
    };
    img.src = uploadedImage;
  }, [uploadedImage]);

  const saveActiveBox = useCallback(() => {
    cropAndSave(activeBox, (savedObj) => {
      setSavedObjects(prev => [...prev, savedObj]);
      setLastBoxSize({ w: activeBox.w, h: activeBox.h });
      setActiveBox(null);
      setMode('idle');
    });
  }, [activeBox, cropAndSave]);

  const saveAndNext = useCallback(() => {
    if (!activeBox || activeBox.w < 1 || activeBox.h < 1) return;
    cropAndSave(activeBox, (savedObj) => {
      const newSize = { w: activeBox.w, h: activeBox.h };
      setSavedObjects(prev => [...prev, savedObj]);
      setLastBoxSize(newSize);
      setActiveBox({
        label: `Object ${savedObjects.length + 2}`,
        x: 50 - newSize.w / 2,
        y: 50 - newSize.h / 2,
        w: newSize.w,
        h: newSize.h,
      });
      setMode('placing');
    });
  }, [activeBox, savedObjects.length, cropAndSave]);

  const cancelBox = () => {
    setActiveBox(null);
    setMode('idle');
  };

  const deleteObject = (idx) => {
    setSavedObjects(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Drag / Resize ──────────────────────────────────────────────────────────
  const handleHandleDown = useCallback((e, handle) => {
    if (!activeBox) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = getRelativePos(e);
    setDragState({ handle, startX: pos.px, startY: pos.py, origBox: { ...activeBox } });
  }, [activeBox, getRelativePos]);

  const handleMouseMove = useCallback((e) => {
    if (mode === 'draw-active' && drawOrigin) {
      const pos = getRelativePos(e);
      const x = Math.min(drawOrigin.x, pos.px);
      const y = Math.min(drawOrigin.y, pos.py);
      const w = Math.abs(pos.px - drawOrigin.x);
      const h = Math.abs(pos.py - drawOrigin.y);
      setActiveBox(prev => prev ? { ...prev, x, y, w, h } : prev);
      return;
    }
    if (!dragState || !activeBox) return;
    const pos = getRelativePos(e);
    const dx = pos.px - dragState.startX;
    const dy = pos.py - dragState.startY;
    const ob = dragState.origBox;
    const minSize = 3;
    let nx = ob.x, ny = ob.y, nw = ob.w, nh = ob.h;
    if (dragState.handle === 'move') {
      nx = Math.max(0, Math.min(100 - ob.w, ob.x + dx));
      ny = Math.max(0, Math.min(100 - ob.h, ob.y + dy));
    } else {
      const h = dragState.handle;
      if (h.includes('l')) { nx = Math.min(ob.x + ob.w - minSize, ob.x + dx); nw = ob.w - (nx - ob.x); }
      if (h.includes('r')) { nw = Math.max(minSize, ob.w + dx); }
      if (h.includes('t')) { ny = Math.min(ob.y + ob.h - minSize, ob.y + dy); nh = ob.h - (ny - ob.y); }
      if (h.includes('b')) { nh = Math.max(minSize, ob.h + dy); }
      nx = Math.max(0, nx); ny = Math.max(0, ny);
      if (nx + nw > 100) nw = 100 - nx;
      if (ny + nh > 100) nh = 100 - ny;
    }
    setActiveBox(prev => ({ ...prev, x: nx, y: ny, w: nw, h: nh }));
  }, [mode, drawOrigin, dragState, activeBox, getRelativePos]);

  const handleMouseUp = useCallback(() => {
    if (mode === 'draw-active') {
      setDrawOrigin(null);
      setMode('placing');
      return;
    }
    setDragState(null);
  }, [mode]);

  useEffect(() => {
    if (dragState || mode === 'draw-active') {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState, mode, handleMouseMove, handleMouseUp]);

  // ── Reset ───────────────────────────────────────────────────────────────────
  const reset = () => {
    setUploadedImage(null);
    setActiveBox(null);
    setSavedObjects([]);
    setMode('idle');
    setLastBoxSize({ w: DEFAULT_BOX_W, h: DEFAULT_BOX_H });
  };

  // ── Derived ─────────────────────────────────────────────────────────────────
  const getFilename = (obj, i) =>
    `sketch_${i + 1}_${obj.label.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.png`;

  const hasActiveBox = mode === 'placing' || mode === 'draw-active';

  // ── Handle Positions ────────────────────────────────────────────────────────
  const handleSize = 11;
  const allHandles = ['tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r'];
  const handlePos = (h) => {
    const s = {
      position: 'absolute', width: handleSize, height: handleSize,
      background: colors.surface, borderRadius: 2, border: `2px solid ${colors.accent}`, zIndex: 10,
    };
    const half = handleSize / 2;
    if (h === 'tl') return { ...s, top: -half, left: -half, cursor: 'nwse-resize' };
    if (h === 'tr') return { ...s, top: -half, right: -half, cursor: 'nesw-resize' };
    if (h === 'bl') return { ...s, bottom: -half, left: -half, cursor: 'nesw-resize' };
    if (h === 'br') return { ...s, bottom: -half, right: -half, cursor: 'nwse-resize' };
    if (h === 't') return { ...s, top: -half, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' };
    if (h === 'b') return { ...s, bottom: -half, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' };
    if (h === 'l') return { ...s, top: '50%', left: -half, transform: 'translateY(-50%)', cursor: 'ew-resize' };
    if (h === 'r') return { ...s, top: '50%', right: -half, transform: 'translateY(-50%)', cursor: 'ew-resize' };
  };

  // ── Button Component ────────────────────────────────────────────────────────
  const Btn = ({ children, onClick, primary, active, small, disabled, style: extra, ...rest }) => (
    <button onClick={onClick} disabled={disabled} {...rest} style={{
      background: primary
        ? `linear-gradient(135deg, ${colors.accent}, ${colors.accentHover})`
        : active ? colors.accent : colors.surface,
      border: `1px solid ${primary ? colors.accent : active ? colors.accent : colors.border}`,
      borderRadius: 8, padding: small ? '6px 12px' : '8px 18px',
      fontSize: small ? 11 : 12, fontWeight: 600,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: primary || active ? '#fff' : colors.text,
      cursor: disabled ? 'not-allowed' : 'pointer',
      letterSpacing: '0.04em', textTransform: 'uppercase',
      boxShadow: primary ? `0 4px 16px ${colors.accent}44` : 'none',
      transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
      opacity: disabled ? 0.4 : 1,
      ...extra,
    }} />
  );

  // ── Icons ───────────────────────────────────────────────────────────────────
  const PlusIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
  const DrawIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>;
  const CheckIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
  const DownloadIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
  const TrashIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', background: colors.bg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: colors.text,
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${colors.border}`, background: colors.surface,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a href="/file-hub" style={{
            color: colors.textMuted, textDecoration: 'none', fontSize: 13, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.15s',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            File Hub
          </a>
          <div style={{ width: 1, height: 20, background: colors.border }} />
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentHover})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 2px 8px ${colors.accent}44`,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0, letterSpacing: '0.02em', lineHeight: 1.1, color: colors.text }}>
              Sketch Dissector
            </h1>
            <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: colors.textMuted }}>
              AI TOOLS
            </span>
          </div>
        </div>
        {uploadedImage && <Btn onClick={reset}>Start Over</Btn>}
      </div>

      <div style={{ padding: '20px 24px', maxWidth: 1280, margin: '0 auto' }}>
        {/* Upload Zone */}
        {!uploadedImage && (
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            style={{
              borderRadius: 16, padding: '60px 40px', textAlign: 'center', cursor: 'pointer',
              background: colors.surface, border: `2px dashed ${colors.border}`,
              transition: 'all 0.15s', marginTop: 12,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = colors.accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = colors.border; }}
          >
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files?.[0])} />
            <div style={{
              width: 64, height: 64, borderRadius: 14, background: colors.bg,
              border: `1px solid ${colors.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px', color: colors.text }}>
              Upload Your Sketch Page
            </h2>
            <p style={{ fontSize: 13, color: colors.textMuted, margin: 0, lineHeight: 1.6 }}>
              Drop a scanned page or photo with multiple jewelry sketches.<br />
              Draw or place boxes around each piece to separate them into individual files.
            </p>
            <div style={{
              marginTop: 24, display: 'inline-block', padding: '10px 28px', borderRadius: 8,
              background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentHover})`,
              color: '#fff', fontSize: 12, fontWeight: 600,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              boxShadow: `0 4px 16px ${colors.accent}44`,
            }}>
              Choose File
            </div>
          </div>
        )}

        {/* Main Workspace */}
        {uploadedImage && (
          <div style={{ display: 'flex', gap: 20, marginTop: 4, flexWrap: 'wrap' }}>
            {/* Left: Source Image + Toolbar */}
            <div style={{ flex: '1 1 520px', minWidth: 340 }}>
              {/* Toolbar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                padding: '8px 12px', borderRadius: 10,
                background: colors.surface, border: `1px solid ${colors.border}`,
                flexWrap: 'wrap',
              }}>
                {!hasActiveBox && mode !== 'drawing' && (
                  <>
                    <Btn small onClick={addBox}><PlusIcon /> Add Box</Btn>
                    <Btn small onClick={enterDrawMode}><DrawIcon /> Draw Box</Btn>
                  </>
                )}
                {mode === 'drawing' && !activeBox && (
                  <>
                    <Btn small active><DrawIcon /> Drawing Mode</Btn>
                    <span style={{ fontSize: 12, color: colors.textMuted, fontStyle: 'italic' }}>Click and drag on the image</span>
                    <div style={{ marginLeft: 'auto' }}>
                      <Btn small onClick={cancelBox}>Cancel</Btn>
                    </div>
                  </>
                )}
                {hasActiveBox && (
                  <>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 140px', minWidth: 120,
                    }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                        background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentHover})`,
                        color: '#fff', fontSize: 10, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{savedObjects.length + 1}</span>
                      <input
                        value={activeBox?.label || ''}
                        onChange={e => setActiveBox(prev => ({ ...prev, label: e.target.value }))}
                        placeholder="Name this object..."
                        style={{
                          flex: 1, fontSize: 13, fontWeight: 500, border: `1px solid ${colors.border}`,
                          background: colors.bg, color: colors.text,
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          outline: 'none', padding: '6px 10px', borderRadius: 6, minWidth: 80,
                        }}
                        onFocus={e => { e.target.style.borderColor = colors.accent; }}
                        onBlur={e => { e.target.style.borderColor = colors.border; }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>
                      <Btn small onClick={cancelBox}>Cancel</Btn>
                      <Btn small primary onClick={saveActiveBox}
                        disabled={!activeBox || activeBox.w < 1 || activeBox.h < 1}>
                        <CheckIcon /> Save
                      </Btn>
                      <Btn small primary onClick={saveAndNext}
                        disabled={!activeBox || activeBox.w < 1 || activeBox.h < 1}>
                        <CheckIcon /> Save & Next
                      </Btn>
                    </div>
                  </>
                )}
              </div>

              {/* Image Container */}
              <div
                ref={imgContainerRef}
                onMouseDown={handleImageMouseDown}
                style={{
                  borderRadius: 12, overflow: 'visible', background: colors.surface,
                  border: `1px solid ${colors.border}`,
                  position: 'relative', userSelect: 'none',
                  cursor: mode === 'drawing' ? 'crosshair' : 'default',
                }}
              >
                <img src={uploadedImage} alt="Sketch" style={{ width: '100%', display: 'block', borderRadius: 12 }} draggable={false} />

                {/* Saved object outlines */}
                {savedObjects.map((obj, i) => (
                  <div key={`saved-${i}`} style={{
                    position: 'absolute',
                    left: `${obj.x}%`, top: `${obj.y}%`,
                    width: `${obj.w}%`, height: `${obj.h}%`,
                    border: `1.5px dashed ${hoverIdx === i ? colors.accentHover : colors.accent}66`,
                    background: hoverIdx === i ? `${colors.accent}0a` : 'transparent',
                    boxSizing: 'border-box', borderRadius: 2,
                    transition: 'all 0.15s', pointerEvents: 'none',
                  }}>
                    <div style={{
                      position: 'absolute', top: -13, left: -1.5,
                      background: `${colors.accent}cc`, color: '#fff',
                      fontSize: 9, fontWeight: 700, padding: '0px 6px',
                      borderRadius: '3px 3px 3px 0', lineHeight: '14px',
                      whiteSpace: 'nowrap', pointerEvents: 'none',
                    }}>{i + 1}</div>
                  </div>
                ))}

                {/* Active Box */}
                {activeBox && (activeBox.w > 0.5 || activeBox.h > 0.5) && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${activeBox.x}%`, top: `${activeBox.y}%`,
                      width: `${activeBox.w}%`, height: `${activeBox.h}%`,
                      border: `2px solid ${colors.accent}`,
                      background: `${colors.accent}10`,
                      cursor: mode === 'placing' ? 'move' : 'crosshair',
                      transition: (dragState || mode === 'draw-active') ? 'none' : 'border-color 0.15s',
                      boxSizing: 'border-box', zIndex: 5,
                    }}
                    onMouseDown={e => { if (mode === 'placing') handleHandleDown(e, 'move'); }}
                  >
                    <div style={{
                      position: 'absolute', top: -16, left: -2,
                      background: colors.accent, color: '#fff',
                      fontSize: 10, fontWeight: 700, padding: '1px 8px',
                      borderRadius: '4px 4px 4px 0', lineHeight: '16px',
                      whiteSpace: 'nowrap', zIndex: 6, pointerEvents: 'none',
                    }}>{savedObjects.length + 1}. {activeBox.label}</div>

                    {/* Resize handles */}
                    {mode === 'placing' && allHandles.map(h => (
                      <div key={h} style={handlePos(h)} onMouseDown={e => handleHandleDown(e, h)} />
                    ))}
                  </div>
                )}
              </div>

              {/* Coordinate readout */}
              {activeBox && mode === 'placing' && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 11, color: colors.textDim, fontFamily: 'monospace' }}>
                    x:{activeBox.x.toFixed(1)}  y:{activeBox.y.toFixed(1)}  w:{activeBox.w.toFixed(1)}  h:{activeBox.h.toFixed(1)}
                  </span>
                </div>
              )}
            </div>

            {/* Right: Saved Objects */}
            <div style={{ flex: '1 1 300px', minWidth: 260 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: colors.text }}>
                  Saved Objects
                  {savedObjects.length > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 500, color: colors.accent, marginLeft: 8 }}>{savedObjects.length}</span>
                  )}
                </h3>
              </div>

              {savedObjects.length === 0 && (
                <div style={{
                  padding: '36px 20px', textAlign: 'center', borderRadius: 12,
                  background: colors.surface, border: `1px solid ${colors.border}`,
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={colors.textDim} strokeWidth="1.5" style={{ marginBottom: 10 }}>
                    <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="3" x2="9" y2="21" />
                  </svg>
                  <p style={{ fontSize: 13, color: colors.textMuted, margin: 0, lineHeight: 1.5 }}>
                    No objects yet.<br />Use <strong style={{ color: colors.text }}>Add Box</strong> or <strong style={{ color: colors.text }}>Draw Box</strong> to start.
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {savedObjects.map((obj, i) => (
                  <div key={i}
                    style={{
                      borderRadius: 10, background: colors.surface,
                      border: `1px solid ${hoverIdx === i ? colors.borderHover : colors.border}`,
                      overflow: 'hidden', transition: 'all 0.15s',
                    }}
                    onMouseEnter={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx(null)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px' }}>
                      <div style={{
                        width: 60, height: 60, borderRadius: 6, overflow: 'hidden', background: colors.bg,
                        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: hoverIdx === i ? `1px solid ${colors.accent}33` : `1px solid ${colors.border}`,
                        transition: 'border 0.15s',
                      }}>
                        <img src={obj.dataUrl} alt={obj.label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{
                            width: 20, height: 20, borderRadius: 5,
                            background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentHover})`,
                            color: '#fff', fontSize: 10, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>{i + 1}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: colors.text }}>
                            {obj.label}
                          </span>
                        </div>
                        <span style={{ fontSize: 10, color: colors.textDim, fontWeight: 500, fontFamily: 'monospace' }}>
                          {obj.width} x {obj.height}px
                        </span>
                        <span style={{
                          fontSize: 9, color: colors.success, marginLeft: 8,
                          fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase',
                        }}>
                          Saved to File Hub
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <a href={obj.dataUrl} download={getFilename(obj, i)}
                          style={{
                            width: 28, height: 28, borderRadius: 6, border: `1px solid ${colors.border}`,
                            background: colors.surface, cursor: 'pointer', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', color: colors.accent, textDecoration: 'none',
                            transition: 'all 0.15s',
                          }}
                          title="Download"
                        ><DownloadIcon /></a>
                        <button onClick={() => deleteObject(i)}
                          style={{
                            width: 28, height: 28, borderRadius: 6, border: `1px solid ${colors.border}`,
                            background: colors.surface, cursor: 'pointer', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', color: colors.danger,
                            transition: 'all 0.15s',
                          }}
                          title="Delete"
                        ><TrashIcon /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        * { box-sizing: border-box; }
        input::selection { background: ${colors.accent}33; }
      `}</style>
    </div>
  );
}
