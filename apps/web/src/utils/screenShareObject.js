import * as fabric from 'fabric'

// Active overlays: shareId -> { overlayDiv, proxyRect, cleanup }
const overlays = new Map()

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
 * Convert Fabric scene coordinates to screen CSS for a given object.
 * Accounts for pan, zoom, and object scale.
 *
 * @param {fabric.Object} fabricObj - The Fabric proxy object
 * @param {fabric.Canvas} canvas - The Fabric canvas
 * @param {HTMLElement} overlayDiv - The DOM overlay to position
 */
function syncOverlayPosition(fabricObj, overlayDiv, canvas) {
  const vpt = canvas.viewportTransform // [scaleX, skewY, skewX, scaleY, panX, panY]
  const zoom = vpt[0]
  const panX = vpt[4]
  const panY = vpt[5]

  // Fabric object position/size in scene coordinates
  const left = fabricObj.left
  const top = fabricObj.top
  const w = fabricObj.width * fabricObj.scaleX
  const h = fabricObj.height * fabricObj.scaleY

  // Convert to screen pixels
  const screenX = left * zoom + panX
  const screenY = top * zoom + panY
  const screenW = w * zoom
  const screenH = h * zoom

  overlayDiv.style.transform = `translate(${screenX}px, ${screenY}px)`
  overlayDiv.style.width = `${screenW}px`
  overlayDiv.style.height = `${screenH}px`
}

/**
 * Create a native DOM video overlay and a transparent Fabric proxy object.
 *
 * The video element is placed in a DOM layer between the dot-grid background
 * and the Fabric canvas. The proxy Rect sits on the Fabric canvas and handles
 * selection/move/resize — its position is synced to the video overlay via CSS.
 *
 * This gives Discord-quality native video rendering (hardware-decoded, full FPS)
 * while allowing drawings on the Fabric canvas to appear on top of the video.
 *
 * @param {HTMLVideoElement} videoEl - The video element with the screen share stream
 * @param {string} shareId - Unique share identifier
 * @param {string} username - Name of the sharer
 * @param {fabric.Canvas} canvas - The Fabric canvas instance
 * @param {HTMLElement} layerEl - The screen share layer container element
 * @returns {{ proxyRect: fabric.Rect, overlayDiv: HTMLElement }}
 */
