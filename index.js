const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');

const users = require('./users/users.js');
const events = require('./events/events.js');

const app = express();

app.use(cors());

app.use(express.json({ strict: false, limit: '2000kb' }));

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.use('/users', users);
app.use('/events', events);

module.exports.handler = serverless(app);
