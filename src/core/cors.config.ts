/**
 * Shared CORS configuration for HTTP and WebSocket connections
 * Allows connections from Angular dev server on any hostname (localhost, 127.0.0.1, local IP, etc.)
 */
export const devServerCorsConfig = {
  origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
    // In development, allow any origin on port 4200 or 8080 (Angular dev server)
    // In production, the UI is served from the same origin, so this won't apply
    if (!origin || /^https?:\/\/[^:]+:(?:4200|8080)$/.test(origin)) {
      callback(null, true)
    } else {
      callback(null, false)
    }
  },
  credentials: true,
}
