import './OpenInAppBanner.css'

export default function OpenInAppBanner({ onLaunch, onDismiss }) {
  return (
    <div className="open-in-app-banner">
      <span className="banner-message">Screen share active</span>
      <button className="banner-launch-btn" onClick={onLaunch}>
        Open in EvoDraw
      </button>
      <button className="banner-dismiss-btn" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
