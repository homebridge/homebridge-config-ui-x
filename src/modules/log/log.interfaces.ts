export interface LogTermSize {
  cols: number
  rows: number
  filters?: LogFilterOptions
}

export interface LogFilterOptions {
  plugins?: string[]
  types?: string[] // e.g., ['Matter', 'Homebridge', 'HAP', 'UI']
}
