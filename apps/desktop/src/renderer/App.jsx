import React, { useEffect, useRef, useState } from 'react';

export default function App() {
  const canvasRef = useRef(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);

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
    const canvas = canvasRef.current;
    if (canvas) {
      if (isDrawingMode) {
        // drawing mode → canvas + body receive mouse events
        document.body.style.pointerEvents = 'auto';
        canvas.style.pointerEvents = 'auto';
        document.body.style.cursor = 'crosshair';
        canvas.style.cursor = 'crosshair';
        canvas.style.background = 'rgba(0, 0, 0, 0.01)';
      } else {
        // passthrough mode → canvas + body not receive mouse events
        document.body.style.pointerEvents = 'none';
        canvas.style.pointerEvents = 'none';
        document.body.style.cursor = 'default';
        canvas.style.cursor = 'default';
        canvas.style.background = 'transparent';
      }
      console.log(`[Renderer] Drawing mode: ${isDrawingMode ? 'ON' : 'OFF'}`);
    }
  }, [isDrawingMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      // Set initial size
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      console.log(`[Overlay Renderer] Canvas size: ${canvas.width}x${canvas.height}`);

      // Handle window resize
      const handleResize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      };

      window.addEventListener('resize', handleResize);
      
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }
  }, []);

  return (
    <>
      <canvas id="draw-canvas" ref={canvasRef}></canvas>
      <div id="overlay-indicator" className={isDrawingMode ? 'mode-drawing' : 'mode-passthrough'}>
        {isDrawingMode ? '⬤ Drawing Mode — Ctrl+Shift+D to exit' : '⬤ Click-through — Ctrl+Shift+D to draw'}
      </div>
    </>
  );
}