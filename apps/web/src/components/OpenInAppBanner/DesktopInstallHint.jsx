import { useEffect } from 'react'
import './OpenInAppBanner.css'

const DOWNLOAD_URL = 'https://github.com/KhangDaoz/evodraw/releases/latest'

export default function DesktopInstallHint({ onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 10000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className="open-in-app-banner">
      <span className="banner-message">App chưa mở?</span>
      <a
        className="banner-launch-btn"
        href={DOWNLOAD_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        Tải EvoDraw Desktop
      </a>
      <button className="banner-dismiss-btn" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
