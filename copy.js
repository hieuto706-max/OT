const fs = require('fs');

// Android
fs.copyFileSync('mobile/app.js', 'mobile-android/app/src/main/assets/app.js');
fs.copyFileSync('mobile/download.html', 'mobile-android/app/src/main/assets/download.html');
fs.copyFileSync('mobile/index.html', 'mobile-android/app/src/main/assets/index.html');
fs.copyFileSync('mobile/style.css', 'mobile-android/app/src/main/assets/style.css');

// iOS
fs.copyFileSync('mobile/app.js', 'mobile-ios/OTManager/www/app.js');
fs.copyFileSync('mobile/download.html', 'mobile-ios/OTManager/www/download.html');
fs.copyFileSync('mobile/index.html', 'mobile-ios/OTManager/www/index.html');
fs.copyFileSync('mobile/style.css', 'mobile-ios/OTManager/www/style.css');

console.log('Sync completed successfully!');
