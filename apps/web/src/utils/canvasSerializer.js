import * as fabric from 'fabric'

// ── Versioning constants ──
const CUSTOM_PROPS = ['_evoId', '_evoVersion', '_evoNonce', '_evoScreenShare', '_evoShareId', '_evoShareUser', '_evoShareColor']

// Stable unique ID for every Fabric object on this canvas
let _idCounter = 0

function ensureId(obj) {
  if (!obj._evoId) {
    obj._evoId = `${Date.now()}-${++_idCounter}-${Math.random().toString(36).slice(2, 7)}`
  }
  return obj._evoId
}

/** Ensure version metadata exists on a Fabric object */
function ensureVersion(obj) {
  if (typeof obj._evoVersion !== 'number') obj._evoVersion = 0
  if (typeof obj._evoNonce !== 'number') obj._evoNonce = Math.floor(Math.random() * 1073741824)
}

/** Bump version + regenerate nonce (called on every local mutation) */
function bumpVersion(obj) {
  ensureVersion(obj)
  obj._evoVersion += 1
  obj._evoNonce = Math.floor(Math.random() * 1073741824)
}

/**
 * Determine if a remote element should overwrite the local one.
 * LWW: higher version wins. Same version → lower nonce wins (deterministic).
 */
export function shouldAcceptRemote(local, remote) {
  if (!local) return true
  const localV = typeof local._evoVersion === 'number' ? local._evoVersion : 0
  const remoteV = typeof remote._evoVersion === 'number' ? remote._evoVersion : 0
  if (remoteV > localV) return true
  if (remoteV === localV) {
    const localN = typeof local._evoNonce === 'number' ? local._evoNonce : Infinity
    const remoteN = typeof remote._evoNonce === 'number' ? remote._evoNonce : Infinity
    return remoteN < localN
  }
  return false
}

/**
 * Compute a scene version number (sum of all element versions).
 * Used as a dirty-flag for snapshot persistence.
 */
export function getSceneVersion(canvas) {
  if (!canvas) return 0
  return canvas.getObjects().reduce((sum, obj) => {
    return sum + (typeof obj._evoVersion === 'number' ? obj._evoVersion : 0)
  }, 0)
}

// Serialize a single Fabric object → plain JSON payload (with version metadata)
function serializeObject(obj) {
  ensureId(obj)
  ensureVersion(obj)
  const json = obj.toJSON(CUSTOM_PROPS)
  json._evoId = obj._evoId
  json._evoVersion = obj._evoVersion
  json._evoNonce = obj._evoNonce
  return json
}

// Deserialize a plain JSON payload → Fabric object (Fabric v7 Promise API)
async function deserializeObject(json) {
  const [obj] = await fabric.util.enlivenObjects([json])
  if (json._evoId) obj._evoId = json._evoId
  if (typeof json._evoVersion === 'number') obj._evoVersion = json._evoVersion
  if (typeof json._evoNonce === 'number') obj._evoNonce = json._evoNonce
  // Restore screen share metadata
  if (json._evoScreenShare) obj._evoScreenShare = true
  if (json._evoShareId) obj._evoShareId = json._evoShareId
  if (json._evoShareUser) obj._evoShareUser = json._evoShareUser
  if (json._evoShareColor) obj._evoShareColor = json._evoShareColor
  return obj
}

// Find existing object by _evoId
function findById(canvas, evoId) {
  return canvas.getObjects().find((o) => o._evoId === evoId) || null
}

/**
 * Attach Fabric.js event listeners that serialize mutations into
 * operation messages. Returns a detach function.
 *
 * @param {fabric.Canvas} canvas  - The Fabric canvas instance
 * @param {(op: object) => void} onOperation - Called with each serialized op
 * @param {object} state - Shared mutable state; checked for `_applying` flag
 * @returns {() => void} detach - Call to remove all listeners
 */
export function attachSerializer(canvas, onOperation, state) {
  const onAdded = ({ target }) => {
    if (state._applying) return
    if (target._evoDrawing) return // skip in-progress shape drawing
    bumpVersion(target)
    onOperation({
      type: 'object:added',
      object: serializeObject(target),
    })
  }

  const onModified = ({ target }) => {
    if (state._applying) return
    bumpVersion(target)
    onOperation({
      type: 'object:modified',
      id: ensureId(target),
      object: serializeObject(target),
    })
  }

  const onRemoved = ({ target }) => {
    if (state._applying) return
    if (target._evoDrawing) return // skip temp arrow parts
    onOperation({
      type: 'object:removed',
      id: ensureId(target),
    })
  }

  canvas.on('object:added', onAdded)
  canvas.on('object:modified', onModified)
  canvas.on('object:removed', onRemoved)

  return () => {
    canvas.off('object:added', onAdded)
    canvas.off('object:modified', onModified)
    canvas.off('object:removed', onRemoved)
  }
}

/**
 * Apply a remote operation to the local canvas without re-emitting it.
 * Uses LWW reconciliation: only accepts remote if version is newer.
 */
export async function applyRemoteOp(canvas, op, state) {
  state._applying = true
  try {
    switch (op.type) {
      case 'object:added': {
        const existing = findById(canvas, op.object._evoId)
        if (existing) {
          // Element already exists locally — reconcile
          if (shouldAcceptRemote(existing, op.object)) {
            const { _evoId, type, version, ...props } = op.object
            existing.set(props)
            existing._evoVersion = op.object._evoVersion
            existing._evoNonce = op.object._evoNonce
            existing.setCoords()
          }
          break
        }
        const obj = await deserializeObject(op.object)
        canvas.add(obj)
        break
      }

      case 'object:modified': {
        const target = findById(canvas, op.id)
        if (!target) break
        // LWW reconciliation: only apply if remote is newer
        if (!shouldAcceptRemote(target, op.object)) break
        const { _evoId, type, version, ...props } = op.object
        target.set(props)
        target._evoVersion = op.object._evoVersion
        target._evoNonce = op.object._evoNonce
        target.setCoords()
        break
      }

      case 'object:removed': {
        const target = findById(canvas, op.id)
        if (!target) break
        canvas.remove(target)
        break
      }
    }

    canvas.requestRenderAll()
  } finally {
    state._applying = false
  }
}

/**
 * Serialize the full canvas state (for initial sync / snapshots).
 * Includes version metadata for each element.
 */
export function serializeCanvas(canvas, { includeScreenShares = false } = {}) {
  const objects = canvas.getObjects()
    .filter(obj => includeScreenShares || !obj._evoScreenShare)
    .map(serializeObject)
  return { objects }
}

/**
 * Load a full canvas snapshot (replaces all objects).
 */
export async function loadCanvasSnapshot(canvas, snapshot, state) {
  state._applying = true
  try {
    canvas.clear()
    for (const json of snapshot.objects) {
      const obj = await deserializeObject(json)
      canvas.add(obj)
    }
    canvas.requestRenderAll()
  } finally {
    state._applying = false
  }
}
