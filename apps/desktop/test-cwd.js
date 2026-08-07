console.log('CWD:', process.cwd());
console.log('execPath:', process.execPath);
console.log('argv:', process.argv);
console.log('module.paths:', module.paths.slice(0, 5));

const electron = require('electron');
console.log('typeof electron:', typeof electron);
if (typeof electron === 'object') {
  console.log('electron.app:', typeof electron.app);
} else {
  console.log('electron value:', electron);
}
