const fs = require('fs');
fs.copyFileSync('mobile/app.js', 'mobile-android/app/src/main/assets/app.js');
fs.copyFileSync('mobile/download.html', 'mobile-android/app/src/main/assets/download.html');
fs.copyFileSync('mobile/app.js', 'mobile-ios/OTManager/www/app.js');
fs.copyFileSync('mobile/download.html', 'mobile-ios/OTManager/www/download.html');
console.log('Sync completed successfully!');
