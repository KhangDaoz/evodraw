import { useEffect, useRef } from 'react';
import { getSocket } from '../services/socket';
import { attachSerializer, applyRemoteOp, serializeCanvas, loadCanvasSnapshot, getSceneVersion } from '../utils/canvasSerializer';

const SNAPSHOT_INTERVAL_MS = 10_000;
const PEER_FALLBACK_MS = 2000;

export default function useCanvasSync(canvas, syncState, roomId, isConnected) {
  const lastPushedVersionRef = useRef(0);
  const snapshotLoadedRef = useRef(false);

  useEffect(() => {
    if (!canvas || !roomId || !isConnected) return;

    const socket = getSocket();
    if (!socket?.connected) return;

    snapshotLoadedRef.current = false;

    const detach = attachSerializer(canvas, (op) => {
      socket.emit('canvas_op', { roomId, op });
    }, syncState.current);

    const onRemoteOp = async ({ op }) => {
      await applyRemoteOp(canvas, op, syncState.current);
    };

    const onSnapshotLoaded = async ({ elements, sceneVersion }) => {
      if (snapshotLoadedRef.current) return;
      if (elements) {
        snapshotLoadedRef.current = true;
        await loadCanvasSnapshot(canvas, { objects: elements, sceneVersion }, syncState.current);
        lastPushedVersionRef.current = sceneVersion || 0;
      }
    };

    const onStateRequest = ({ requesterId }) => {
      const snapshot = serializeCanvas(canvas);
      socket.emit('canvas_state_response', { requesterId, snapshot });
    };

    const onStateInit = async ({ snapshot }) => {
      if (snapshotLoadedRef.current) return;
      if (snapshot?.objects?.length > 0) {
        snapshotLoadedRef.current = true;
        await loadCanvasSnapshot(canvas, snapshot, syncState.current);
      }
    };

    socket.on('canvas_op_received', onRemoteOp);
    socket.on('snapshot_loaded', onSnapshotLoaded);
    socket.on('canvas_state_request', onStateRequest);
    socket.on('canvas_state_init', onStateInit);

    socket.emit('request_snapshot', { roomId });

    const peerFallback = setTimeout(() => {
      if (!snapshotLoadedRef.current) socket.emit('canvas_state_request', { roomId });
    }, PEER_FALLBACK_MS);

    const pushInterval = setInterval(() => {
      if (!canvas?._evoIsDirty) return;
      const v = getSceneVersion(canvas);
      if (v > 0 && v !== lastPushedVersionRef.current) {
        const { objects } = serializeCanvas(canvas);
        socket.emit('save_snapshot', { roomId, elements: objects, sceneVersion: v });
        lastPushedVersionRef.current = v;
        canvas._evoIsDirty = false;
      }
    }, SNAPSHOT_INTERVAL_MS);

    return () => {
      detach();
      clearTimeout(peerFallback);
      clearInterval(pushInterval);
      socket.off('canvas_op_received', onRemoteOp);
      socket.off('snapshot_loaded', onSnapshotLoaded);
      socket.off('canvas_state_request', onStateRequest);
      socket.off('canvas_state_init', onStateInit);
    };
  }, [canvas, roomId, isConnected]);
}
