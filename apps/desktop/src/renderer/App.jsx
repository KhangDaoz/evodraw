import { useState, useEffect, useCallback, useRef } from 'react';
import OverlayPage from './pages/OverlayPage';
import { setServerUrl } from './services/api';

export default function App() {
  const [roomInfo, setRoomInfo] = useState(null);
  const [serverUrl, setServerUrlState] = useState('http://localhost:4000');
  const [screenSize, setScreenSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const initDone = useRef(false);

  const applyServerUrl = useCallback((url) => {
    setServerUrlState(url);
    setServerUrl(url);
  }, []);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    // Window starts click-through; only activated when a room is joined via deep link
    window.electronAPI.getSettings().then((settings) => {
      if (settings.serverUrl) applyServerUrl(settings.serverUrl);
    });

    window.electronAPI.onScreenInfo((info) => {
      setScreenSize({ width: info.width, height: info.height });
    });

    window.electronAPI.getPendingDeepLink().then((params) => {
      if (params?.room && params?.token) handleDeepLinkParams(params);
    });

    window.electronAPI.onDeepLink((params) => {
      if (params?.room && params?.token) handleDeepLinkParams(params);
    });
  }, []);

  const handleDeepLinkParams = (params) => {
    if (params.server) applyServerUrl(params.server);
    localStorage.setItem('token', params.token);
    setRoomInfo({
      roomId: params.room,
      username: params.username || 'Presenter',
      shareId: params.shareId || null,
      fromDeepLink: true,
    });
    window.electronAPI.notifyRoomState({ inRoom: true });
    if (params.shareId) {
      window.electronAPI.setMode('drawing');
    }
  };

  const handleLeave = useCallback(() => {
    setRoomInfo(null);
    window.electronAPI.notifyRoomState({ inRoom: false });
    // Return to click-through idle state
    window.electronAPI.setMode('working');
  }, []);

  if (!roomInfo) return null;

  return (
    <OverlayPage
      roomInfo={roomInfo}
      serverUrl={serverUrl}
      screenSize={screenSize}
      onLeave={handleLeave}
    />
  );
}
