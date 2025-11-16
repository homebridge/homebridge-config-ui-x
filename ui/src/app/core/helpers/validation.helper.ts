/**
 * Validation helper functions for settings and configuration
 */

/**
 * Validate a HomeKit accessory/bridge name
 * Based on HAP-NodeJS spec: https://github.com/homebridge/HAP-NodeJS/blob/ee41309fd9eac383cdcace39f4f6f6a3d54396f3/src/lib/util/checkName.ts#L12
 * @param name - The name to validate
 * @param maxLength - Maximum allowed length (default: 64 characters)
 * @returns true if valid, false otherwise
 */
export function validateName(name: string, maxLength: number = 64): boolean {
  if (!name) {
    return false
  }

  // Check length
  if (name.length > maxLength) {
    return false
  }

  // Must start and end with letter or number, can contain letters, numbers, spaces, and apostrophes
  return /^[\p{L}\p{N}][\p{L}\p{N} ']*[\p{L}\p{N}]$/u.test(name)
}

/**
 * Validate a port number
 * @param port - The port to validate
 * @param options - Validation options
 * @param options.min - Minimum allowed port (default: 1024)
 * @param options.max - Maximum allowed port (default: 65535)
 * @param options.allowEmpty - Allow empty/undefined values (default: false)
 * @param options.reservedPorts - List of reserved ports that cannot be used (default: [])
 * @param options.conflictPorts - List of ports that would conflict (default: [])
 * @returns true if valid, false otherwise
 */
export function validatePort(
  port: number,
  options: {
    min?: number
    max?: number
    allowEmpty?: boolean
    reservedPorts?: readonly number[]
    conflictPorts?: readonly number[]
  } = {},
): boolean {
  const {
    min = 1024,
    max = 65535,
    allowEmpty = false,
    reservedPorts = [],
    conflictPorts = [],
  } = options

  // Allow empty if specified
  if (allowEmpty && (!port && port !== 0)) {
    return true
  }

  // Check type and integer
  if (typeof port !== 'number' || !Number.isInteger(port)) {
    return false
  }

  // Check range
  if (port < min || port > max) {
    return false
  }

  // Check reserved ports
  if (reservedPorts.includes(port)) {
    return false
  }

  // Check conflicts with other ports
  if (conflictPorts.includes(port)) {
    return false
  }

  return true
}

/**
 * Validate a port range (start and end ports)
 * @param startPort - The start port
 * @param endPort - The end port
 * @param options - Validation options
 * @param options.min - Minimum allowed port (default: 1024)
 * @param options.max - Maximum allowed port (default: 65535)
 * @returns Object with isValid flag and error message if invalid
 */
export function validatePortRange(
  startPort: number,
  endPort: number,
  options: {
    min?: number
    max?: number
  } = {},
): { isValid: boolean, error?: string } {
  const { min = 1024, max = 65535 } = options

  // Validate start port
  if (!validatePort(startPort, { min, max })) {
    return { isValid: false, error: 'Invalid start port' }
  }

  // Validate end port
  if (!validatePort(endPort, { min, max })) {
    return { isValid: false, error: 'Invalid end port' }
  }

  // Ensure end > start
  if (endPort <= startPort) {
    return { isValid: false, error: 'End port must be greater than start port' }
  }

  return { isValid: true }
}

/**
 * Validate a positive integer with optional min/max bounds
 * @param value - The value to validate
 * @param options - Validation options
 * @param options.min - Minimum allowed value (default: 0)
 * @param options.max - Maximum allowed value (default: Number.MAX_SAFE_INTEGER)
 * @param options.allowZero - Allow zero as a valid value (default: true)
 * @param options.allowEmpty - Allow empty/undefined values (default: false)
 * @returns true if valid, false otherwise
 */
export function validatePositiveInteger(
  value: number,
  options: {
    min?: number
    max?: number
    allowZero?: boolean
    allowEmpty?: boolean
  } = {},
): boolean {
  const { min = 0, max = Number.MAX_SAFE_INTEGER, allowZero = true, allowEmpty = false } = options

  // Allow empty if specified
  if (allowEmpty && (!value && value !== 0)) {
    return true
  }

  // Check type
  if (typeof value !== 'number') {
    return false
  }

  // Check integer
  if (!Number.isInteger(value)) {
    return false
  }

  // Check zero
  if (!allowZero && value === 0) {
    return false
  }

  // Check range
  if (value < min || value > max) {
    return false
  }

  return true
}

/**
 * Validate a log file size (in bytes)
 * @param size - The size to validate
 * @param options - Validation options
 * @param options.allowDisabled - Allow -1 to disable logging (default: true)
 * @param options.maxSize - Maximum allowed size in bytes (default: 100MB)
 * @returns true if valid, false otherwise
 */
export function validateLogSize(
  size: number,
  options: {
    allowDisabled?: boolean
    maxSize?: number
  } = {},
): boolean {
  const { allowDisabled = true, maxSize = 100 * 1024 * 1024 } = options // Default max: 100 MB

  // -1 means disabled
  if (allowDisabled && size === -1) {
    return true
  }

  return validatePositiveInteger(size, { min: 0, max: maxSize, allowZero: true })
}

/**
 * Validate terminal buffer size (in lines)
 * @param size - The buffer size to validate
 * @param maxSize - Maximum buffer size (default: 10000 lines)
 * @returns true if valid, false otherwise
 */
export function validateTerminalBufferSize(size: number, maxSize: number = 10000): boolean {
  return validatePositiveInteger(size, { min: 0, max: maxSize, allowZero: true })
}

/**
 * Validate a cron expression
 * @param cron - The cron expression to validate
 * @returns true if valid or empty, false otherwise
 */
export function validateCron(cron: string): boolean {
  // Empty string is valid (no scheduled restart)
  if (!cron || cron.trim() === '') {
    return true
  }

  // Cron expression should have 5 fields: minute hour day month weekday
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) {
    return false
  }

  // Validate each field with its constraints
  const [minute, hour, day, month, weekday] = fields
  const validations = [
    validateCronField(minute, 0, 59),
    validateCronField(hour, 0, 23),
    validateCronField(day, 1, 31),
    validateCronField(month, 1, 12),
    validateCronField(weekday, 0, 7),
  ]

  return validations.every(Boolean)
}

