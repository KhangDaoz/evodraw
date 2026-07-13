import * as fabric from 'fabric'

/**
 * PencilBrush that consumes the full coalesced pointer stream, so fast
 * strokes keep their curvature instead of turning angular. Requires the
 * canvas to be created with `enablePointerEvents: true` — plain MouseEvents
 * have no getCoalescedEvents and fall back to the default behavior.
 */
export default class SmoothPencilBrush extends fabric.PencilBrush {
  onMouseMove(pointer, ev) {
    const e = ev.e
    const coalesced =
      typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : []
    if (coalesced.length > 1) {
      for (const ce of coalesced) {
        // getScenePoint(ce) would return the parent event's cached scene
        // point; _getPointerImpl bypasses that per-event cache
        const p = this.canvas._getPointerImpl(ce)
        super.onMouseMove(p, { e: ce })
      }
    } else {
      super.onMouseMove(pointer, ev)
    }
  }
}
