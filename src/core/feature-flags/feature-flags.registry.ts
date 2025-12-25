/**
 * Feature Flags Registry
 * This file defines all feature flags and their minimum version requirements.
 */

export interface FeatureFlagDefinition {
  /**
   * Unique identifier for the feature flag
   */
  key: string

  /**
   * Human-readable description of the feature
   */
  description: string

  /**
   * Homebridge version semver range required for this feature
   */
  range: string
}

/**
 * Registry of all feature flags
 */
export const FEATURE_FLAGS: FeatureFlagDefinition[] = [
  {
    key: 'childBridgeDebugMode',
    description: 'Enables debug mode configuration for child bridges',
    range: '>=2.0.0-alpha.0',
  },
]
