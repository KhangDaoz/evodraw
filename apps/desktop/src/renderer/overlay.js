import * as fabric from 'fabric'
import { io } from 'socket.io-client'

// ── State ──
let canvas = null
let socket = null
let screenW = 0
let screenH = 0
let currentMode = 'working' // 'working' | 'drawing'
let currentTool = 'pen'
let currentColor = '#e03131'
let currentWidth = 4
let roomId = null
let shareId = null
let username = null
let strokeHistory = [] // for local undo

// ── DOM Elements ──
const modeIndicator = document.getElementById('mode-indicator')
const toolbar = document.getElementById('toolbar')
const connStatus = document.getElementById('connection-status')
const connText = connStatus.querySelector('.conn-text')
const colorSwatch = document.getElementById('color-swatch')
const colorDropdown = document.getElementById('color-dropdown')
const widthDropdown = document.getElementById('width-dropdown')
const settingsModal = document.getElementById('settings-modal')
const hotkeyInput = document.getElementById('hotkey-input')

// ── Initialize Fabric Canvas ──
function initCanvas() {
  const canvasEl = document.getElementById('overlay-canvas')
  canvasEl.width = screenW || window.innerWidth
  canvasEl.height = screenH || window.innerHeight

  canvas = new fabric.Canvas(canvasEl, {
    isDrawingMode: false,
    backgroundColor: 'transparent',
    selection: false,
    renderOnAddRemove: true,
    width: canvasEl.width,
    height: canvasEl.height,
  })

  // Set up drawing brush
  canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
  canvas.freeDrawingBrush.color = currentColor
  canvas.freeDrawingBrush.width = currentWidth
  canvas.freeDrawingBrush.decimate = 4

  // Handle new strokes
  canvas.on('path:created', ({ path }) => {
    if (!socket || !roomId || !shareId) return

    const strokeId = `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    path._evoStrokeId = strokeId
    path._evoOverlay = true

    strokeHistory.push(strokeId)

    // Normalize the path and send
    const normalized = normalizePath(path)
    socket.emit('overlay:stroke:add', {
      roomId,
      shareId,
      stroke: {
        id: strokeId,
        pathData: normalized.pathData,
        color: path.stroke,
        width: path.strokeWidth / screenW, // normalized width
        opacity: path.opacity || 1,
      },
    })
  })

  console.log('[Overlay] Canvas initialized:', canvasEl.width, 'x', canvasEl.height)
}

// ── Coordinate Normalization ──
// Convert Fabric path pixel coords to normalized 0–1 range
function normalizePath(fabricPath) {
  const pathData = fabricPath.path.map(segment => {
    return segment.map((val, i) => {
      if (i === 0) return val // command letter (M, Q, L, etc.)
      // Even indices after command = x coords, odd = y coords
      // In SVG path data: [cmd, x1, y1, x2, y2, ...]
      // Normalize based on position in the segment
      const isX = i % 2 === 1
      return isX ? val / screenW : val / screenH
    })
  })

  return {
    pathData,
    left: fabricPath.left / screenW,
    top: fabricPath.top / screenH,
    width: fabricPath.width / screenW,
    height: fabricPath.height / screenH,
    scaleX: fabricPath.scaleX,
    scaleY: fabricPath.scaleY,
  }
}

// ── Socket.io Connection ──
function connectToServer(serverUrl, token) {
  if (socket) {
    socket.disconnect()
  }

  socket = io(serverUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    timeout: 10000,
    auth: { token },
  })

  socket.on('connect', () => {
    console.log('[Overlay] Connected to server')
    updateConnectionStatus(true)

    // Join the room
    if (roomId && username) {
      socket.emit('join_room', { roomId, username })
    }
  })

  socket.on('disconnect', () => {
    console.log('[Overlay] Disconnected from server')
    updateConnectionStatus(false)
  })

  socket.on('connect_error', (err) => {
    console.error('[Overlay] Connection error:', err.message)
    updateConnectionStatus(false)
  })

  socket.on('screen:stopped', (data) => {
    if (data.shareId === shareId) {
      console.log('[Overlay] Screen share ended, quitting overlay')
      window.electronAPI.quit()
    }
  })
}

function updateConnectionStatus(connected) {
  if (connected) {
    connStatus.classList.add('connected')
    connText.textContent = `Connected: ${roomId || 'N/A'}`
  } else {
    connStatus.classList.remove('connected')
    connText.textContent = 'Disconnected'
  }
}

// ── Mode Management ──
function setMode(mode) {
  currentMode = mode

  if (mode === 'drawing') {
    document.body.classList.add('drawing-mode')
    canvas.isDrawingMode = currentTool !== 'eraser'
    toolbar.classList.remove('hidden')
    modeIndicator.className = 'mode-indicator drawing'
    modeIndicator.querySelector('.mode-text').textContent = 'Drawing'
    document.body.style.cursor = currentTool === 'eraser' ? 'crosshair' : 'crosshair'
  } else {
    document.body.classList.remove('drawing-mode')
    canvas.isDrawingMode = false
    toolbar.classList.add('hidden')
    modeIndicator.className = 'mode-indicator working'
    modeIndicator.querySelector('.mode-text').textContent = 'Working'
    document.body.style.cursor = 'default'

    // Close any open dropdowns
    colorDropdown.classList.add('hidden')
    widthDropdown.classList.add('hidden')
  }
}

// ── Tool Selection ──
function selectTool(tool) {
  currentTool = tool

  // Update button states
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === tool)
  })

  if (tool === 'pen') {
    canvas.isDrawingMode = true
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
    canvas.freeDrawingBrush.color = currentColor
    canvas.freeDrawingBrush.width = currentWidth
    canvas.freeDrawingBrush.decimate = 4
  } else if (tool === 'highlighter') {
    canvas.isDrawingMode = true
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
    canvas.freeDrawingBrush.color = currentColor
    canvas.freeDrawingBrush.width = currentWidth * 4
    canvas.freeDrawingBrush.decimate = 4
    // Highlighter uses lower opacity
    canvas.freeDrawingBrush.opacity = 0.35
  } else if (tool === 'eraser') {
    canvas.isDrawingMode = false
    document.body.style.cursor = 'crosshair'

    // Eraser: click on objects to remove them
    canvas.on('mouse:down', eraserMouseDown)
  } else if (tool === 'arrow') {
    canvas.isDrawingMode = false
    setupArrowTool()
  }

  // Remove eraser listener when switching away
  if (tool !== 'eraser') {
    canvas.off('mouse:down', eraserMouseDown)
  }
}

// ── Eraser Tool ──
function eraserMouseDown(opt) {
  if (currentTool !== 'eraser') return
  const target = canvas.findTarget(opt.e)
  if (target && target._evoOverlay) {
    const strokeId = target._evoStrokeId
    canvas.remove(target)
    canvas.requestRenderAll()

    if (socket && roomId && shareId) {
      socket.emit('overlay:stroke:remove', { roomId, shareId, strokeId })
    }
  }
}

// ── Arrow Tool ──
let arrowStart = null
function setupArrowTool() {
  const onMouseDown = (opt) => {
    if (currentTool !== 'arrow') {
      canvas.off('mouse:down', onMouseDown)
      canvas.off('mouse:up', onMouseUp)
      return
    }
    const pointer = canvas.getScenePoint(opt.e)
    arrowStart = { x: pointer.x, y: pointer.y }
  }

  const onMouseUp = (opt) => {
    if (currentTool !== 'arrow' || !arrowStart) return
    const pointer = canvas.getScenePoint(opt.e)

    // Draw arrow line
    const line = new fabric.Line(
      [arrowStart.x, arrowStart.y, pointer.x, pointer.y],
      {
        stroke: currentColor,
        strokeWidth: currentWidth,
        selectable: false,
        evented: true,
      }
    )

    const strokeId = `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    line._evoStrokeId = strokeId
    line._evoOverlay = true

    canvas.add(line)
    canvas.requestRenderAll()
    strokeHistory.push(strokeId)

    // Emit normalized arrow
    if (socket && roomId && shareId) {
      socket.emit('overlay:stroke:add', {
        roomId,
        shareId,
        stroke: {
          id: strokeId,
          type: 'arrow',
          pathData: [
            [arrowStart.x / screenW, arrowStart.y / screenH],
            [pointer.x / screenW, pointer.y / screenH],
          ],
          color: currentColor,
          width: currentWidth / screenW,
          opacity: 1,
        },
      })
    }

    arrowStart = null
  }

  canvas.on('mouse:down', onMouseDown)
  canvas.on('mouse:up', onMouseUp)
}

// ── Undo ──
function undo() {
  if (strokeHistory.length === 0) return

  const lastId = strokeHistory.pop()
  const obj = canvas.getObjects().find(o => o._evoStrokeId === lastId)
  if (obj) {
    canvas.remove(obj)
    canvas.requestRenderAll()

    if (socket && roomId && shareId) {
      socket.emit('overlay:stroke:remove', { roomId, shareId, strokeId: lastId })
    }
  }
}

// ── Clear All ──
function clearAll() {
  const overlayObjects = canvas.getObjects().filter(o => o._evoOverlay)
  overlayObjects.forEach(obj => canvas.remove(obj))
  canvas.requestRenderAll()
  strokeHistory = []

  if (socket && roomId && shareId) {
    socket.emit('overlay:stroke:clear', { roomId, shareId })
  }
}

// ── Color & Width ──
function setColor(color) {
  currentColor = color
  colorSwatch.style.background = color

  // Update active preset
  document.querySelectorAll('.color-preset').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === color)
  })

  if (canvas.freeDrawingBrush) {
    canvas.freeDrawingBrush.color = color
  }
}

