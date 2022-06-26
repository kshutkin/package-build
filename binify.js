const fs = require('fs');

let bin = fs.readFileSync('dist/index.js');

bin = '#!/usr/bin/env node\n' + bin;

fs.writeFileSync('dist/index.js', bin);

fs.chmodSync('dist/index.js', 0o755);