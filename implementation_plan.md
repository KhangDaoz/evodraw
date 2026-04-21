# EvoDraw: WebRTC to LiveKit SFU Migration Plan

Provide a brief description of the problem, any background context, and what the change accomplishes.
Currently, EvoDraw uses a Peer-to-Peer (P2P) Mesh network for Voice Chat and Screen Sharing. This architecture connects every user directly to every other user, resulting in exponential connection growth ($N*(N-1)/2$). This causes severe CPU and bandwidth degradation for rooms larger than 4-5 people.

This plan details the migration to **LiveKit**, a Selective Forwarding Unit (SFU). Instead of connecting to each other, users will broadcast their video/audio once to the LiveKit server, which will route the streams to the other participants. This allows the rooms to scale linearly.

## User Review Required

> [!IMPORTANT]
> **Deployment Decision:** To avoid DevOps overhead, we are planning to use **LiveKit Cloud (Free Tier)** for the media server. Your Node.js server and React frontend will remain exactly where they are hosted today, but we will offload the video routing to LiveKit's infrastructure.
> Please confirm if this is acceptable, or if you prefer to set it up locally with Docker for the implementation phase.

## Proposed Changes

### Backend (Node.js Server)

Summary of what will change in this component: We will remove all manual WebRTC signaling logic and replace it with a simple token generator. 

#### [MODIFY] `apps/server/src/sockets/chat.handler.js`
*   **Remove:** Delete WebRTC socket events (`webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`).
*   **Add:** Implement the `livekit-server-sdk` and create a route or socket event that generates JWT Access Tokens for authenticated users so they can join the LiveKit room.

#### [MODIFY] `apps/server/package.json`
*   **Add:** `livekit-server-sdk` dependency.

---

### Frontend (React Web App)

Summary of what will change in this component: We will delete the custom WebRTC hook logic and implement the LiveKit React SDK components to handle connecting to rooms and rendering streams. 

#### [MODIFY] `apps/web/src/hooks/useVoiceChat.js` / `useScreenShare.js`
*   **Remove:** Rip out `RTCPeerConnection` setups, manual stream management, and signaling logic. 
*   *Note: Depending on the architecture, these hooks might be deleted entirely and replaced by standard LiveKit UI components directly in the View layer.*

#### [MODIFY] Video/Screen UI Components
*   **Add/Modify:** Update the UI rendering layer to use LiveKit's `<LiveKitRoom>`, `<VideoConference>`, and other pre-built React components, applying EvoDraw's styling using CSS overrides or custom renderers if needed.

#### [MODIFY] `apps/web/package.json`
*   **Add:** `livekit-client` and `@livekit/components-react` dependencies.

## Open Questions

> [!WARNING]
> Do you have any custom UI overlays (like drawing over screen shares) that we need to ensure are compatible with the LiveKit `<VideoTrack>` component outputs? 

## Verification Plan

### Test Connections (Local & Cloud)
*   Integrate keys from LiveKit Cloud into the `.env`.
*   Validate that a user can generate a token and enter a room via the frontend.
*   Validate voice transmission (mute/unmute states sync accurately).
*   Validate screen share functionality.

### Stress Test (Scale)
*   Open 6+ incognito windows/browser tabs connecting to the same room to confirm that CPU and network usage remain stable, proving the SFU fan-out is functioning.
