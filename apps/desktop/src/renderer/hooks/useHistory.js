import { useEffect, useRef, useCallback } from 'react'
import * as fabric from 'fabric'

export default function useHistory(canvas, syncState) {
  const undoStack = useRef([])
  const redoStack = useRef([])
  const historyApplying = useRef(false)
  const isDragging = useRef(false)
  const dragState = useRef(null)

  const saveState = useCallback((op) => {
    if (undoStack.current.length >= 50) {
      undoStack.current.shift()
    }
    undoStack.current.push(op)
    redoStack.current = []
  }, [])

  useEffect(() => {
    if (!canvas) return

    const shouldIgnore = () => syncState?.current?._applying || historyApplying.current

    const onAdded = ({ target }) => {
      if (shouldIgnore() || target._evoDrawing || target._evoScreenShare || target._evoUploading) return

      if (!target._evoId) {
        target._evoId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      }

      saveState({
        type: 'add',
        id: target._evoId,
        object: { ...target.toJSON(['_evoId', '_evoImage']), _evoId: target._evoId, _evoImage: target._evoImage || false }
      })
    }

    const onRemoved = ({ target }) => {
      if (shouldIgnore() || target._evoDrawing || target._evoScreenShare || target._evoUploading) return
      saveState({
        type: 'remove',
        id: target._evoId,
        object: { ...target.toJSON(['_evoId', '_evoImage']), _evoId: target._evoId, _evoImage: target._evoImage || false }
      })
    }

    const onModified = ({ target }) => {
      if (shouldIgnore() || target._evoScreenShare || target._evoUploading) return
      const prevState = dragState.current
      if (prevState) {
        saveState({
          type: 'modify',
          id: target._evoId || prevState._evoId,
          prevState: prevState,
          newState: { ...target.toJSON(['_evoId', '_evoImage']), _evoId: target._evoId, _evoImage: target._evoImage || false }
        })
      }
      dragState.current = null
      isDragging.current = false
    }

    const onBeforeModify = (e) => {
      if (shouldIgnore() || isDragging.current || !e.target || e.target._evoScreenShare || e.target._evoUploading) return
      isDragging.current = true
      dragState.current = { ...e.target.toJSON(['_evoId', '_evoImage']), _evoId: e.target._evoId, _evoImage: e.target._evoImage || false }
    }

    canvas.on('object:added', onAdded)
    canvas.on('object:removed', onRemoved)
    canvas.on('object:modified', onModified)

    canvas.on('mouse:down', (o) => {
      if (o.target && !isDragging.current) onBeforeModify(o)
    })

    canvas.on('path:created', () => {
      if (shouldIgnore()) return
    })

    return () => {
      canvas.off('object:added', onAdded)
      canvas.off('object:removed', onRemoved)
      canvas.off('object:modified', onModified)
      canvas.off('mouse:down', onBeforeModify)
    }
  }, [canvas, saveState, syncState])

  const findById = (evoId) => {
    return canvas.getObjects().find((o) => o._evoId === evoId || (o.toJSON()._evoId === evoId)) || null
  }

  const applyOp = useCallback(async (op, isUndo) => {
    if (!canvas) return
    historyApplying.current = true

    try {
      if (op.type === 'add') {
        if (isUndo) {
          const target = findById(op.id)
          if (target) {
            canvas.remove(target)
          }
        } else {
          const [obj] = await fabric.util.enlivenObjects([op.object])
          if (op.object._evoId) obj._evoId = op.object._evoId
          if (op.object._evoImage) obj._evoImage = true
          canvas.add(obj)
        }
      } else if (op.type === 'remove') {
        if (isUndo) {
          const [obj] = await fabric.util.enlivenObjects([op.object])
          if (op.object._evoId) obj._evoId = op.object._evoId
          if (op.object._evoImage) obj._evoImage = true
          canvas.add(obj)
        } else {
          const target = findById(op.id)
          if (target) {
            canvas.remove(target)
          }
        }
      } else if (op.type === 'modify') {
        const target = findById(op.id)
        if (target) {
          const stateToApply = isUndo ? op.prevState : op.newState
          const { _evoId, ...props } = stateToApply
          target.set(props)
          target.setCoords()
          canvas.fire('object:modified', { target })
        }
      }
    } finally {
      if (canvas) canvas.requestRenderAll()
      historyApplying.current = false
    }
  }, [canvas])

  const undo = useCallback(async () => {
    if (undoStack.current.length === 0) return
    const op = undoStack.current.pop()
    redoStack.current.push(op)
    await applyOp(op, true)
  }, [applyOp])

  const redo = useCallback(async () => {
    if (redoStack.current.length === 0) return
    const op = redoStack.current.pop()
    undoStack.current.push(op)
    await applyOp(op, false)
  }, [applyOp])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return

      if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (e.shiftKey) {
          redo()
        } else {
          undo()
        }
      } else if (e.key.toLowerCase() === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  return { undo, redo, canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0 }
}
