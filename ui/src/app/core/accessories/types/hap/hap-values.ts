/**
 * Typed readers for HAP characteristic values.
 *
 * hap-client gives `service.values` as a loose record: a value can be missing,
 * `null`, or a different type from the one the tile expects. These helpers
 * return a value only when it has the expected type, so callers handle the
 * missing case on purpose instead of passing `undefined` along.
 *
 * The parameters take `unknown` so the helpers work with both the old `any`
 * typing and the stricter `CharacteristicValue` typing of hap-client.
 */

type HapValues = Readonly<Record<string, unknown>> | undefined

/** The value when it is a number, otherwise `undefined` */
export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number'
    ? value
    : undefined
}

/** The value of one characteristic when it is a number, otherwise `undefined` */
export function numberValue(values: HapValues, type: string): number | undefined {
  return asNumber(values?.[type])
}

/** The value of one characteristic when it is a string, otherwise `undefined` */
export function stringValue(values: HapValues, type: string): string | undefined {
  const value = values?.[type]
  return typeof value === 'string'
    ? value
    : undefined
}

/** True when the value is a number in the given list */
export function isOneOf(value: unknown, options: readonly number[]): boolean {
  return typeof value === 'number' && options.includes(value)
}

/** The numbers in a characteristic's valid values list, or an empty list when it has none */
export function numberList(list: readonly unknown[] | undefined): number[] {
  return list?.filter((item): item is number => typeof item === 'number') ?? []
}
