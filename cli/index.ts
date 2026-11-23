#!/usr/bin/env bun
import { runCli } from './program'

const io = {
  stdout: (text: string) => process.stdout.write(text),
  stderr: (text: string) => process.stderr.write(text),
  cwd: process.cwd(),
}

try {
  process.exitCode = await runCli(process.argv.slice(2), {
    io,
    findCheckout: () => ({ root: io.cwd, fallback: false }),
    runTask: async () => 0,
  })
} catch (error) {
  // An unexpected failure prints one line rather than a stack trace.
  io.stderr(
    `lichtrinh: ${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exitCode = 1
}
