const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const directory = path.join(__dirname, '..', 'code');
const files = fs.readdirSync(directory).filter(name => name.endsWith('.js')).sort();
for (const name of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(directory, name)], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(result.status || 1); }
}
console.log(`Syntax OK: ${files.length} JavaScript modules`);
