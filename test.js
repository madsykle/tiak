const http = require('http');
fetch('http://localhost:3000/api/queue/history?page=1&limit=2').then(res => res.json()).then(console.log).catch(console.error);
