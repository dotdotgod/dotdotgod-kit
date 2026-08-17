#!/usr/bin/env node
import { startServer } from '@dotdotgod/context/server';

startServer().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
