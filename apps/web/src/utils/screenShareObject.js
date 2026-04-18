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
 * live video frames directly. This bypasses Fabric v7's Image caching
 * which doesn't properly handle dynamic canvas/video sources.
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

  const rect = new fabric.Rect({
    left: 100,
    top: 100,
    width: videoW,
    height: videoH,
    fill: 'transparent',
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
    // Transparent stroke — the border is handled by Fabric controls
    stroke: color,
    strokeWidth: 2,
  })

  // Override _render to draw video frames directly onto the Fabric canvas context
  // This completely bypasses Fabric's Image/texture caching
  rect._videoEl = videoEl
  const originalRender = rect._render.bind(rect)
  rect._render = function (ctx) {
    // Draw the video frame directly
    if (this._videoEl && this._videoEl.readyState >= this._videoEl.HAVE_CURRENT_DATA) {
      ctx.drawImage(this._videoEl, -this.width / 2, -this.height / 2, this.width, this.height)
    } else {
      // Fallback: draw a placeholder rectangle
      originalRender(ctx)
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
 * Start a render loop that triggers canvas re-renders at the target FPS
 * so the custom _render override draws fresh video frames.
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
  let frameCount = 0
  const TARGET_FPS = 24
  const FRAME_INTERVAL = 1000 / TARGET_FPS

  function render(now) {
    if (!canvas || !fabricObj || !fabricObj.canvas) {
      console.warn('[ScreenShare] Render loop stopped — object detached from canvas')
      renderLoops.delete(shareId)
      return
    }

    if (now - lastTime >= FRAME_INTERVAL) {
      if (videoEl.readyState >= videoEl.HAVE_CURRENT_DATA) {
        canvas.renderAll()
        frameCount++
        if (frameCount % 72 === 1) {
          console.log(`[ScreenShare] Render loop active, frame #${frameCount}`)
        }
      }
      lastTime = now
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
  for (const [shareId, frameId] of renderLoops.entries()) {
    cancelAnimationFrame(frameId)
  }
  renderLoops.clear()
}
