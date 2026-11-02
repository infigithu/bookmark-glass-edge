const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
execSync('npm run build:base', { stdio: 'inherit' });
fs.copyFileSync(path.join('src','background.js'), path.join('dist','background.js'));