/**
 * Validate a single cron field
 * @param field - The field value (can be *, number, range, step, or list)
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns true if valid, false otherwise
 */
export function validateCronField(field: string, min: number, max: number): boolean {
  // Wildcard is always valid
  if (field === '*') {
    return true
  }

  // Handle step values (e.g., */5, 0-30/5)
  if (field.includes('/')) {
    const [range, step] = field.split('/')
    if (!step.match(/^\d+$/)) {
      return false
    }
    const stepNum = Number.parseInt(step, 10)
    if (stepNum <= 0) {
      return false
    }
    // Validate the range part
    if (range === '*') {
      return true
    }
    field = range // Continue validating the range
  }

  // Handle lists (e.g., 1,2,3)
  if (field.includes(',')) {
    const parts = field.split(',')
    return parts.every(part => validateCronField(part.trim(), min, max))
  }

  // Handle ranges (e.g., 1-5)
  if (field.includes('-')) {
    const [start, end] = field.split('-')
    if (!start.match(/^\d+$/) || !end.match(/^\d+$/)) {
      return false
    }
    const startNum = Number.parseInt(start, 10)
    const endNum = Number.parseInt(end, 10)
    return startNum >= min && startNum <= max && endNum >= min && endNum <= max && startNum <= endNum
  }

  // Handle single number
  if (field.match(/^\d+$/)) {
    const num = Number.parseInt(field, 10)
    return num >= min && num <= max
  }

  return false
}

/**
 * Reserved ports that should not be used
 */
const RESERVED_PORTS = [
  5353, // mDNS
  8080, // Common HTTP alternative
  8443, // Common HTTPS alternative
] as const

/**
 * Get reserved ports that should not be used
 * @returns Array of reserved port numbers
 */
export function getReservedPorts(): readonly number[] {
  return RESERVED_PORTS
}
