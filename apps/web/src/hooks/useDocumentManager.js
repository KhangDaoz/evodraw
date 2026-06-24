import { useCallback } from 'react'
import { getSocket } from '../services/socket'
import {
  exportBoard,
  importBoard,
  serializeCanvas,
  getSceneVersion,
} from '../utils/canvasSerializer'

/**
 * DocumentController hook — quản lý Export/Import bảng trắng.
 *
 * @param {fabric.Canvas} fabricCanvas - Fabric canvas instance
 * @param {React.MutableRefObject} syncState - { _applying: boolean }
 * @param {string} roomId - mã phòng hiện tại
 */
export default function useDocumentManager(fabricCanvas, syncState, roomId) {

  /**
   * Luồng Export (theo sơ đồ tuần tự):
   * SettingsPanel → handleExport → exportBoard (serialize CanvasElement)
   *               → trigger browser download file .json
   */
  const handleExport = useCallback(() => {
    if (!fabricCanvas) return

    const jsonString = exportBoard(fabricCanvas)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `evodraw-${roomId || 'board'}-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [fabricCanvas, roomId])

  /**
   * Luồng Import (theo sơ đồ tuần tự):
   * SettingsPanel → handleImport → đọc file
   *               → importBoard (deserialize CanvasElement → Canvas render)
   *               → emit sync cho các thành viên khác qua Socket.IO
   */
  const handleImport = useCallback((file) => {
    if (!fabricCanvas || !file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const jsonString = e.target.result
        await importBoard(fabricCanvas, jsonString, syncState.current)

        // ── Đồng bộ cho peers sau khi import ──
        const socket = getSocket()
        if (socket && roomId) {
          const { objects } = serializeCanvas(fabricCanvas)
          const sceneVersion = getSceneVersion(fabricCanvas)
          socket.emit('save_snapshot', {
            roomId,
            elements: objects,
            sceneVersion,
          })

          // Emit từng element dưới dạng canvas_op để peers nhận realtime
          for (const obj of objects) {
            socket.emit('canvas_op', {
              roomId,
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
  }, [fabricCanvas, syncState, roomId])

  return { handleExport, handleImport }
}
