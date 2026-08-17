#!/usr/bin/env node
import { hookMain } from '@dotdotgod/context/hooks';
hookMain(process.argv[2] || '');
