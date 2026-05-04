// Launcher: truly removes ELECTRON_RUN_AS_NODE before spawning Electron.
// cross-env VAR= only sets it to "", which Electron still treats as truthy.
const { spawnSync } = require('child_process');
const path = require('path');
const electronBin = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const result = spawnSync(electronBin, ['.'], {
  env,
  stdio: 'inherit',
  cwd: __dirname,
});

process.exit(result.status ?? 0);
