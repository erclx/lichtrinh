#!/usr/bin/env bun
import { resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'

import { resolveCheckout } from './checkout'
import { type CliIo, runCli } from './program'
import { runTask } from './task'

const io: CliIo = {
  stdout: (text: string) => process.stdout.write(text),
  stderr: (text: string) => process.stderr.write(text),
  cwd: process.cwd(),
  confirm: async (question) => {
    const prompt = createInterface({
      input: process.stdin,
      output: process.stderr,
    })
    try {
      const answer = await prompt.question(`${question} [y/N] `)
      return /^y(es)?$/i.test(answer.trim())
    } finally {
      prompt.close()
    }
  },
}

try {
  process.exitCode = await runCli(process.argv.slice(2), {
    io,
    // `bun link` keeps the real path here, so this is the linked checkout.
    findCheckout: (cwd) =>
      resolveCheckout(cwd, resolve(import.meta.dirname, '..')),
    runTask: (task) => runTask(task, io.stderr),
  })
} catch (error) {
  // An unexpected failure prints one line rather than a stack trace.
  io.stderr(
    `lichtrinh: ${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exitCode = 1
}
