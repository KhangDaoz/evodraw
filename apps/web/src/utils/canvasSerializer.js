import * as fabric from 'fabric'

// Stable unique ID for every Fabric object on this canvas
let _idCounter = 0

function ensureId(obj) {
  if (!obj._evoId) {
    obj._evoId = `${Date.now()}-${++_idCounter}-${Math.random().toString(36).slice(2, 7)}`
  }
  return obj._evoId
}

// Serialize a single Fabric object → plain JSON payload
function serializeObject(obj) {
  const json = obj.toJSON()
  json._evoId = ensureId(obj)
  return json
}

// Deserialize a plain JSON payload → Fabric object (Fabric v7 Promise API)
async function deserializeObject(json) {
  const [obj] = await fabric.util.enlivenObjects([json])
  if (json._evoId) obj._evoId = json._evoId
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
    onOperation({
      type: 'object:added',
      object: serializeObject(target),
    })
  }

  const onModified = ({ target }) => {
    if (state._applying) return
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
 */
export async function applyRemoteOp(canvas, op, state) {
  state._applying = true
  try {
    switch (op.type) {
      case 'object:added': {
        const existing = findById(canvas, op.object._evoId)
        if (existing) break
        const obj = await deserializeObject(op.object)
        canvas.add(obj)
        break
      }

      case 'object:modified': {
        const target = findById(canvas, op.id)
        if (!target) break
        const { _evoId, ...props } = op.object
        target.set(props)
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
 */
export function serializeCanvas(canvas) {
  const objects = canvas.getObjects().map(serializeObject)
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