function setWidth(width) {
  currentWidth = width
  if (canvas.freeDrawingBrush) {
    canvas.freeDrawingBrush.width = currentTool === 'highlighter' ? width * 4 : width
  }

  document.querySelectorAll('.width-opt').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.width) === width)
  })
}

// ── Toolbar Event Binding ──
function bindToolbarEvents() {
  // Tool buttons
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => selectTool(btn.dataset.tool))
  })

  // Color picker
  document.getElementById('color-btn').addEventListener('click', () => {
    colorDropdown.classList.toggle('hidden')
    widthDropdown.classList.add('hidden')
  })

  document.querySelectorAll('.color-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      setColor(btn.dataset.color)
      colorDropdown.classList.add('hidden')
    })
  })

  document.getElementById('custom-color').addEventListener('input', (e) => {
    setColor(e.target.value)
  })

  // Width picker
  document.getElementById('width-btn').addEventListener('click', () => {
    widthDropdown.classList.toggle('hidden')
    colorDropdown.classList.add('hidden')
  })

  document.querySelectorAll('.width-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      setWidth(parseInt(btn.dataset.width))
      widthDropdown.classList.add('hidden')
    })
  })

  // Undo
  document.getElementById('undo-btn').addEventListener('click', undo)

  // Clear
  document.getElementById('clear-btn').addEventListener('click', clearAll)

  // Settings
  document.getElementById('settings-btn').addEventListener('click', showSettings)

  // Exit
  document.getElementById('exit-btn').addEventListener('click', () => {
    window.electronAPI.quit()
  })

  // Toolbar drag
  makeDraggable(toolbar, document.getElementById('toolbar-drag'))

  // Keyboard shortcuts (when in drawing mode)
  document.addEventListener('keydown', (e) => {
    if (currentMode !== 'drawing') return
    if (settingsModal && !settingsModal.classList.contains('hidden')) return

    if (e.key === 'p' || e.key === 'P') selectTool('pen')
    if (e.key === 'h' || e.key === 'H') selectTool('highlighter')
    if (e.key === 'a' || e.key === 'A') selectTool('arrow')
    if (e.key === 'e' || e.key === 'E') selectTool('eraser')
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo() }
  })

  // Toolbar hover — keep interactive even in working mode
  toolbar.addEventListener('mouseenter', () => {
    window.electronAPI.setIgnoreMouse(false)
  })
  toolbar.addEventListener('mouseleave', () => {
    if (currentMode === 'working') {
      window.electronAPI.setIgnoreMouse(true)
    }
  })

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.color-picker-wrap')) colorDropdown.classList.add('hidden')
    if (!e.target.closest('.width-picker-wrap')) widthDropdown.classList.add('hidden')
  })
}

