import { useState, useEffect, useRef, useCallback } from 'react';
import * as fabric from 'fabric';
import useRoom from '../hooks/useRoom';
import useCanvasSync from '../hooks/useCanvasSync';
import useHistory from '../hooks/useHistory';
import useOverlayEmit from '../hooks/useOverlayEmit';

const TOOLS = [
  { id: 'pen', label: 'Pen (P)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg> },
  { id: 'highlighter', label: 'Highlighter (H)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg> },
  { id: 'eraser', label: 'Eraser (E)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg> },
];

const COLORS = ['#e03131', '#1971c2', '#2f9e44', '#f76707', '#f59f00', '#fff', '#000'];
const WIDTHS = [2, 4, 8, 12];

export default function OverlayPage({ roomInfo, serverUrl, screenSize, onLeave }) {
  const { roomId, username, shareId } = roomInfo;
  const isOverlayMode = !!shareId; // launched via deep link for screen annotation

  // Canvas state
  const canvasElRef = useRef(null);
  const fabricRef = useRef(null);
  const syncState = useRef({ _applying: false });
  const [fabricCanvas, setFabricCanvas] = useState(null);

  // Tool state
  const [mode, setMode] = useState('working');
  const [activeTool, setActiveTool] = useState('pen');
  const [color, setColor] = useState('#e03131');
  const [width, setWidth] = useState(4);
  const [transparent, setTransparent] = useState(true);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showWidthPicker, setShowWidthPicker] = useState(false);

  // Room connection
  const { isConnected, connectedUsers, error: roomError } = useRoom(serverUrl, roomId, username);

  // ── Stroke emission strategy ──
  // Overlay mode (shareId present): emit overlay:stroke:add with normalized screen coords
  // Regular mode: sync full canvas state via canvas_op
  const { undo: overlayUndo, clearAll: overlayClearAll, eraseStroke } =
    useOverlayEmit(isOverlayMode ? fabricCanvas : null, roomId, shareId, screenSize);

  useCanvasSync(isOverlayMode ? null : fabricCanvas, syncState, roomId, isConnected);
  const { undo: historyUndo } = useHistory(isOverlayMode ? null : fabricCanvas, syncState);

  const undo = isOverlayMode ? overlayUndo : historyUndo;

  // Init Fabric canvas
  useEffect(() => {
    if (!canvasElRef.current) return;
    const { width: w, height: h } = screenSize;
    canvasElRef.current.width = w;
    canvasElRef.current.height = h;

    const fc = new fabric.Canvas(canvasElRef.current, {
      isDrawingMode: false,
      backgroundColor: 'transparent',
      selection: false,
      width: w,
      height: h,
    });

    fc.freeDrawingBrush = new fabric.PencilBrush(fc);
    fc.freeDrawingBrush.color = '#e03131';
    fc.freeDrawingBrush.width = 4;
    fc.freeDrawingBrush.decimate = 2;

    fabricRef.current = fc;
    setFabricCanvas(fc);

    return () => {
      fc.dispose();
      fabricRef.current = null;
      setFabricCanvas(null);
    };
  }, [screenSize]);

  // Apply tool settings to canvas
  useEffect(() => {
    const fc = fabricCanvas;
    if (!fc) return;

    if (mode !== 'drawing') {
      fc.isDrawingMode = false;
      return;
    }

    if (activeTool === 'pen') {
      fc.isDrawingMode = true;
      fc.freeDrawingBrush = new fabric.PencilBrush(fc);
      fc.freeDrawingBrush.color = color;
      fc.freeDrawingBrush.width = width;
      fc.freeDrawingBrush.decimate = 2;
    } else if (activeTool === 'highlighter') {
      fc.isDrawingMode = true;
      fc.freeDrawingBrush = new fabric.PencilBrush(fc);
      fc.freeDrawingBrush.color = color;
      fc.freeDrawingBrush.width = width * 4;
      fc.freeDrawingBrush.decimate = 2;
    } else if (activeTool === 'eraser') {
      fc.isDrawingMode = false;
    }
  }, [fabricCanvas, mode, activeTool, color, width]);

  // Eraser: click-to-remove
  useEffect(() => {
    const fc = fabricCanvas;
    if (!fc || activeTool !== 'eraser' || mode !== 'drawing') return;

    const onMouseDown = (opt) => {
      const target = fc.findTarget(opt.e);
      if (!target) return;

      if (isOverlayMode) {
        // Only erase overlay strokes; emit removal to server
        if (target._evoOverlay) eraseStroke(target);
      } else {
        fc.remove(target);
        fc.requestRenderAll();
      }
    };
    fc.on('mouse:down', onMouseDown);
    return () => fc.off('mouse:down', onMouseDown);
  }, [fabricCanvas, activeTool, mode, isOverlayMode, eraseStroke]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'p' || e.key === 'P') setActiveTool('pen');
      if (e.key === 'h' || e.key === 'H') setActiveTool('highlighter');
      if (e.key === 'e' || e.key === 'E') setActiveTool('eraser');
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'Escape') { setShowColorPicker(false); setShowWidthPicker(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  // Sync mode with main process
  useEffect(() => {
    const off = window.electronAPI.onModeChange((m) => setMode(m));
    return off;
  }, []);

  const toggleMode = useCallback(() => {
    const next = mode === 'drawing' ? 'working' : 'drawing';
    setMode(next);
    window.electronAPI.setMode(next);
    window.electronAPI.setIgnoreMouse(next !== 'drawing');
  }, [mode]);

  const toggleTransparency = useCallback(() => {
    setTransparent(v => !v);
  }, []);

  const handleClearAll = useCallback(() => {
    if (isOverlayMode) {
      overlayClearAll();
    } else {
      const fc = fabricRef.current;
      if (!fc) return;
      fc.getObjects().slice().forEach(obj => fc.remove(obj));
      fc.requestRenderAll();
    }
  }, [isOverlayMode, overlayClearAll]);

  const handleLeave = useCallback(() => {
    fabricRef.current?.dispose();
    fabricRef.current = null;
    onLeave();
  }, [onLeave]);

  const onToolbarEnter = () => window.electronAPI.setIgnoreMouse(false);
  const onToolbarLeave = () => { if (mode === 'working') window.electronAPI.setIgnoreMouse(true); };

  return (
    <div className={`overlay-root${transparent ? '' : ' solid-bg'}`}>
      <canvas ref={canvasElRef} id="overlay-canvas" />

      <div className={`mode-indicator ${mode}`}>
        <span className="mode-dot" />
        <span className="mode-text">{mode === 'drawing' ? 'Drawing' : 'Working'}</span>
      </div>

      <div
        className={`toolbar${mode === 'working' ? ' hidden' : ''}`}
        onMouseEnter={onToolbarEnter}
        onMouseLeave={onToolbarLeave}
      >
        {TOOLS.map(t => (
          <button
            key={t.id}
            className={`tool-btn${activeTool === t.id ? ' active' : ''}`}
            title={t.label}
            onClick={() => setActiveTool(t.id)}
          >{t.icon}</button>
        ))}

        <div className="toolbar-separator" />

        {/* Color */}
        <div className="color-picker-wrap" style={{ position: 'relative' }}>
          <button className="tool-btn color-btn" title="Color" onClick={() => { setShowColorPicker(v => !v); setShowWidthPicker(false); }}>
            <span className="color-swatch" style={{ background: color }} />
          </button>
          {showColorPicker && (
            <div className="color-dropdown">
              <div className="color-presets">
                {COLORS.map(c => (
                  <button key={c} className={`color-preset${color === c ? ' active' : ''}`}
                    style={{ background: c, border: c === '#fff' ? '1px solid #555' : undefined }}
                    onClick={() => { setColor(c); setShowColorPicker(false); }} />
                ))}
              </div>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} />
            </div>
          )}
        </div>

        {/* Width */}
        <div className="width-picker-wrap" style={{ position: 'relative' }}>
          <button className="tool-btn" title="Width" onClick={() => { setShowWidthPicker(v => !v); setShowColorPicker(false); }}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <line x1="4" y1="6" x2="20" y2="6" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="3"/>
              <line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" strokeWidth="5"/>
            </svg>
          </button>
          {showWidthPicker && (
            <div className="width-dropdown">
              {WIDTHS.map(w => (
                <button key={w} className={`width-opt${width === w ? ' active' : ''}`}
                  onClick={() => { setWidth(w); setShowWidthPicker(false); }}>
                  {w === 2 ? 'Thin' : w === 4 ? 'Normal' : w === 8 ? 'Thick' : 'Bold'}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="toolbar-separator" />

        {/* Undo */}
        <button className="tool-btn" title="Undo (Ctrl+Z)" onClick={undo}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
          </svg>
        </button>

        {/* Clear */}
        <button className="tool-btn" title="Clear All" onClick={handleClearAll}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
          </svg>
        </button>

        <div className="toolbar-separator" />

        {/* Transparency toggle */}
        <button
          className={`tool-btn${!transparent ? ' active' : ''}`}
          title={transparent ? 'Show background' : 'Hide background'}
          onClick={toggleTransparency}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="2"/>
            <path d="M2 12h20M12 2v20M7 7l10 10M17 7 7 17"/>
          </svg>
        </button>

        {/* Leave room */}
        <button className="tool-btn exit-btn" title="Leave Room" onClick={handleLeave}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>
      </div>

      {/* Status bar */}
      <div className={`connection-status${isConnected ? ' connected' : roomError ? ' error' : ''}`}
        onMouseEnter={onToolbarEnter} onMouseLeave={onToolbarLeave}>
        <span className="conn-dot" />
        <span className="conn-text">
          {isConnected
            ? `${roomId} · ${connectedUsers.length + 1} online`
            : roomError || 'Connecting…'}
        </span>
      </div>

      {/* Mode toggle FAB */}
      <button
        className="mode-toggle-fab"
        title="Toggle drawing mode (Ctrl+Shift+D)"
        onClick={toggleMode}
        onMouseEnter={onToolbarEnter}
        onMouseLeave={onToolbarLeave}
      >
        {mode === 'drawing'
          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        }
      </button>
    </div>
  );
}
