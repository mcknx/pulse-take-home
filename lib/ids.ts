// Session ids are client-generated UUIDs and act as a bearer secret: whoever
// holds one can poll that user's mailbox and send signals as them. So they are
// validated strictly and NEVER returned to other clients (peers see `pubId`).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSessionId(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}