// ── Make Element Draggable ──
function makeDraggable(element, handle) {
  let isDragging = false
  let startX, startY, startLeft, startTop

  handle.addEventListener('mousedown', (e) => {
    isDragging = true
    startX = e.clientX
    startY = e.clientY
    const rect = element.getBoundingClientRect()
    startLeft = rect.left
    startTop = rect.top
    e.preventDefault()
  })

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    element.style.position = 'fixed'
    element.style.left = `${startLeft + dx}px`
    element.style.top = `${startTop + dy}px`
    element.style.right = 'auto'
    element.style.transform = 'none'
  })

  document.addEventListener('mouseup', () => {
    isDragging = false
  })
}

// ── Settings ──
let isRecordingHotkey = false
let recordedKeys = []

function showSettings() {
  settingsModal.classList.remove('hidden')
  canvas.isDrawingMode = false

  // Load current settings
  window.electronAPI.getSettings().then(settings => {
    hotkeyInput.value = settings.hotkey || 'CommandOrControl+Shift+D'
    document.getElementById('settings-color').value = settings.defaultColor || '#e03131'
    document.getElementById('settings-width').value = String(settings.defaultWidth || 4)
  })
}

function hideSettings() {
  settingsModal.classList.add('hidden')
  isRecordingHotkey = false
  if (currentMode === 'drawing') {
    canvas.isDrawingMode = currentTool !== 'eraser'
  }
}

