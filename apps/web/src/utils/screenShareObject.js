import * as fabric from 'fabric'

// Active render loops: shareId -> animationFrameId
const renderLoops = new Map()

// Preset colors for different sharers (matches remote cursor palette)
const SHARE_COLORS = [
  '#e03131', '#1971c2', '#2f9e44', '#f76707',
  '#7048e8', '#c2255c', '#f59f00', '#0ca678',
]

let colorIndex = 0
const sharerColors = new Map()

function getSharerColor(username) {
  if (!sharerColors.has(username)) {
    sharerColors.set(username, SHARE_COLORS[colorIndex % SHARE_COLORS.length])
    colorIndex++
  }
  return sharerColors.get(username)
}

/**
 * Create a Fabric.js Rect with a custom _render override that draws
 * live video frames via an off-screen canvas buffer. This avoids
 * Fabric v7's Image caching issues with dynamic video sources and
 * keeps the hot path as cheap as possible.
 *
 * @param {HTMLVideoElement} videoEl - The video element with the screen share stream
 * @param {string} shareId - Unique share identifier
 * @param {string} username - Name of the sharer
 * @param {fabric.Canvas} canvas - The Fabric canvas instance
 * @returns {fabric.Rect} The configured Fabric object
 */
export function createScreenShareImage(videoEl, shareId, username, canvas) {
  const color = getSharerColor(username)

  const videoW = videoEl.videoWidth || 1920
  const videoH = videoEl.videoHeight || 1080

  console.log(`[ScreenShare] Creating video object: ${videoW}x${videoH} for ${username}`)

  // Create an off-screen canvas that acts as a frame buffer.
  // We draw the video onto this buffer in the render loop and then
  // the Fabric _render override just blits this pre-drawn buffer,
  // which is much cheaper than drawing the video element directly
  // inside Fabric's render pipeline.
  const bufferCanvas = document.createElement('canvas')
  bufferCanvas.width = videoW
  bufferCanvas.height = videoH
  const bufferCtx = bufferCanvas.getContext('2d', { alpha: false })

  const rect = new fabric.Rect({
    left: 100,
    top: 100,
    width: videoW,
    height: videoH,
    fill: '#000',
    originX: 'left',
    originY: 'top',
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    lockUniScaling: true,
    borderColor: color,
    cornerColor: color,
    cornerStyle: 'circle',
    cornerSize: 10,
    transparentCorners: false,
    borderScaleFactor: 2,
    padding: 4,
    lockRotation: true,
    hasRotatingPoint: false,
    objectCaching: false,
    stroke: color,
    strokeWidth: 2,
  })

  // Stash references on the object for the render loop
  rect._videoEl = videoEl
  rect._bufferCanvas = bufferCanvas
  rect._bufferCtx = bufferCtx

  // Override _render to blit the pre-drawn buffer canvas
  rect._render = function (ctx) {
    if (this._bufferCanvas) {
      ctx.drawImage(this._bufferCanvas, -this.width / 2, -this.height / 2, this.width, this.height)
    }
  }

  // Scale to a reasonable default size (640x360 or fit within viewport)
  const vw = canvas.getWidth()
  const vh = canvas.getHeight()
  const maxW = Math.min(640, vw * 0.6)
  const maxH = Math.min(360, vh * 0.6)
  const scale = Math.min(maxW / videoW, maxH / videoH, 1)
  rect.scaleX = scale
  rect.scaleY = scale

  // Center on viewport
  const vpt = canvas.viewportTransform
  const centerX = (vw / 2 - vpt[4]) / vpt[0]
  const centerY = (vh / 2 - vpt[5]) / vpt[3]
  rect.left = centerX - (videoW * scale) / 2
  rect.top = centerY - (videoH * scale) / 2

  // Mark as screen share (excluded from serialization/snapshots)
  rect._evoScreenShare = true
  rect._evoShareId = shareId
  rect._evoShareUser = username
  rect._evoShareColor = color

  return rect
}

/**
 * Start a render loop that copies video frames into an off-screen buffer
 * and then requests a Fabric re-render. The buffer copy is done outside
 * of Fabric's pipeline so it doesn't block other canvas interactions.
 *
 * Optimizations applied:
 * - Off-screen buffer: video → buffer is a simple blit, independent of canvas size
 * - requestRenderAll instead of renderAll: deduplicates multiple render calls
 *   to a single paint at the browser's next animation frame
 * - Frame throttling: only copies a new frame when enough time has elapsed
 * - No per-frame logging
 *
 * @param {fabric.Canvas} canvas - The Fabric canvas instance
 * @param {fabric.Object} fabricObj - The fabric object with custom _render
 * @param {HTMLVideoElement} videoEl - The source video element
 * @param {string} shareId - The share ID for tracking
 */
export function startFrameLoop(canvas, fabricObj, videoEl, shareId) {
  // Cancel any existing loop for this shareId
  stopFrameLoop(shareId)

  let lastTime = 0
  const TARGET_FPS = 24
  const FRAME_INTERVAL = 1000 / TARGET_FPS

  const bufferCtx = fabricObj._bufferCtx
  const bufferCanvas = fabricObj._bufferCanvas

  function render(now) {
    // Bail if the Fabric object was removed from the canvas
    if (!fabricObj.canvas) {
      renderLoops.delete(shareId)
      return
    }

    const elapsed = now - lastTime
    if (elapsed >= FRAME_INTERVAL) {
      if (videoEl.readyState >= videoEl.HAVE_CURRENT_DATA) {
        // Resize buffer if video resolution changed dynamically
        if (bufferCanvas.width !== videoEl.videoWidth || bufferCanvas.height !== videoEl.videoHeight) {
          bufferCanvas.width = videoEl.videoWidth
          bufferCanvas.height = videoEl.videoHeight
        }

        // Copy the current video frame into the off-screen buffer
        bufferCtx.drawImage(videoEl, 0, 0, bufferCanvas.width, bufferCanvas.height)

        // Mark the object dirty and request (not force) a re-render.
        // requestRenderAll coalesces multiple calls into one paint.
        fabricObj.dirty = true
        canvas.requestRenderAll()
      }
      lastTime = now - (elapsed % FRAME_INTERVAL)
    }

    const frameId = requestAnimationFrame(render)
    renderLoops.set(shareId, frameId)
  }

  const frameId = requestAnimationFrame(render)
  renderLoops.set(shareId, frameId)
}

/**
 * Stop the render loop for a given share.
 *
 * @param {string} shareId - The share ID to stop
 */
export function stopFrameLoop(shareId) {
  const frameId = renderLoops.get(shareId)
  if (frameId) {
    cancelAnimationFrame(frameId)
    renderLoops.delete(shareId)
  }
}

/**
 * Stop all active render loops (cleanup on unmount).
 */
export function stopAllFrameLoops() {
  for (const [, frameId] of renderLoops.entries()) {
    cancelAnimationFrame(frameId)
  }
  renderLoops.clear()
}
