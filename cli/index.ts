#!/usr/bin/env bun
import { resolve } from 'node:path'

import { resolveCheckout } from './checkout'
import { runCli } from './program'

const io = {
  stdout: (text: string) => process.stdout.write(text),
  stderr: (text: string) => process.stderr.write(text),
  cwd: process.cwd(),
}

try {
  process.exitCode = await runCli(process.argv.slice(2), {
    io,
    // `bun link` keeps the real path here, so this is the linked checkout.
    findCheckout: (cwd) =>
      resolveCheckout(cwd, resolve(import.meta.dirname, '..')),
    runTask: async () => 0,
  })
} catch (error) {
  // An unexpected failure prints one line rather than a stack trace.
  io.stderr(
    `lichtrinh: ${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exitCode = 1
}
