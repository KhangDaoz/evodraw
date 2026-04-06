import { useEffect, useRef } from 'react'
import { getSocket } from '../services/socket'
import {
  attachSerializer,
  applyRemoteOp,
  serializeCanvas,
  loadCanvasSnapshot,
} from '../utils/canvasSerializer'

/**
 * Connects a Fabric canvas to the Socket.IO room for
 * real-time operation sync (object:added / modified / removed)
 * and initial state sync for late joiners.
 */
export default function useCanvasSync(canvas, roomId) {
  const syncState = useRef({ _applying: false })

  useEffect(() => {
    if (!canvas || !roomId) return

    const socket = getSocket()
    if (!socket) return

    // ── Outbound: local changes → server ──
    const detach = attachSerializer(canvas, (op) => {
      socket.emit('canvas_op', { roomId, op })
    }, syncState.current)

    // ── Inbound: server → local canvas ──
    const onRemoteOp = async ({ op }) => {
      await applyRemoteOp(canvas, op, syncState.current)
    }

    // ── Initial state sync ──
    // Respond to new joiners requesting current canvas state
    const onStateRequest = ({ requesterId }) => {
      const snapshot = serializeCanvas(canvas)
      socket.emit('canvas_state_response', { requesterId, snapshot })
    }

    // Apply snapshot received from an existing peer
    const onStateInit = async ({ snapshot }) => {
      if (snapshot?.objects?.length > 0) {
        await loadCanvasSnapshot(canvas, snapshot, syncState.current)
      }
    }

    socket.on('canvas_op_received', onRemoteOp)
    socket.on('canvas_state_request', onStateRequest)
    socket.on('canvas_state_init', onStateInit)

    // Request canvas state from existing room members
    socket.emit('canvas_state_request', { roomId })

    return () => {
      detach()
      socket.off('canvas_op_received', onRemoteOp)
      socket.off('canvas_state_request', onStateRequest)
      socket.off('canvas_state_init', onStateInit)
    }
  }, [canvas, roomId])
}
