const fs = require('fs');
const html = fs.readFileSync('desktop/index.html', 'utf8');
const index = html.indexOf('admin-records-body');
console.log('Index in html:', index);
const index2 = html.indexOf('admin-records-approved-body');
console.log('Index of approved in html:', index2);
