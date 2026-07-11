import { useCallback } from 'react'
import { getSocket } from '../services/socket'
import {
  exportBoard,
  importBoard,
  serializeCanvas,
  getSceneVersion,
} from '../sync/canvasSerializer'

/**
 * DocumentController hook — manages whiteboard export/import.
 *
 * @param {fabric.Canvas} fabricCanvas - Fabric canvas instance
 * @param {React.MutableRefObject} syncState - { _applying: boolean }
 * @param {string} roomCode - current room code
 */
export default function useDocumentManager(fabricCanvas, syncState, roomCode) {

  /**
   * Export flow:
   * SettingsPanel → handleExport → exportBoard (serialize CanvasElement)
   *               → trigger browser download of the .json file
   */
  const handleExport = useCallback(() => {
    if (!fabricCanvas) return

    const jsonString = exportBoard(fabricCanvas)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `evodraw-${roomCode || 'board'}-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [fabricCanvas, roomCode])

  /**
   * Import flow:
   * SettingsPanel → handleImport → read file
   *               → importBoard (deserialize CanvasElement → Canvas render)
   *               → emit sync to the other members over Socket.IO
   */
  const handleImport = useCallback((file) => {
    if (!fabricCanvas || !file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const jsonString = e.target.result
        await importBoard(fabricCanvas, jsonString, syncState.current)

        // ── Sync to peers after import ──
        const socket = getSocket()
        if (socket && roomCode) {
          const { objects } = serializeCanvas(fabricCanvas)
          const sceneVersion = getSceneVersion(fabricCanvas)
          socket.emit('save_snapshot', {
            roomCode,
            elements: objects,
            sceneVersion,
          })

          // Emit each element as a canvas_op so peers receive it in realtime
          for (const obj of objects) {
            socket.emit('canvas_op', {
              roomCode,
              op: { type: 'object:added', object: obj },
            })
          }
        }
      } catch (err) {
        console.error('[Import] Failed:', err)
        alert('Failed to import: Invalid file format')
      }
    }
    reader.readAsText(file)
  }, [fabricCanvas, syncState, roomCode])

  return { handleExport, handleImport }
}
