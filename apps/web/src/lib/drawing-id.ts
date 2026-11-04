/** Local model identity only, not a credential. LAN HTTP may lack randomUUID. */
export function drawingStrokeId(): string {
  const suffix =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `stroke-${suffix}`;
}
