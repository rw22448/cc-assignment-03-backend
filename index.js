const express = require('express');
const cors = require('cors');

require('dotenv').config();

const app = express();

app.use(cors());

const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
