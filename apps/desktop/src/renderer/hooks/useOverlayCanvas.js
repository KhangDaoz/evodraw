import { useRef, useEffect, useState } from 'react'
import * as fabric from 'fabric'

export default function useOverlayCanvas(screenSize) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [fabricCanvas, setFabricCanvas] = useState(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const { width, height } = screenSize

    canvasRef.current.width = width
    canvasRef.current.height = height

    const canvas = new fabric.Canvas(canvasRef.current, {
      width,
      height,
      isDrawingMode: false,
      backgroundColor: 'transparent',
      selection: false,
      perPixelTargetFind: true,
      targetFindTolerance: 5,
    })

    if (canvas.wrapperEl) {
      canvas.wrapperEl.style.cssText +=
        ';position:fixed!important;inset:0!important;z-index:1!important;background:transparent!important'
    }

    setFabricCanvas(canvas)

    return () => {
      canvas.dispose()
      setFabricCanvas(null)
    }
  }, [screenSize.width, screenSize.height])

  return { fabricCanvas, containerRef, canvasRef }
}
