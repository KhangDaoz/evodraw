import { useEffect, useRef, useCallback } from 'react';
import * as fabric from 'fabric';
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

  // Inbound: web peers may also draw on the screen-share rect from their side.
  // Render their strokes on the desktop canvas using normalized coords mapped
  // back to screen pixels.
  useEffect(() => {
    if (!canvas || !shareId || !screenSize) return;
    const socket = getSocket();
    if (!socket) return;

    const { width: screenW, height: screenH } = screenSize;

    const onAdded = ({ shareId: incomingShareId, stroke }) => {
      if (incomingShareId !== shareId) return;
      // Skip if we already have this stroke (defensive — server doesn't echo
      // to sender, but a reconnect could replay).
      if (canvas.getObjects().some(o => o._evoStrokeId === stroke.id)) return;
      if (!stroke?.pathData?.length) return;

      // Denormalize 0–1 path coords back to screen pixels.
      const denormalized = stroke.pathData.map(seg =>
        seg.map((val, i) => {
          if (i === 0) return val;
          return i % 2 === 1 ? val * screenW : val * screenH;
        })
      );
      const svgPath = denormalized.map(seg => seg.join(' ')).join(' ');

      try {
        const path = new fabric.Path(svgPath, {
          stroke: stroke.color,
          strokeWidth: Math.max(1, (stroke.width || 0.005) * screenW),
          fill: null,
          selectable: false,
          evented: false,
          hasControls: false,
          hasBorders: false,
          opacity: stroke.opacity || 1,
        });
        path._evoOverlay = true;
        path._evoStrokeId = stroke.id;
        canvas.add(path);
        canvas.requestRenderAll();
      } catch (err) {
        console.error('[OverlayEmit] Failed to create inbound stroke:', err);
      }
    };

    socket.on('overlay:stroke:added', onAdded);
    return () => socket.off('overlay:stroke:added', onAdded);
  }, [canvas, shareId, screenSize]);

  // Inbound: react when peers (web users) erase or clear desktop strokes.
  // Server uses socket.to(roomId) — sender doesn't receive its own echo, so
  // the desktop's own undo/erase emits won't double-remove here.
  useEffect(() => {
    if (!canvas || !shareId) return;
    const socket = getSocket();
    if (!socket) return;

    const onRemoved = ({ shareId: incomingShareId, strokeId }) => {
      if (incomingShareId !== shareId) return;
      const obj = canvas.getObjects().find(o => o._evoStrokeId === strokeId);
      if (obj) {
        canvas.remove(obj);
        canvas.requestRenderAll();
      }
      strokeHistoryRef.current = strokeHistoryRef.current.filter(id => id !== strokeId);
    };

    const onCleared = ({ shareId: incomingShareId }) => {
      if (incomingShareId !== shareId) return;
      canvas.getObjects().filter(o => o._evoOverlay).forEach(obj => canvas.remove(obj));
      canvas.requestRenderAll();
      strokeHistoryRef.current = [];
    };

    socket.on('overlay:stroke:removed', onRemoved);
    socket.on('overlay:stroke:cleared', onCleared);
    return () => {
      socket.off('overlay:stroke:removed', onRemoved);
      socket.off('overlay:stroke:cleared', onCleared);
    };
  }, [canvas, shareId]);

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
