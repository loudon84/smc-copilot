/**
 * Rebuild native modules (better-sqlite3, keytar) against the bundled Electron ABI.
 * prebuild-install often ships Node ABI binaries that do not match Electron (ERR_DLOPEN_FAILED).
 */
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const projectRoot = path.join(__dirname, '..')
const pkg = require(path.join(projectRoot, 'package.json'))

const electronSpecifier = pkg.devDependencies?.electron ?? ''
const electronVersion = electronSpecifier.match(/(\d+\.\d+\.\d+)/)?.[1]
if (!electronVersion) {
  console.error('[rebuild-native-deps] Could not parse electron version from package.json devDependencies')
  process.exit(1)
}

const nativeModules = ['better-sqlite3', 'keytar']

console.log(
  `[rebuild-native-deps] Rebuilding ${nativeModules.join(', ')} for Electron ${electronVersion}...`,
)

const result = spawnSync(
  'npx',
  [
    '@electron/rebuild',
    '-v',
    electronVersion,
    '-f',
    '-w',
    nativeModules.join(','),
  ],
  { cwd: projectRoot, stdio: 'inherit', shell: true },
)

if (result.status !== 0) {
  console.error(
    '[rebuild-native-deps] Failed. On Windows, close SMC Copilot / electron-vite if files are locked, then run: pnpm run rebuild:native',
  )
  process.exit(result.status ?? 1)
}

console.log('[rebuild-native-deps] Done.')
