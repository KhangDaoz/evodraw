import { useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../services/socket';

/**
 * Emits overlay strokes via overlay:stroke:add when a shareId is present.
 * Path coordinates are normalized to 0–1 range relative to screen dimensions
 * so the web canvas can re-map them onto the screen share proxy rect.
 */
export default function useOverlayEmit(canvas, roomId, shareId, screenSize) {
  const strokeHistoryRef = useRef([]);

  const normalizePath = useCallback((fabricPath) => {
    const { width: screenW, height: screenH } = screenSize;
    return fabricPath.path.map(segment =>
      segment.map((val, i) => {
        if (i === 0) return val; // SVG command letter (M, Q, L…)
        return i % 2 === 1 ? val / screenW : val / screenH;
      })
    );
  }, [screenSize]);

  useEffect(() => {
    if (!canvas || !roomId || !shareId) return;

    const onPathCreated = ({ path }) => {
      const socket = getSocket();
      if (!socket?.connected) return;

      const strokeId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      path._evoStrokeId = strokeId;
      path._evoOverlay = true;
      strokeHistoryRef.current.push(strokeId);

      const { width: screenW } = screenSize;
      const pathData = normalizePath(path);

      socket.emit('overlay:stroke:add', {
        roomId,
        shareId,
        stroke: {
          id: strokeId,
          pathData,
          color: path.stroke,
          width: path.strokeWidth / screenW,
          opacity: path.opacity || 1,
        },
      });
    };

    canvas.on('path:created', onPathCreated);
    return () => canvas.off('path:created', onPathCreated);
  }, [canvas, roomId, shareId, screenSize, normalizePath]);

  const undo = useCallback(() => {
    if (!canvas || !strokeHistoryRef.current.length) return;
    const socket = getSocket();
    const lastId = strokeHistoryRef.current.pop();
    const obj = canvas.getObjects().find(o => o._evoStrokeId === lastId);
    if (obj) {
      canvas.remove(obj);
      canvas.requestRenderAll();
    }
    if (socket?.connected && roomId && shareId) {
      socket.emit('overlay:stroke:remove', { roomId, shareId, strokeId: lastId });
    }
  }, [canvas, roomId, shareId]);

  const clearAll = useCallback(() => {
    if (!canvas) return;
    const socket = getSocket();
    canvas.getObjects().filter(o => o._evoOverlay).forEach(obj => canvas.remove(obj));
    canvas.requestRenderAll();
    strokeHistoryRef.current = [];
    if (socket?.connected && roomId && shareId) {
      socket.emit('overlay:stroke:clear', { roomId, shareId });
    }
  }, [canvas, roomId, shareId]);

  // Called by eraser on overlay strokes
  const eraseStroke = useCallback((target) => {
    if (!canvas || !target?._evoOverlay) return;
    const socket = getSocket();
    const strokeId = target._evoStrokeId;
    canvas.remove(target);
    canvas.requestRenderAll();
    strokeHistoryRef.current = strokeHistoryRef.current.filter(id => id !== strokeId);
    if (socket?.connected && roomId && shareId && strokeId) {
      socket.emit('overlay:stroke:remove', { roomId, shareId, strokeId });
    }
  }, [canvas, roomId, shareId]);

  return { undo, clearAll, eraseStroke };
}
