/**
 * Points a deb822 NodeSource repo file at another Node.js major version.
 * Returns null if the file does not contain a version to change.
 */
export function setNodesourceMajorVersion(sources: string, major: number): string | null {
  if (!/node_\d+\.x/.test(sources)) {
    return null
  }
  return sources.replace(/node_\d+\.x/g, `node_${major}.x`)
}

/**
 * Returns the keyring path named by a deb822 Signed-By field, or null if there
 * is none (the field can also hold a key inline, which has no file to update).
 */
export function getSignedByKeyring(sources: string): string | null {
  return /^Signed-By:[ \t]*(\/\S+)[ \t]*$/im.exec(sources)?.[1] ?? null
}

/**
 * Returns the package name from `dpkg-query -S` output ("package[:arch]: /path").
 */
export function parseDpkgOwner(output: string): string | null {
  return output.trim().split(':')[0].trim() || null
}
