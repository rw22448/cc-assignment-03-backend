const express = require('express');
const aws = require('aws-sdk');

const router = express.Router({ mergeParams: true });

const USERS_TABLE = process.env.USERS_TABLE;
const dynamodb = new aws.DynamoDB.DocumentClient();

router.get('/get-user-by-username/:username', (req, res) => {
  if (!req.params.username) {
    res.status(400).json({ message: 'Bad request' });
  } else {
    const params = {
      TableName: USERS_TABLE,
      Key: {
        username: req.params.username,
      },
    };

    dynamodb.get(params, (error, data) => {
      if (error) {
        // console.log(error, error.stack);
        res.status(400).json({ message: 'Unable to fetch user' });
      }

      if (data.Item) {
        // console.log(data.Item);
        const { username } = data.Item;
        res.status(200).json({ username });
      } else {
        res.status(404).json({ message: 'User not found' });
      }
    });
  }
});

router.post('/create-user', (req, res) => {
  const { username, password } = req.body;
  if (!(typeof username == 'string' && typeof password == 'string')) {
    res
      .status(400)
      .json({ error: 'Username and/or password must be a string' });
  }

  const params = {
    TableName: USERS_TABLE,
    Item: {
      username: username,
      password: password,
    },
  };

  dynamodb.put(params, (error) => {
    if (error) {
      // console.log(error);
      res.status(400).json({ error: 'Unable to create user' });
    } else {
      res.status(200).json({ username });
    }
  });
});

module.exports = router;
