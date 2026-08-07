const { app, BrowserWindow } = require('electron');
console.log('app:', typeof app, 'app.whenReady:', typeof app?.whenReady);
app.whenReady().then(() => {
  console.log('App is ready!');
  app.quit();
});
