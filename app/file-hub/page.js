'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// ─── Constants ──────────────────────────────────────────────────────────────────

const TAGS = ['Sketch', 'CAD', 'Render', 'Photo', 'Reference', '3D Model', 'Technical Drawing', 'Marketing'];
const JEWELRY_TYPES = ['Ring', 'Pendant', 'Earring', 'Bracelet', 'Necklace', 'Brooch', 'Other'];
const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Newest First' },
  { value: 'date-asc', label: 'Oldest First' },
  { value: 'name-asc', label: 'Name A–Z' },
  { value: 'name-desc', label: 'Name Z–A' },
  { value: 'size-desc', label: 'Largest First' },
  { value: 'size-asc', label: 'Smallest First' },
  { value: 'type', label: 'File Type' },
];
const TOOL_DESTINATIONS = [
  { id: 'sketch-to-image', label: 'Sketch to Image', icon: '✏️' },
  { id: 'cad-to-render', label: 'CAD to Render', icon: '🖥️' },
  { id: 'image-to-3d', label: 'Image to 3D', icon: '📐' },
  { id: 'photoshoot', label: 'Photoshoot', icon: '📸' },
  { id: 'modify', label: 'Modify / Inpaint', icon: '🎨' },
  { id: 'technical-drawing', label: 'Technical Drawing', icon: '📏' },
];
const STORAGE_KEY = 'zipjeweler-file-hub';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function getFileIcon(type) {
  if (type.startsWith('image/')) return '🖼️';
  if (type === 'model/gltf-binary' || type.endsWith('.glb') || type.endsWith('.fbx')) return '📦';
  if (type === 'application/pdf') return '📄';
  if (type.startsWith('video/')) return '🎬';
  return '📎';
}

function isImageType(type) {
  return type.startsWith('image/');
}

function sortFiles(files, sortBy) {
  const sorted = [...files];
  switch (sortBy) {
    case 'date-desc': return sorted.sort((a, b) => b.uploadedAt - a.uploadedAt);
    case 'date-asc': return sorted.sort((a, b) => a.uploadedAt - b.uploadedAt);
    case 'name-asc': return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc': return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case 'size-desc': return sorted.sort((a, b) => b.size - a.size);
    case 'size-asc': return sorted.sort((a, b) => a.size - b.size);
    case 'type': return sorted.sort((a, b) => a.mimeType.localeCompare(b.mimeType));
    default: return sorted;
  }
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

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

// ─── Sub-components ─────────────────────────────────────────────────────────────

function TagBadge({ label, active, onClick, removable, onRemove }) {
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 10px', borderRadius: 12,
        fontSize: 12, fontWeight: 500, cursor: onClick ? 'pointer' : 'default',
        background: active ? colors.accentDim : colors.surface,
        color: active ? colors.accentHover : colors.textMuted,
        border: `1px solid ${active ? colors.accent : colors.border}`,
        transition: 'all 0.15s',
        userSelect: 'none',
      }}
    >
      {label}
      {removable && (
        <span
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{ marginLeft: 2, cursor: 'pointer', opacity: 0.6 }}
        >
          ×
        </span>
      )}
    </span>
  );
}

