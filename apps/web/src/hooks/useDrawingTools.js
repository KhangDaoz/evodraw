import { useEffect } from 'react'
import * as fabric from 'fabric'

const hexToRgba = (hex, opacity) => {
  if (!hex) return `rgba(0, 0, 0, ${opacity})`
  let c = hex.replace('#', '')
  if (c.length === 3) c = c.split('').map(x => x + x).join('')
  const r = parseInt(c.slice(0, 2), 16) || 0
  const g = parseInt(c.slice(2, 4), 16) || 0
  const b = parseInt(c.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

/**
 * Handles all drawing tool interactions on the Fabric canvas:
 * pen, eraser, shapes (rect, circle, line, arrow), and text.
 *
 * Auto-switches to "select" mode after completing a shape.
 */
export default function useDrawingTools(fabricCanvas, activeTool, onToolSelect, strokeColor, strokeWidth, strokeOpacity = 1, strokeStyle = 'solid') {
  useEffect(() => {
    if (!fabricCanvas) return

    const colorWithOpacity = hexToRgba(strokeColor || '#000000', strokeOpacity)
    let currentDashArray = null
    if (strokeStyle === 'dashed') currentDashArray = [strokeWidth * 2, strokeWidth * 2]
    if (strokeStyle === 'dotted') currentDashArray = [strokeWidth, strokeWidth * 1.5]

    // --- Pen tool setup ---
    if (activeTool === 'pen') {
      fabricCanvas.isDrawingMode = true
      if (!fabricCanvas.freeDrawingBrush) {
        fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas)
      }
      fabricCanvas.freeDrawingBrush.color = colorWithOpacity
      fabricCanvas.freeDrawingBrush.width = strokeWidth || 5
      fabricCanvas.freeDrawingBrush.strokeDashArray = currentDashArray
      fabricCanvas.freeDrawingBrush.strokeLineCap = 'round'
      fabricCanvas.freeDrawingBrush.strokeLineJoin = 'round'
      fabricCanvas.freeDrawingBrush.decimate = 0.5 // Lower decimation for higher fidelity drawing
    } else {
      fabricCanvas.isDrawingMode = false
    }

    // --- Selection state ---
    const canSelect = activeTool === 'select' || activeTool === 'hand'
    const isEraser = activeTool === 'eraser'
    const isText = activeTool === 'text'

    fabricCanvas.selection = canSelect
    fabricCanvas.skipTargetFind = !canSelect && !isEraser && !isText

    fabricCanvas.forEachObject(obj => {
      obj.set({
        selectable: canSelect,
        evented: canSelect || isEraser,
      })
      obj.setCoords()
    })
    fabricCanvas.requestRenderAll()

    // --- Drawing state ---
    let drawing = false
    let shape = null
    let originX = 0
    let originY = 0

    const color = colorWithOpacity
    const lineWidth = strokeWidth || 5

    // Scene-space pointer (respects zoom/pan)
    const scenePoint = (o) => {
      if (o.scenePoint) return o.scenePoint
      return fabricCanvas.getScenePoint(o.e)
    }

    // Erase topmost object under cursor (per-pixel stroke detection)
    const eraseAt = (o) => {
      if (o.target) {
        if (o.target._evoScreenShare) return // screen shares are not erasable
        fabricCanvas.remove(o.target)
        fabricCanvas.requestRenderAll()
      }
    }

    // Snap angle to nearest 45° increment
    const snapEndpoint = (dx, dy) => {
      const angle = Math.atan2(dy, dx)
      const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
      const len = Math.sqrt(dx * dx + dy * dy)
      return { x: Math.cos(snapped) * len, y: Math.sin(snapped) * len }
    }

    // ─── MOUSE DOWN ───
    const onMouseDown = (o) => {
      if (fabricCanvas.isDrawingMode) return
      if (o.e.button === 1 || o.e.button === 2 || o.e.altKey) return
      if (canSelect) return

      // --- Text tool: create editable textbox on click ---
      if (isText) {
        // If clicking on an existing IText, let the default handler manage editing
        if (o.target && o.target.type === 'i-text') return

        const pt = scenePoint(o)
        const textbox = new fabric.IText('Type here', {
          left: pt.x,
          top: pt.y,
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: Math.max(16, lineWidth * 3),
          fill: color,
          selectable: true,
          evented: true,
          editable: true,
          cursorColor: color,
          cursorWidth: 2,
        })
        fabricCanvas.add(textbox)
        fabricCanvas.setActiveObject(textbox)
        textbox.enterEditing()
        textbox.selectAll()
        if (onToolSelect) onToolSelect('select')
        return
      }

      drawing = true

      if (activeTool === 'eraser') { eraseAt(o); return }

      const pt = scenePoint(o)
      originX = pt.x
      originY = pt.y

      const base = {
        stroke: color,
        strokeWidth: lineWidth,
        fill: 'transparent',
        strokeDashArray: currentDashArray,
        strokeLineCap: strokeStyle === 'dotted' ? 'round' : 'butt',
        originX: 'left',
        originY: 'top',
        selectable: false,
        evented: false,
        // Per-object override: only stroke pixels are clickable
        perPixelTargetFind: true,
      }

      switch (activeTool) {
        case 'rectangle':
        case 'frame':
          shape = new fabric.Rect({ left: originX, top: originY, width: 0, height: 0, ...base })
          shape._evoDrawing = true
          fabricCanvas.add(shape)
          break

        case 'circle':
          shape = new fabric.Ellipse({ left: originX, top: originY, rx: 0, ry: 0, ...base })
          shape._evoDrawing = true
          fabricCanvas.add(shape)
          break

        case 'line':
          shape = new fabric.Line([originX, originY, originX, originY], base)
          shape._evoDrawing = true
          fabricCanvas.add(shape)
          break

        case 'arrow': {
          const line = new fabric.Line([originX, originY, originX, originY], base)
          line._evoDrawing = true
          const headSize = 10 + lineWidth * 1.5
          const head = new fabric.Triangle({
            width: headSize, height: headSize,
            fill: color,
            left: originX, top: originY,
            originX: 'center', originY: 'center',
            selectable: false, evented: false,
          })
          head._evoDrawing = true
          shape = { _arrow: true, line, head }
          fabricCanvas.add(line, head)
          break
        }
      }
    }

    // ─── MOUSE MOVE ───
    const onMouseMove = (o) => {
      if (!drawing) return

      if (activeTool === 'eraser') { eraseAt(o); return }
      if (!shape) return

      const pt = scenePoint(o)
      const shift = o.e.shiftKey

      switch (activeTool) {
        case 'rectangle':
        case 'frame':
        case 'circle': {
          let w = Math.abs(pt.x - originX)
          let h = Math.abs(pt.y - originY)

          if (shift) { const s = Math.max(w, h); w = s; h = s }

          const left = pt.x < originX ? originX - w : originX
          const top = pt.y < originY ? originY - h : originY

          if (activeTool === 'circle') {
            shape.set({ left, top, rx: w / 2, ry: h / 2 })
          } else {
            shape.set({ left, top, width: w, height: h })
          }
          break
        }

        case 'line': {
          let ex = pt.x, ey = pt.y
          if (shift) {
            const s = snapEndpoint(pt.x - originX, pt.y - originY)
            ex = originX + s.x; ey = originY + s.y
          }
          shape.set({ x2: ex, y2: ey })
          break
        }

        case 'arrow': {
          let ex = pt.x, ey = pt.y
          if (shift) {
            const s = snapEndpoint(pt.x - originX, pt.y - originY)
            ex = originX + s.x; ey = originY + s.y
          }
          shape.line.set({ x2: ex, y2: ey })
          const angle = (Math.atan2(ey - originY, ex - originX) * 180) / Math.PI
          shape.head.set({ left: ex, top: ey, angle: angle + 90 })
          break
        }
      }

      fabricCanvas.requestRenderAll()
    }

    // ─── MOUSE UP ───
    const onMouseUp = (o) => {
      if (!drawing) return
      drawing = false

      if (activeTool === 'eraser') return

      // Finalize arrow: replace loose line+triangle with a clean Group
      if (shape?._arrow) {
        const pt = scenePoint(o)
        const dx = pt.x - originX
        const dy = pt.y - originY
        const len = Math.sqrt(dx * dx + dy * dy)
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI

        fabricCanvas.remove(shape.line, shape.head)

        if (len > 2) {
          const shaft = new fabric.Line([0, 0, len, 0], {
            stroke: color, 
            strokeWidth: lineWidth, 
            strokeLineCap: strokeStyle === 'dotted' ? 'round' : 'butt',
            strokeDashArray: currentDashArray
          })
          const headLen = 15 + lineWidth
          const tip = new fabric.Polygon([
            { x: len, y: 0 },
            { x: len - headLen, y: -headLen / 2 },
            { x: len - headLen, y: headLen / 2 },
          ], { fill: color })

          const group = new fabric.Group([shaft, tip], {
            left: originX, top: originY, angle,
            originX: 'left', originY: 'center',
            selectable: false, evented: false,
            perPixelTargetFind: true,
          })
          fabricCanvas.add(group)
        }

        fabricCanvas.requestRenderAll()
      } else if (shape) {
        // Finalize non-arrow shape: clear drawing flag, emit final state
        delete shape._evoDrawing
        fabricCanvas.fire('object:added', { target: shape })
      }

      shape = null

      // Auto-switch to select mode after drawing
      if (['rectangle', 'frame', 'circle', 'line', 'arrow'].includes(activeTool) && onToolSelect) {
        onToolSelect('select')
      }
    }

    fabricCanvas.on('mouse:down', onMouseDown)
    fabricCanvas.on('mouse:move', onMouseMove)
    fabricCanvas.on('mouse:up', onMouseUp)

    return () => {
      fabricCanvas.off('mouse:down', onMouseDown)
      fabricCanvas.off('mouse:move', onMouseMove)
      fabricCanvas.off('mouse:up', onMouseUp)
    }
  }, [fabricCanvas, activeTool, onToolSelect, strokeColor, strokeWidth, strokeOpacity, strokeStyle])
}
