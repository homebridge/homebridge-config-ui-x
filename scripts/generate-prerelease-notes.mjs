import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'

function argument(name) {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required --${name} argument`)
  }
  return process.argv[index + 1]
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function tags(pattern) {
  const output = git('tag', '--merged', 'HEAD', '--list', pattern, '--sort=-version:refname')
  return output ? output.split('\n') : []
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const version = argument('version')
const releaseType = argument('type')
const outputPath = argument('output')
const prereleaseMarker = `-${releaseType}.`
const markerIndex = version.lastIndexOf(prereleaseMarker)

if (markerIndex === -1) {
  throw new Error(`Version ${version} is not a ${releaseType} prerelease`)
}

const baseVersion = version.slice(0, markerIndex)
const currentTag = `v${version}`
const expectedHeading = new RegExp(`^## v${escapeRegExp(baseVersion)} \\((?:pending|pending release)\\)\\s*$`, 'i')
const changelogLines = readFileSync('CHANGELOG.md', 'utf8').split('\n')
const sectionStart = changelogLines.findIndex(line => expectedHeading.test(line))

if (sectionStart === -1) {
  throw new Error(`CHANGELOG.md must start with a v${baseVersion} pending section before publishing ${currentTag}`)
}

const earlierVersion = changelogLines.slice(0, sectionStart).find(line => line.startsWith('## '))
if (earlierVersion) {
  throw new Error(`The v${baseVersion} pending section must be the first version in CHANGELOG.md`)
}

const nextSectionOffset = changelogLines.slice(sectionStart + 1).findIndex(line => line.startsWith('## '))
const sectionEnd = nextSectionOffset === -1
  ? changelogLines.length
  : sectionStart + 1 + nextSectionOffset
const cumulativeNotes = changelogLines.slice(sectionStart + 1, sectionEnd).join('\n').trim()

if (!cumulativeNotes) {
  throw new Error(`The v${baseVersion} pending changelog section is empty`)
}

const previousPrerelease = tags(`v${baseVersion}-${releaseType}.*`).find(tag => tag !== currentTag)
const previousStable = tags('v[0-9]*.[0-9]*.[0-9]*').find(tag => !tag.includes('-'))
const comparisonTag = previousPrerelease || previousStable
const range = comparisonTag ? `${comparisonTag}..HEAD` : 'HEAD'
const rawCommits = git('log', range, '--format=%h%x09%s')
const repository = process.env.GITHUB_REPOSITORY || 'homebridge/homebridge-config-ui-x'
const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com'
const commitNotes = rawCommits
  ? rawCommits.split('\n').map((line) => {
      const [hash, ...subjectParts] = line.split('\t')
      return `- ${subjectParts.join('\t')} ([\`${hash}\`](${serverUrl}/${repository}/commit/${hash}))`
    }).join('\n')
  : '- No additional commits since the previous test release.'
const releaseLabel = releaseType === 'beta' ? 'beta' : 'alpha'
const comparisonHeading = comparisonTag
  ? `Changes since ${comparisonTag}`
  : 'Changes in this test release'
const comparisonLink = comparisonTag
  ? `\n\n[View the full comparison](${serverUrl}/${repository}/compare/${comparisonTag}...${currentTag})`
  : ''

const notes = `> [!WARNING]
> This is a ${releaseLabel} test release and is not recommended for production systems.

## ${comparisonHeading}

${commitNotes}${comparisonLink}

## Everything included in the v${baseVersion} ${releaseLabel}

${cumulativeNotes}

## Testing

[How To Test Upcoming Changes](${serverUrl}/${repository}/wiki/How-To-Test-Upcoming-Changes)
`

writeFileSync(outputPath, notes)
console.log(`Generated ${outputPath} using ${comparisonTag || 'the complete history'} and the v${baseVersion} pending changelog section.`)
