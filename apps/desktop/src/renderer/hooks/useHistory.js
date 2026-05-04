import { useEffect, useRef, useCallback } from 'react';
import * as fabric from 'fabric';

export default function useHistory(canvas, syncState) {
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const historyApplying = useRef(false);
  const isDragging = useRef(false);
  const dragState = useRef(null);

  const saveState = useCallback((op) => {
    if (undoStack.current.length >= 50) undoStack.current.shift();
    undoStack.current.push(op);
    redoStack.current = [];
  }, []);

  useEffect(() => {
    if (!canvas) return;

    const shouldIgnore = () => syncState?.current?._applying || historyApplying.current;

    const onAdded = ({ target }) => {
      if (shouldIgnore() || target._evoDrawing || target._evoScreenShare || target._evoUploading) return;
      if (!target._evoId) target._evoId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      saveState({ type: 'add', id: target._evoId, object: { ...target.toJSON(['_evoId']), _evoId: target._evoId } });
    };

    const onRemoved = ({ target }) => {
      if (shouldIgnore() || target._evoDrawing || target._evoScreenShare || target._evoUploading) return;
      saveState({ type: 'remove', id: target._evoId, object: { ...target.toJSON(['_evoId']), _evoId: target._evoId } });
    };

    const onModified = ({ target }) => {
      if (shouldIgnore() || target._evoScreenShare || target._evoUploading) return;
      if (dragState.current) {
        saveState({ type: 'modify', id: target._evoId, prevState: dragState.current, newState: { ...target.toJSON(['_evoId']), _evoId: target._evoId } });
      }
      dragState.current = null;
      isDragging.current = false;
    };

    const onMouseDown = (o) => {
      if (shouldIgnore() || isDragging.current || !o.target || o.target._evoScreenShare) return;
      isDragging.current = true;
      dragState.current = { ...o.target.toJSON(['_evoId']), _evoId: o.target._evoId };
    };

    canvas.on('object:added', onAdded);
    canvas.on('object:removed', onRemoved);
    canvas.on('object:modified', onModified);
    canvas.on('mouse:down', onMouseDown);

    return () => {
      canvas.off('object:added', onAdded);
      canvas.off('object:removed', onRemoved);
      canvas.off('object:modified', onModified);
      canvas.off('mouse:down', onMouseDown);
    };
  }, [canvas, saveState, syncState]);

  const findById = useCallback((id) => canvas?.getObjects().find((o) => o._evoId === id) || null, [canvas]);

  const applyOp = useCallback(async (op, isUndo) => {
    if (!canvas) return;
    historyApplying.current = true;
    try {
      if (op.type === 'add') {
        if (isUndo) { const t = findById(op.id); if (t) canvas.remove(t); }
        else { const [obj] = await fabric.util.enlivenObjects([op.object]); if (op.object._evoId) obj._evoId = op.object._evoId; canvas.add(obj); }
      } else if (op.type === 'remove') {
        if (isUndo) { const [obj] = await fabric.util.enlivenObjects([op.object]); if (op.object._evoId) obj._evoId = op.object._evoId; canvas.add(obj); }
        else { const t = findById(op.id); if (t) canvas.remove(t); }
      } else if (op.type === 'modify') {
        const t = findById(op.id);
        if (t) { const { _evoId, ...props } = isUndo ? op.prevState : op.newState; t.set(props); t.setCoords(); canvas.fire('object:modified', { target: t }); }
      }
    } finally {
      canvas.requestRenderAll();
      historyApplying.current = false;
    }
  }, [canvas, findById]);

  const undo = useCallback(async () => {
    if (!undoStack.current.length) return;
    const op = undoStack.current.pop();
    redoStack.current.push(op);
    await applyOp(op, true);
  }, [applyOp]);

  const redo = useCallback(async () => {
    if (!redoStack.current.length) return;
    const op = redoStack.current.pop();
    undoStack.current.push(op);
    await applyOp(op, false);
  }, [applyOp]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (e.key.toLowerCase() === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return { undo, redo };
}
