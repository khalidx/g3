#!/usr/bin/env node

import { cli } from '../src/index.ts'

cli({ args: process.argv.slice(2) }).catch(error => {
  console.error(error)
  process.exitCode = 1
})
