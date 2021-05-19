const express = require('express');
const aws = require('aws-sdk');
const axios = require('axios');

const router = express.Router({ mergeParams: true });

const USERS_TABLE = process.env.USERS_TABLE;
const IS_OFFLINE = process.env.IS_OFFLINE;
const dynamodb = new aws.DynamoDB.DocumentClient();

router.get('/get-user-by-username/:username', (req, res) => {
  const { username } = req.params;

  if (!username) {
    res.status(400).json({ error: 'Bad request' });
  }

  const params = {
    TableName: USERS_TABLE,
    Key: {
      username: username,
    },
  };

  dynamodb.get(params, (error, data) => {
    if (error) {
      console.log(error, error.stack);
      res.status(400).json({ error: 'Unable to fetch user' });
    }

    if (data.Item) {
      const { username } = data.Item;
      res.status(200).json({ username });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  });
});

router.post('/create-user', async (req, res) => {
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

  let baseUrl = IS_OFFLINE
    ? 'http://' + req.get('host')
    : 'https://' + req.get('host') + '/dev';

  userExists = await axios
    .get(`${baseUrl}/users/get-user-by-username/${username}`)
    .then((result) => {
      console.log(result.data);
      return result.data;
    })
    .catch((error) => {
      console.log(error);
    });

  if (userExists) {
    res.status(409).json({ error: `User '${username}' already exists` });
  } else {
    dynamodb.put(params, (error) => {
      if (error) {
        console.log(error);
        res.status(400).json({ error: 'Unable to create user' });
      } else {
        res.status(200).json({ username });
      }
    });
  }
});

router.put('/update-user-password', async (req, res) => {
  const { username, password } = req.body;
  if (!(username && password)) {
    res.status(400).json({ error: 'Bad request' });
  }

  const params = {
    TableName: USERS_TABLE,
    Key: {
      username: username,
    },
    UpdateExpression: 'set #password = :a',
    ExpressionAttributeNames: {
      '#password': 'password',
    },
    ExpressionAttributeValues: {
      ':a': password,
    },
  };

  let baseUrl = IS_OFFLINE
    ? 'http://' + req.get('host')
    : 'https://' + req.get('host') + '/dev';

  userExists = await axios
    .get(`${baseUrl}/users/get-user-by-username/${username}`)
    .then((result) => {
      console.log(result.data);
      return result.data;
    })
    .catch((error) => {
      console.log(error);
    });

  if (userExists) {
    dynamodb.update(params, (error) => {
      if (error) {
        console.log(err);
        res.status(400).json({ error: 'Unable to update user' });
      } else {
        res.status(200).json({ username });
      }
    });
  } else {
    res.status(404).json({ error: `User '${username}' does not exist` });
  }
});

router.delete('/delete-user-by-username/:username', async (req, res) => {
  const { username } = req.params;
  if (!username) {
    res.status(400).json({ error: 'Bad request' });
  }

  const params = {
    TableName: USERS_TABLE,
    Key: {
      username: username,
    },
  };

  let baseUrl = IS_OFFLINE
    ? 'http://' + req.get('host')
    : 'https://' + req.get('host') + '/dev';

  userExists = await axios
    .get(`${baseUrl}/users/get-user-by-username/${username}`)
    .then((result) => {
      console.log(result.data);
      return result.data;
    })
    .catch((error) => {
      console.log(error);
    });

  if (userExists) {
    dynamodb.delete(params, (error) => {
      if (error) {
        console.log(err);
        res.status(400).json({ error: 'Unable to delete user' });
      } else {
        res.status(200).json({ username });
      }
    });
  } else {
    res.status(404).json({ error: `User '${username} does not exist` });
  }
});

module.exports = router;
