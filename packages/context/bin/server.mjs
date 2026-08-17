#!/usr/bin/env node
import { startServer } from '../src/server.mjs';

startServer().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
