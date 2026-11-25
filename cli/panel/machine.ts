import { accessSync, constants, existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

/** What the panel's verbs read of the machine, handed in so tests fake it. */
export interface PanelMachine {
  home: string
  /** The session's own folder, emptied when the session ends. */
  runtimeDir: string
  /** The WSL distribution this runs in, undefined outside one. */
  distro: string | undefined
  /** Where a tool sits, by its own path. */
  find: (tool: string) => string | undefined
}

export function thisMachine(env: NodeJS.ProcessEnv): PanelMachine {
  const folders = (env.PATH ?? '').split(delimiter)
  return {
    home: homedir(),
    runtimeDir: env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 0}`,
    distro: env.WSL_DISTRO_NAME,
    find: (tool) =>
      folders.map((folder) => join(folder, tool)).find((path) => runs(path)),
  }
}

/** A linked worktree holds a file where a checkout holds its `.git` folder. */
export function isLinkedWorktree(root: string): boolean {
  const git = join(root, '.git')
  return existsSync(git) && statSync(git).isFile()
}

function runs(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
  } catch {
    return false
  }
}
