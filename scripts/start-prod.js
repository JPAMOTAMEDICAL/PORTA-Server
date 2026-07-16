const { existsSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const prismaCliPath = require.resolve('prisma/build/index.js');
const mainPath = path.join(projectRoot, 'dist', 'main.js');

const prismaResult = spawnSync(
  process.execPath,
  [prismaCliPath, 'db', 'push', '--skip-generate'],
  {
    cwd: projectRoot,
    stdio: 'inherit',
  },
);

if (prismaResult.error) {
  console.error(prismaResult.error);
  process.exit(1);
}

if (prismaResult.status !== 0) {
  process.exit(prismaResult.status ?? 1);
}

if (!existsSync(mainPath)) {
  console.error(`Compiled entrypoint not found: ${mainPath}`);
  process.exit(1);
}

require(mainPath);
