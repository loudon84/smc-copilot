console.log('CWD:', process.cwd());
console.log('argv0:', process.argv0);
console.log('execPath:', process.execPath);
console.log('');

const electron = require('electron');
console.log('typeof electron:', typeof electron);
if (typeof electron === 'object') {
  console.log('electron.app:', typeof electron.app);
  console.log('SUCCESS: electron module loaded');
} else {
  console.log('electron value:', electron);
  console.log('ERROR: electron is not a module');
}

console.log('');
console.log('process.versions.electron:', process.versions.electron);
