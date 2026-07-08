// Browser stand-in for the Node "ws" package. It is only reachable through
// @automerge/react's re-export of WebSocketServerAdapter, which is never
// instantiated in the browser; the import just has to resolve to an ES
// module with a default export.
export default globalThis.WebSocket;
