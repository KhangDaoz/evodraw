import { useState, useCallback } from 'react'

/**
 * Manages screen share UI controls: resolution, FPS, audio toggle.
 * Extracts this state management concern from RoomPage.
 *
 * @param {Object} screenShareHook - The return value of useScreenShare
 * @returns {Object} UI state + handlers for the Toolbar
 */
export default function useScreenShareControls(screenShareHook) {
  const { isSharing, startSharing, stopSharing, changeResolution, changeFrameRate } = screenShareHook

  const [screenResolution, setScreenResolution] = useState('1080p')
  const [screenAudio, setScreenAudio] = useState(false)
  const [screenFps, setScreenFps] = useState(30)

  const handleToggle = useCallback(() => {
    if (isSharing) {
      stopSharing()
    } else {
      startSharing(screenResolution, screenAudio, screenFps)
    }
  }, [isSharing, startSharing, stopSharing, screenResolution, screenAudio, screenFps])

  const handleResolutionChange = useCallback((res) => {
    setScreenResolution(res)
    if (isSharing) changeResolution(res)
  }, [isSharing, changeResolution])

  const handleFpsChange = useCallback((fps) => {
    setScreenFps(fps)
    if (isSharing) changeFrameRate(fps)
  }, [isSharing, changeFrameRate])

  const handleToggleAudio = useCallback(() => {
    setScreenAudio(prev => !prev)
  }, [])

  return {
    screenResolution,
    screenAudio,
    screenFps,
    handleToggle,
    handleResolutionChange,
    handleFpsChange,
    handleToggleAudio,
  }
}
