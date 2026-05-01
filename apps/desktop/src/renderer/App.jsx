import React, { useEffect, useRef, useState } from 'react';
import Canvas from './components/Canvas/Canvas';
import Toolbar from './components/Toolbar/Toolbar';

export default function App() {
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const canvasComponentRef = useRef(null);

  // Tools State
  const [activeTool, setActiveTool] = useState('pen');
  const [strokeColor, setStrokeColor] = useState('#ff0000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [strokeOpacity, setStrokeOpacity] = useState(1);
  const [strokeStyle, setStrokeStyle] = useState('solid');

  useEffect(() => {
    // Get initial state
    window.electronAPI.getDrawingMode().then(mode => {
      setIsDrawingMode(mode);
    });

    // Listen for mode changes
    window.electronAPI.onDrawingModeChanged((mode) => {
      setIsDrawingMode(mode);
    });
  }, []);

  // Update DOM styles and pointer-events when isDrawingMode changes
  useEffect(() => {
    if (isDrawingMode) {
      // drawing mode → body receives mouse events
      document.body.style.pointerEvents = 'auto';
      document.body.style.cursor = 'crosshair';
      document.body.style.background = 'rgba(0, 0, 0, 0.01)';
    } else {
      // passthrough mode → body does not receive mouse events
      document.body.style.pointerEvents = 'none';
      document.body.style.cursor = 'default';
      document.body.style.background = 'transparent';
    }
  }, [isDrawingMode]);

  const handleUndo = () => {
    if (canvasComponentRef.current?.undo) {
      canvasComponentRef.current.undo();
    }
  };

  const handleRedo = () => {
    if (canvasComponentRef.current?.redo) {
      canvasComponentRef.current.redo();
    }
  };

  return (
    <>
      <div 
        className="overlay-page"
        style={{ 
          position: 'relative',
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          pointerEvents: isDrawingMode ? 'auto' : 'none'
        }}
      >
        <Canvas 
          ref={canvasComponentRef}
          activeTool={activeTool}
          onToolSelect={setActiveTool}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
          strokeOpacity={strokeOpacity}
          strokeStyle={strokeStyle}
          roomId={null}
          isConnected={false} // Disable socket sync for now
        />

        {isDrawingMode && (
          <Toolbar 
            activeTool={activeTool}
            onToolSelect={setActiveTool}
            strokeColor={strokeColor}
            onColorChange={setStrokeColor}
            strokeWidth={strokeWidth}
            onWidthChange={setStrokeWidth}
            strokeOpacity={strokeOpacity}
            onOpacityChange={setStrokeOpacity}
            strokeStyle={strokeStyle}
            onStyleChange={setStrokeStyle}
            onUndo={handleUndo}
            onRedo={handleRedo}
            showHint={false}
          />
        )}
      </div>

      <div id="overlay-indicator" className={isDrawingMode ? 'mode-drawing' : 'mode-passthrough'} style={{ zIndex: 1001 }}>
        {isDrawingMode ? '⬤ Drawing Mode — Ctrl+Shift+D to exit' : '⬤ Click-through — Ctrl+Shift+D to draw'}
      </div>
    </>
  );
}