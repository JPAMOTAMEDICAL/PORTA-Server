const { existsSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const prismaCliPath = require.resolve('prisma/build/index.js');
const mainPath = path.join(projectRoot, 'dist', 'main.js');

const migrationArgs = ['migrate', 'deploy'];

const migrationResult = spawnSync(process.execPath, [prismaCliPath, ...migrationArgs], {
  cwd: projectRoot,
  stdio: 'inherit',
});

if (migrationResult.error) {
  console.error(migrationResult.error);
  process.exit(1);
}

if (migrationResult.status !== 0) {
  process.exit(migrationResult.status ?? 1);
}

if (!existsSync(mainPath)) {
  console.error(`Compiled entrypoint not found: ${mainPath}`);
  process.exit(1);
}

require(mainPath);
