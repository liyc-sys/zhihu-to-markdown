#!/usr/bin/env node

import { main } from '../skills/zhihu-to-markdown/scripts/export-zhihu-article.mjs';

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