document.getElementById('hotkey-record-btn').addEventListener('click', () => {
  isRecordingHotkey = true
  recordedKeys = []
  hotkeyInput.value = 'Press keys...'
  hotkeyInput.focus()
})

document.addEventListener('keydown', (e) => {
  if (!isRecordingHotkey) return
  e.preventDefault()

  const parts = []
  if (e.ctrlKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')

  const key = e.key
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    parts.push(key.length === 1 ? key.toUpperCase() : key)
    hotkeyInput.value = parts.join('+')
    isRecordingHotkey = false
  } else {
    hotkeyInput.value = parts.join('+') + '...'
  }
})

document.getElementById('settings-save').addEventListener('click', async () => {
  const settings = {
    hotkey: hotkeyInput.value.replace('...', ''),
    defaultColor: document.getElementById('settings-color').value,
    defaultWidth: parseInt(document.getElementById('settings-width').value),
  }

  await window.electronAPI.saveSettings(settings)

  // Apply locally
  setColor(settings.defaultColor)
  setWidth(settings.defaultWidth)

  hideSettings()
})

document.getElementById('settings-cancel').addEventListener('click', hideSettings)

// ── Electron API Listeners ──
window.electronAPI.onModeChange((mode) => {
  setMode(mode)
})

window.electronAPI.onScreenInfo((info) => {
  screenW = info.width
  screenH = info.height
  initCanvas()
  bindToolbarEvents()
  setColor(currentColor)
})

window.electronAPI.onSettingsLoaded((settings) => {
  if (settings.defaultColor) setColor(settings.defaultColor)
  if (settings.defaultWidth) setWidth(settings.defaultWidth)
  if (settings.hotkey) hotkeyInput.value = settings.hotkey
})

window.electronAPI.onDeepLink((params) => {
  console.log('[Overlay] Deep link received:', params)

  roomId = params.room
  shareId = params.shareId
  username = params.username || 'Presenter'

  if (params.server && params.token) {
    connectToServer(params.server, params.token)
  }
})

window.electronAPI.onShowSettings(() => {
  showSettings()
})

// ── Fallback: Initialize canvas on window load if no screen info was sent ──
window.addEventListener('load', () => {
  setTimeout(() => {
    if (!canvas) {
      screenW = window.innerWidth
      screenH = window.innerHeight
      initCanvas()
      bindToolbarEvents()
      setColor(currentColor)
    }
  }, 500)
})