function FileCard({ file, selected, onSelect, onOpen, viewMode }) {
  const isImage = isImageType(file.mimeType);
  const isGrid = viewMode === 'grid';

  return (
    <div
      onClick={() => onSelect(file.id)}
      onDoubleClick={() => onOpen(file.id)}
      style={{
        position: 'relative',
        background: selected ? colors.accentDim : colors.surface,
        border: `1px solid ${selected ? colors.accent : colors.border}`,
        borderRadius: 10,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.15s',
        display: isGrid ? 'flex' : 'flex',
        flexDirection: isGrid ? 'column' : 'row',
        alignItems: isGrid ? 'stretch' : 'center',
        gap: isGrid ? 0 : 16,
        padding: isGrid ? 0 : '12px 16px',
      }}
    >
      {/* Checkbox */}
      <div style={{
        position: isGrid ? 'absolute' : 'relative',
        top: isGrid ? 8 : 'auto',
        left: isGrid ? 8 : 'auto',
        zIndex: 2,
        width: 18, height: 18, borderRadius: 4,
        border: `2px solid ${selected ? colors.accent : colors.textDim}`,
        background: selected ? colors.accent : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {selected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
      </div>

      {/* Thumbnail / Icon */}
      {isGrid ? (
        <div style={{
          width: '100%', height: 160,
          background: colors.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {isImage && file.thumbnail ? (
            <img src={file.thumbnail} alt={file.name} style={{
              width: '100%', height: '100%', objectFit: 'cover',
            }} />
          ) : (
            <span style={{ fontSize: 40 }}>{getFileIcon(file.mimeType)}</span>
          )}
        </div>
      ) : (
        <div style={{
          width: 44, height: 44, borderRadius: 8,
          background: colors.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', flexShrink: 0,
        }}>
          {isImage && file.thumbnail ? (
            <img src={file.thumbnail} alt={file.name} style={{
              width: '100%', height: '100%', objectFit: 'cover',
            }} />
          ) : (
            <span style={{ fontSize: 20 }}>{getFileIcon(file.mimeType)}</span>
          )}
        </div>
      )}

      {/* File info */}
      <div style={{
        padding: isGrid ? '10px 12px' : 0,
        flex: 1, minWidth: 0,
      }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: colors.text,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {file.name}
        </div>
        <div style={{
          fontSize: 11, color: colors.textMuted, marginTop: 3,
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span>{formatBytes(file.size)}</span>
          <span style={{ color: colors.textDim }}>·</span>
          <span>{formatDate(file.uploadedAt)}</span>
        </div>
        {file.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            {file.tags.map(t => (
              <span key={t} style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 8,
                background: colors.accentDim, color: colors.accentHover,
              }}>{t}</span>
            ))}
            {file.jewelryType && (
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 8,
                background: colors.goldDim, color: colors.gold,
              }}>{file.jewelryType}</span>
            )}
          </div>
        )}
      </div>

      {/* List-mode extras */}
      {!isGrid && (
        <div style={{
          display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0,
          fontSize: 11, color: colors.textDim,
        }}>
          {file.destination && (
            <span style={{
              padding: '3px 8px', borderRadius: 6,
              background: colors.successDim, color: colors.success,
              fontSize: 10, fontWeight: 500,
            }}>
              → {TOOL_DESTINATIONS.find(d => d.id === file.destination)?.label || file.destination}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function FileDetailPanel({ file, onClose, onUpdate, onDelete, onSendToTool }) {
  const isImage = isImageType(file.mimeType);

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: 400, maxWidth: '90vw',
      background: colors.surface, borderLeft: `1px solid ${colors.border}`,
      zIndex: 100, display: 'flex', flexDirection: 'column',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', borderBottom: `1px solid ${colors.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>File Details</span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: colors.textMuted,
          fontSize: 20, cursor: 'pointer', padding: 4,
        }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {/* Preview */}
        {isImage && file.thumbnail && (
          <div style={{
            width: '100%', borderRadius: 10, overflow: 'hidden',
            marginBottom: 20, background: colors.bg,
            border: `1px solid ${colors.border}`,
          }}>
            <img src={file.thumbnail} alt={file.name} style={{
              width: '100%', display: 'block',
            }} />
          </div>
        )}

        {/* Name */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: colors.textMuted, display: 'block', marginBottom: 6 }}>
            File Name
          </label>
          <input
            value={file.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8,
              background: colors.bg, border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 13, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: colors.textMuted, display: 'block', marginBottom: 6 }}>
            Notes
          </label>
          <textarea
            value={file.notes || ''}
            onChange={(e) => onUpdate({ notes: e.target.value })}
            placeholder="Add notes about this file..."
            rows={3}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8,
              background: colors.bg, border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 13, outline: 'none',
              resize: 'vertical', fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Tags */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: colors.textMuted, display: 'block', marginBottom: 8 }}>
            Tags
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TAGS.map(tag => (
              <TagBadge
                key={tag}
                label={tag}
                active={file.tags.includes(tag)}
                onClick={() => {
                  const tags = file.tags.includes(tag)
                    ? file.tags.filter(t => t !== tag)
                    : [...file.tags, tag];
                  onUpdate({ tags });
                }}
              />
            ))}
          </div>
        </div>

        {/* Jewelry Type */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: colors.textMuted, display: 'block', marginBottom: 6 }}>
            Jewelry Type
          </label>
          <select
            value={file.jewelryType || ''}
            onChange={(e) => onUpdate({ jewelryType: e.target.value || null })}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8,
              background: colors.bg, border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 13, outline: 'none',
              boxSizing: 'border-box',
            }}
          >
            <option value="">— None —</option>
            {JEWELRY_TYPES.map(jt => <option key={jt} value={jt}>{jt}</option>)}
          </select>
        </div>

        {/* Meta */}
        <div style={{
          padding: '12px 14px', borderRadius: 8,
          background: colors.bg, border: `1px solid ${colors.border}`,
          marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>
            Type: <span style={{ color: colors.text }}>{file.mimeType}</span>
          </div>
          <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>
            Size: <span style={{ color: colors.text }}>{formatBytes(file.size)}</span>
          </div>
          <div style={{ fontSize: 11, color: colors.textMuted }}>
            Uploaded: <span style={{ color: colors.text }}>{formatDate(file.uploadedAt)}</span>
          </div>
        </div>

        {/* Send to Tool */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: colors.textMuted, display: 'block', marginBottom: 8 }}>
            Send to Tool
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {TOOL_DESTINATIONS.map(tool => (
              <button
                key={tool.id}
                onClick={() => onSendToTool(file.id, tool.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: 8,
                  background: file.destination === tool.id ? colors.accentDim : colors.bg,
                  border: `1px solid ${file.destination === tool.id ? colors.accent : colors.border}`,
                  color: file.destination === tool.id ? colors.accentHover : colors.text,
                  fontSize: 13, cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                <span>{tool.icon}</span>
                <span>{tool.label}</span>
                {file.destination === tool.id && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: colors.accent }}>Selected</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Delete */}
        <button
          onClick={() => { if (confirm('Delete this file?')) onDelete(file.id); }}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8,
            background: colors.dangerDim, border: `1px solid ${colors.danger}33`,
            color: colors.danger, fontSize: 13, fontWeight: 500,
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          Delete File
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function FileHub() {
  const [files, setFiles] = useState([]);
  const [viewMode, setViewMode] = useState('grid');
  const [sortBy, setSortBy] = useState('date-desc');
  const [filterTag, setFilterTag] = useState(null);
  const [filterType, setFilterType] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [detailFileId, setDetailFileId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const dragCounter = useRef(0);

  // Load from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setFiles(JSON.parse(stored));
    } catch {}
  }, []);

  // Save to localStorage
  useEffect(() => {
    try {
      // Only store metadata, not full thumbnails for large collections
      localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
    } catch {
      // localStorage might be full
    }
  }, [files]);

  // ─── File Processing ────────────────────────────────────────────────────────

  const processFiles = useCallback((fileList) => {
    Array.from(fileList).forEach((file) => {
      const entry = {
        id: generateId(),
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        uploadedAt: Date.now(),
        tags: [],
        jewelryType: null,
        notes: '',
        destination: null,
        thumbnail: null,
      };

      // Generate thumbnail for images
      if (isImageType(file.type)) {
        const reader = new FileReader();
        reader.onload = (e) => {
          // Create a smaller thumbnail
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxDim = 400;
            let w = img.width, h = img.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) { h = (h / w) * maxDim; w = maxDim; }
              else { w = (w / h) * maxDim; h = maxDim; }
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            entry.thumbnail = canvas.toDataURL('image/jpeg', 0.7);
            setFiles(prev => prev.map(f => f.id === entry.id ? { ...entry } : f));
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      }

      setFiles(prev => [entry, ...prev]);
    });
  }, []);

  // ─── Drag & Drop ─────────────────────────────────────────────────────────────

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    dragCounter.current++;
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
  }, [processFiles]);

  // ─── Selection ────────────────────────────────────────────────────────────────

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const visible = getFilteredFiles().map(f => f.id);
    setSelectedIds(new Set(visible));
  }, [files, filterTag, filterType, searchQuery, sortBy]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // ─── File Ops ─────────────────────────────────────────────────────────────────

  const updateFile = useCallback((id, updates) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }, []);

  const deleteFiles = useCallback((ids) => {
    setFiles(prev => prev.filter(f => !ids.has(f.id)));
    setSelectedIds(new Set());
    setDetailFileId(null);
  }, []);

  const sendToTool = useCallback((fileId, toolId) => {
    updateFile(fileId, { destination: toolId });
  }, [updateFile]);

  const bulkTag = useCallback((tag) => {
    setFiles(prev => prev.map(f =>
      selectedIds.has(f.id) && !f.tags.includes(tag)
        ? { ...f, tags: [...f.tags, tag] }
        : f
    ));
  }, [selectedIds]);

  // ─── Filtering ────────────────────────────────────────────────────────────────

  const getFilteredFiles = useCallback(() => {
    let result = files;
    if (filterTag) result = result.filter(f => f.tags.includes(filterTag));
    if (filterType) result = result.filter(f => f.jewelryType === filterType);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.notes?.toLowerCase().includes(q) ||
        f.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return sortFiles(result, sortBy);
  }, [files, filterTag, filterType, searchQuery, sortBy]);

  const filteredFiles = getFilteredFiles();
  const detailFile = files.find(f => f.id === detailFileId);

  // ─── Stats ────────────────────────────────────────────────────────────────────

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const tagCounts = {};
  files.forEach(f => f.tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        minHeight: '100vh',
        background: colors.bg,
        color: colors.text,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        position: 'relative',
      }}
    >
      {/* Drag Overlay */}
      {dragging && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(99, 102, 241, 0.08)',
          border: '3px dashed ' + colors.accent,
          borderRadius: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            padding: '32px 48px', borderRadius: 16,
            background: colors.surface, border: `1px solid ${colors.accent}`,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: colors.accent }}>Drop files here</div>
            <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>
              Images, CAD files, sketches, references...
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header style={{
        padding: '20px 32px',
        borderBottom: `1px solid ${colors.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16,
        background: colors.surface,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="/" style={{ color: colors.textMuted, textDecoration: 'none', fontSize: 13 }}>
            ← Back
          </a>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
              File Hub
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: colors.textMuted }}>
              {files.length} file{files.length !== 1 ? 's' : ''} · {formatBytes(totalSize)}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '8px 18px', borderRadius: 8,
              background: colors.accent, border: 'none',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ fontSize: 16 }}>+</span> Upload Files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.glb,.fbx,.obj,.stl,.step,.stp,.iges,.3dm"
            onChange={(e) => { processFiles(e.target.files); e.target.value = ''; }}
            style={{ display: 'none' }}
          />
        </div>
      </header>

      {/* Toolbar */}
      <div style={{
        padding: '12px 32px',
        borderBottom: `1px solid ${colors.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search */}
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '6px 12px', borderRadius: 8, width: 200,
              background: colors.surface, border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 13, outline: 'none',
            }}
          />

          {/* Tag Filter */}
          <select
            value={filterTag || ''}
            onChange={(e) => setFilterTag(e.target.value || null)}
            style={{
              padding: '6px 12px', borderRadius: 8,
              background: colors.surface, border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 13, outline: 'none',
            }}
          >
            <option value="">All Tags</option>
            {TAGS.map(t => (
              <option key={t} value={t}>{t} {tagCounts[t] ? `(${tagCounts[t]})` : ''}</option>
            ))}
          </select>

          {/* Jewelry Type Filter */}
          <select
            value={filterType || ''}
            onChange={(e) => setFilterType(e.target.value || null)}
            style={{
              padding: '6px 12px', borderRadius: 8,
              background: colors.surface, border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 13, outline: 'none',
            }}
          >
            <option value="">All Types</option>
            {JEWELRY_TYPES.map(jt => <option key={jt} value={jt}>{jt}</option>)}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: '6px 12px', borderRadius: 8,
              background: colors.surface, border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 13, outline: 'none',
            }}
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* View Toggle */}
          <button
            onClick={() => setViewMode('grid')}
            style={{
              padding: '6px 10px', borderRadius: 6,
              background: viewMode === 'grid' ? colors.accentDim : 'transparent',
              border: `1px solid ${viewMode === 'grid' ? colors.accent : colors.border}`,
              color: viewMode === 'grid' ? colors.accent : colors.textMuted,
              cursor: 'pointer', fontSize: 14,
            }}
            title="Grid view"
          >
            ▦
          </button>
          <button
            onClick={() => setViewMode('list')}
            style={{
              padding: '6px 10px', borderRadius: 6,
              background: viewMode === 'list' ? colors.accentDim : 'transparent',
              border: `1px solid ${viewMode === 'list' ? colors.accent : colors.border}`,
              color: viewMode === 'list' ? colors.accent : colors.textMuted,
              cursor: 'pointer', fontSize: 14,
            }}
            title="List view"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div style={{
          padding: '10px 32px',
          background: colors.accentDim,
          borderBottom: `1px solid ${colors.accent}33`,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: colors.accent }}>
            {selectedIds.size} selected
          </span>
          <span style={{ color: colors.textDim }}>|</span>
          <button onClick={selectAll} style={{
            background: 'none', border: 'none', color: colors.accentHover,
            fontSize: 12, cursor: 'pointer', textDecoration: 'underline',
          }}>Select All</button>
          <button onClick={clearSelection} style={{
            background: 'none', border: 'none', color: colors.textMuted,
            fontSize: 12, cursor: 'pointer', textDecoration: 'underline',
          }}>Clear</button>
          <span style={{ color: colors.textDim }}>|</span>

          {/* Bulk Tag */}
          <select
            onChange={(e) => { if (e.target.value) { bulkTag(e.target.value); e.target.value = ''; } }}
            defaultValue=""
            style={{
              padding: '4px 8px', borderRadius: 6,
              background: colors.surface, border: `1px solid ${colors.border}`,
              color: colors.text, fontSize: 12, outline: 'none',
            }}
          >
            <option value="">+ Add Tag...</option>
            {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <button
            onClick={() => { if (confirm(`Delete ${selectedIds.size} files?`)) deleteFiles(selectedIds); }}
            style={{
              padding: '4px 12px', borderRadius: 6,
              background: colors.dangerDim, border: `1px solid ${colors.danger}33`,
              color: colors.danger, fontSize: 12, fontWeight: 500,
              cursor: 'pointer', marginLeft: 'auto',
            }}
          >
            Delete Selected
          </button>
        </div>
      )}

      {/* Main Content */}
      <main style={{ padding: 32, paddingRight: detailFile ? 432 : 32 }}>
        {files.length === 0 ? (
          /* Empty State */
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: '60vh', textAlign: 'center',
          }}>
            <div style={{
              width: 120, height: 120, borderRadius: '50%',
              background: colors.surface, border: `2px dashed ${colors.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 24,
            }}>
              <span style={{ fontSize: 48, opacity: 0.6 }}>📁</span>
            </div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: colors.text }}>
              No files yet
            </h2>
            <p style={{
              margin: '8px 0 24px', fontSize: 14, color: colors.textMuted,
              maxWidth: 380, lineHeight: 1.5,
            }}>
              Upload sketches, CAD screenshots, reference photos, or any design files.
              Organize them here, then send them to ZipJeweler tools when ready.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '12px 28px', borderRadius: 10,
                background: colors.accent, border: 'none',
                color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Upload Your First Files
            </button>
            <p style={{ fontSize: 12, color: colors.textDim, marginTop: 12 }}>
              or drag and drop anywhere on this page
            </p>
          </div>
        ) : filteredFiles.length === 0 ? (
          /* No Results */
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: '40vh', textAlign: 'center',
          }}>
            <span style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>🔍</span>
            <p style={{ fontSize: 14, color: colors.textMuted }}>
              No files match your filters.
            </p>
            <button
              onClick={() => { setFilterTag(null); setFilterType(null); setSearchQuery(''); }}
              style={{
                marginTop: 12, padding: '8px 16px', borderRadius: 8,
                background: colors.surface, border: `1px solid ${colors.border}`,
                color: colors.text, fontSize: 13, cursor: 'pointer',
              }}
            >
              Clear Filters
            </button>
          </div>
        ) : (
          /* File Grid/List */
          <div style={{
            display: viewMode === 'grid' ? 'grid' : 'flex',
            gridTemplateColumns: viewMode === 'grid'
              ? 'repeat(auto-fill, minmax(220px, 1fr))'
              : undefined,
            flexDirection: viewMode === 'list' ? 'column' : undefined,
            gap: viewMode === 'grid' ? 16 : 8,
          }}>
            {filteredFiles.map(file => (
              <FileCard
                key={file.id}
                file={file}
                selected={selectedIds.has(file.id)}
                onSelect={toggleSelect}
                onOpen={setDetailFileId}
                viewMode={viewMode}
              />
            ))}
          </div>
        )}
      </main>

      {/* Detail Panel */}
      {detailFile && (
        <>
          <div
            onClick={() => setDetailFileId(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 99,
              background: 'rgba(0,0,0,0.3)',
            }}
          />
          <FileDetailPanel
            file={detailFile}
            onClose={() => setDetailFileId(null)}
            onUpdate={(updates) => updateFile(detailFile.id, updates)}
            onDelete={(id) => { deleteFiles(new Set([id])); }}
            onSendToTool={sendToTool}
          />
        </>
      )}
    </div>
  );
}
