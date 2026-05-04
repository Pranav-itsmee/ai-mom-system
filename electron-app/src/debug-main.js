const fs = require('fs');
const out = [
  'ELECTRON_RUN_AS_NODE:' + process.env.ELECTRON_RUN_AS_NODE,
  'ELECTRON_NO_ASAR:' + process.env.ELECTRON_NO_ASAR,
  'process.type:' + process.type,
  'versions.electron:' + process.versions.electron,
  'execPath:' + process.execPath.slice(-40),
  'argv:' + JSON.stringify(process.argv.slice(0,3)),
];
fs.writeFileSync('C:/Users/Pranav/Desktop/debug8.txt', out.join('\n'));
setTimeout(() => process.exit(0), 200);
