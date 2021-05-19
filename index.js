const serverless = require('serverless-http');
const express = require('express');

const users = require('./users/users.js');

const app = express();

app.use(express.json({ strict: false }));

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.use('/users', users);

module.exports.handler = serverless(app);
