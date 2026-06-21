const fs = require('fs');
// read token from sqlite
// wait, there's no sqlite. Token is in localStorage in the browser...
// but wait, how to authenticate? I can just use a fake token if enable_auth is false.