export function createScreenShareOverlay(videoEl, shareId, username, canvas, layerEl) {
  const color = getSharerColor(username)

  const videoW = videoEl.videoWidth || 1920
  const videoH = videoEl.videoHeight || 1080

  console.log(`[ScreenShare] Creating overlay: ${videoW}x${videoH} for ${username}`)

  // --- DOM overlay ---
  const overlayDiv = document.createElement('div')
  overlayDiv.className = 'screen-share-overlay'
  overlayDiv.dataset.shareId = shareId

  // Make the video visible and fill the overlay
  videoEl.style.display = ''
  videoEl.style.width = '100%'
  videoEl.style.height = '100%'
  videoEl.style.objectFit = 'contain'
  videoEl.style.pointerEvents = 'none'
  videoEl.style.borderRadius = '4px'

  // Remove from body if it was appended there (legacy pattern)
  if (videoEl.parentNode === document.body) {
    document.body.removeChild(videoEl)
  }

  overlayDiv.appendChild(videoEl)

  // Username label
  const label = document.createElement('div')
  label.className = 'screen-share-label'
  label.style.background = color
  label.textContent = username
  overlayDiv.appendChild(label)

  // Border indicator
  overlayDiv.style.outline = `2px solid ${color}`
  overlayDiv.style.outlineOffset = '-1px'

  // Inject into the screen share layer
  layerEl.appendChild(overlayDiv)

  // --- Fabric proxy (transparent, interaction-only) ---
  const proxyRect = new fabric.Rect({
    left: 100,
    top: 100,
    width: videoW,
    height: videoH,
    fill: 'rgba(0, 0, 0, 0.005)',
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
    stroke: 'transparent',
    strokeWidth: 0,
  })

  // Mark as screen share (excluded from serialization/snapshots)
  proxyRect._evoScreenShare = true
  proxyRect._evoShareId = shareId
  proxyRect._evoShareUser = username
  proxyRect._evoShareColor = color

  // Scale to a reasonable default size (640x360 or fit within viewport)
  const vw = canvas.getWidth()
  const vh = canvas.getHeight()
  const maxW = Math.min(640, vw * 0.6)
  const maxH = Math.min(360, vh * 0.6)
  const scale = Math.min(maxW / videoW, maxH / videoH, 1)
  proxyRect.scaleX = scale
  proxyRect.scaleY = scale

  // Center on viewport
  const vpt = canvas.viewportTransform
  const centerX = (vw / 2 - vpt[4]) / vpt[0]
  const centerY = (vh / 2 - vpt[5]) / vpt[3]
  proxyRect.left = centerX - (videoW * scale) / 2
  proxyRect.top = centerY - (videoH * scale) / 2

  // Initial position sync
  syncOverlayPosition(proxyRect, overlayDiv, canvas)

  // --- Event bindings: keep overlay in sync ---

  // Sync on move
  const onMoving = () => syncOverlayPosition(proxyRect, overlayDiv, canvas)
  proxyRect.on('moving', onMoving)

  // Sync on scale
  const onScaling = () => syncOverlayPosition(proxyRect, overlayDiv, canvas)
  proxyRect.on('scaling', onScaling)

  // Sync on modified (after drag/scale ends — snap final position)
  const onModified = () => syncOverlayPosition(proxyRect, overlayDiv, canvas)
  proxyRect.on('modified', onModified)

  // Sync all overlays on viewport transform (pan/zoom)
  const onViewportTransform = () => {
    for (const [, entry] of overlays.entries()) {
      syncOverlayPosition(entry.proxyRect, entry.overlayDiv, entry.canvas)
    }
  }

  // Fabric fires different events depending on version for viewport changes.
  // We listen on the canvas-level events.
  canvas.on('after:render', onViewportTransform)

  // Cleanup function
  const cleanup = () => {
    proxyRect.off('moving', onMoving)
    proxyRect.off('scaling', onScaling)
    proxyRect.off('modified', onModified)
    canvas.off('after:render', onViewportTransform)
  }

  // Store in registry
  overlays.set(shareId, {
    overlayDiv,
    proxyRect,
    videoEl,
    canvas,
    cleanup,
  })

  return { proxyRect, overlayDiv }
}

/**
 * Remove a screen share overlay and its proxy object.
 *
 * @param {string} shareId - The share ID to remove
 * @param {fabric.Canvas} [canvas] - Optional canvas to remove proxy from
 */
export function removeScreenShareOverlay(shareId, canvas) {
  const entry = overlays.get(shareId)
  if (!entry) return

  // Run cleanup (unbind events)
  entry.cleanup()

  // Remove DOM overlay
  if (entry.overlayDiv && entry.overlayDiv.parentNode) {
    // Detach video element first (caller may want to stop the stream separately)
    if (entry.videoEl && entry.videoEl.parentNode === entry.overlayDiv) {
      entry.overlayDiv.removeChild(entry.videoEl)
    }
    entry.overlayDiv.parentNode.removeChild(entry.overlayDiv)
  }

  // Remove Fabric proxy
  const targetCanvas = canvas || entry.canvas
  if (targetCanvas && entry.proxyRect) {
    targetCanvas.remove(entry.proxyRect)
    targetCanvas.requestRenderAll()
  }

  overlays.delete(shareId)
}

/**
 * Remove all screen share overlays (cleanup on unmount).
 *
 * @param {fabric.Canvas} [canvas] - Optional canvas reference
 */
export function removeAllOverlays(canvas) {
  for (const [shareId] of overlays.entries()) {
    removeScreenShareOverlay(shareId, canvas)
  }
}

/**
 * Force re-sync all overlay positions. Call this after a viewport
 * transform that doesn't trigger Fabric's after:render (e.g. programmatic zoom).
 */
export function syncAllOverlays() {
  for (const [, entry] of overlays.entries()) {
    syncOverlayPosition(entry.proxyRect, entry.overlayDiv, entry.canvas)
  }
}
