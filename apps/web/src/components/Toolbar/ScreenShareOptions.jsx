/**
 * Popup for screen share settings: resolution, frame rate, and system audio.
 * Shown when the user right-clicks or double-clicks the screen share button.
 */
export default function ScreenShareOptions({
  screenResolution,
  onChangeResolution,
  screenFps,
  onChangeFps,
  screenAudio,
  onToggleScreenAudio,
}) {
  return (
    <div className="tool-options animate-fade-in" style={{
      position: 'absolute',
      left: '100%',
      bottom: 0,
      marginLeft: '8px',
      transform: 'none'
    }}>
      {/* Resolution */}
      <div className="option-group">
        <label>Resolution</label>
        <div style={{ display: 'flex', gap: '4px', flexDirection: 'column' }}>
          <button 
            className={`stroke-style-btn ${screenResolution === '720p' ? 'active' : ''}`}
            onClick={() => onChangeResolution && onChangeResolution('720p')}
            style={{ padding: '6px 12px', textAlign: 'left', borderRadius: '4px' }}
          >720p HD</button>
          <button 
            className={`stroke-style-btn ${screenResolution === '1080p' ? 'active' : ''}`}
            onClick={() => onChangeResolution && onChangeResolution('1080p')}
            style={{ padding: '6px 12px', textAlign: 'left', borderRadius: '4px' }}
          >1080p FHD</button>
          <button 
            className={`stroke-style-btn ${screenResolution === '4k' ? 'active' : ''}`}
            onClick={() => onChangeResolution && onChangeResolution('4k')}
            style={{ padding: '6px 12px', textAlign: 'left', borderRadius: '4px' }}
          >4K UHD</button>
        </div>
      </div>

      {/* Frame Rate */}
      {onChangeFps && (
        <div className="option-group" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e0e0e0' }}>
          <label>Frame Rate</label>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button 
              className={`stroke-style-btn ${screenFps === 15 ? 'active' : ''}`}
              onClick={() => onChangeFps(15)}
              style={{ padding: '6px 10px', borderRadius: '4px', flex: 1 }}
            >15</button>
            <button 
              className={`stroke-style-btn ${screenFps === 30 ? 'active' : ''}`}
              onClick={() => onChangeFps(30)}
              style={{ padding: '6px 10px', borderRadius: '4px', flex: 1 }}
            >30</button>
            <button 
              className={`stroke-style-btn ${screenFps === 60 ? 'active' : ''}`}
              onClick={() => onChangeFps(60)}
              style={{ padding: '6px 10px', borderRadius: '4px', flex: 1 }}
            >60</button>
          </div>
        </div>
      )}

      {/* System Audio */}
      {onToggleScreenAudio && (
        <div className="option-group" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e0e0e0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
            <input 
              type="checkbox" 
              checked={screenAudio} 
              onChange={() => onToggleScreenAudio()} 
              style={{ cursor: 'pointer' }}
            />
            Share System Audio
          </label>
        </div>
      )}
    </div>
  )
}
