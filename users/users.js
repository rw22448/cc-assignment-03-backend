const express = require('express');
const aws = require('aws-sdk');
const axios = require('axios');
const uuid = require('uuid');

const router = express.Router({ mergeParams: true });

const USERS_TABLE = process.env.USERS_TABLE;
const ACTIVE_USERS_TABLE = process.env.ACTIVE_USERS_TABLE;
const IS_OFFLINE = process.env.IS_OFFLINE;
const dynamodb = new aws.DynamoDB.DocumentClient();

router.get('/get-user-by-username/:username', (req, res) => {
  const { username } = req.params;

  if (!username) {
    res.status(400).json({ error: 'Bad request' });
  } else {
    const params = {
      TableName: USERS_TABLE,
      Key: {
        username: username,
      },
    };

    dynamodb.get(params, (error, data) => {
      if (error) {
        console.log(error);
        res.status(400).json({ error: 'Unable to fetch user' });
      }

      if (data.Item) {
        const { username } = data.Item;
        res.status(200).json({ username });
      } else {
        res.status(404).json({ error: 'User not found' });
      }
    });
  }
});

router.post('/create-user', async (req, res) => {
  const { username, password } = req.body;

  if (!(typeof username == 'string' && typeof password == 'string')) {
    res
      .status(400)
      .json({ error: 'Username and/or password must be a string' });
  } else {
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

    user = await axios
      .get(`${baseUrl}/users/get-user-by-username/${username}`)
      .then((result) => {
        console.log(result.data);
        return result.data;
      })
      .catch((error) => {
        console.log(error);
      });

    if (user) {
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
  }
});

router.put('/update-user-password', async (req, res) => {
  const { username, password } = req.body;

  if (!(username && password)) {
    res.status(400).json({ error: 'Bad request' });
  } else {
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

    user = await axios
      .get(`${baseUrl}/users/get-user-by-username/${username}`)
      .then((result) => {
        console.log(result.data);
        return result.data;
      })
      .catch((error) => {
        console.log(error);
      });

    if (user) {
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
  }
});

router.delete('/delete-user-by-username/:username', async (req, res) => {
  const { username } = req.params;

  if (!username) {
    res.status(400).json({ error: 'Bad request' });
  } else {
    const params = {
      TableName: USERS_TABLE,
      Key: {
        username: username,
      },
    };

    let baseUrl = IS_OFFLINE
      ? 'http://' + req.get('host')
      : 'https://' + req.get('host') + '/dev';

    user = await axios
      .get(`${baseUrl}/users/get-user-by-username/${username}`)
      .then((result) => {
        console.log(result.data);
        return result.data;
      })
      .catch((error) => {
        console.log(error);
      });

    if (user) {
      dynamodb.delete(params, (error) => {
        if (error) {
          console.log(err);
          res.status(400).json({ error: 'Unable to delete user' });
        } else {
          res.status(200).json({ username });
        }
      });
    } else {
      res.status(404).json({ error: `User '${username}' does not exist` });
    }
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!(username && password)) {
    res.status(400).json({ error: 'Bad request' });
  } else {
    const token = uuid.v4();

    const usersParams = {
      TableName: USERS_TABLE,
      Key: {
        username: username,
      },
    };

    dynamodb.get(usersParams, (error, data) => {
      if (error) {
        console.log(error);
        res.status(400).json({ error: 'Unable to fetch users' });
      }

      if (data.Item) {
        const { username: userUsername, password: userPassword } = data.Item;

        if (userPassword == req.body.password) {
          const activeUsersParams = {
            TableName: ACTIVE_USERS_TABLE,
            Item: {
              username: userUsername,
              token: token,
            },
          };

          dynamodb.put(activeUsersParams, (error) => {
            if (error) {
              console.log(error);
              res.status(400).json({ error: 'Unable to complete request' });
            } else {
              res.status(200).json({ username, token });
            }
          });
        } else {
          res.status(401).json({ error: 'Incorrect username and/or password' });
        }
      } else {
        res.status(401).json({ error: 'Incorrect username and/or password' });
      }
    });
  }
});

module.exports = router;
