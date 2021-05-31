const express = require('express');
const aws = require('aws-sdk');
const axios = require('axios');
const uuid = require('uuid');

const router = express.Router({ mergeParams: true });

const USERS_TABLE = process.env.USERS_TABLE;
const ACTIVE_USERS_TABLE = process.env.ACTIVE_USERS_TABLE;
const IS_OFFLINE = process.env.IS_OFFLINE;
const USER_IMAGES_BUCKET = process.env.USER_IMAGES_BUCKET;

const dynamodb = new aws.DynamoDB.DocumentClient();
const s3 = new aws.S3();

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

        const userImageParams = {
          Bucket: USER_IMAGES_BUCKET,
          Key: username,
        };

        s3.getObject(userImageParams, (error, data) => {
          if (error) {
            res.status(400).json({ error: 'Unable to complete request' });
          } else {
            res
              .status(200)
              .json({
                username,
                image: 'data:image/jpeg;base64,' + data.Body.toString('base64'),
              });
          }
        });
      } else {
        res.status(404).json({ error: 'User not found' });
      }
    });
  }
});

router.post('/create-user', async (req, res) => {
  const { username, password, image } = req.body;

  let QUERY_ERROR = false;

  if (!(typeof username == 'string' && typeof password == 'string')) {
    res
      .status(400)
      .json({ error: 'Username and/or password must be a string' });
  } else if (!image) {
    res.status(400).json({ error: 'Image must be provided' });
  } else {
    const userTableParams = {
      TableName: USERS_TABLE,
      Item: {
        username: username,
        password: password,
      },
    };

    let baseUrl = IS_OFFLINE
      ? 'http://' + req.get('host')
      : 'https://' + req.get('host') + '/dev';

    const user = await axios
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
      const userImageParams = {
        Body: Buffer.from(
          image.replace(/^data:image\/\w+;base64,/, ''),
          'base64'
        ),
        Bucket: USER_IMAGES_BUCKET,
        Key: username,
        ACL: 'public-read',
        ContentEncoding: 'base64',
        ContentType: 'image/jpeg',
      };

      dynamodb.put(userTableParams, (error) => {
        if (error) {
          console.log(error);
          QUERY_ERROR = true;
        }
      });

      s3.upload(userImageParams, (error) => {
        if (error) {
          console.log(error);
          QUERY_ERROR = true;
        }
      });

      if (QUERY_ERROR) {
        res.status(400).json({ error: 'Unable to complete request' });
      } else {
        res.status(200).json({ username });
      }
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

    const user = await axios
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

    const user = await axios
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

router.post('/logout', async (req, res) => {
  const { username } = req.body;

  if (!username) {
    res.status(400).json({ error: 'Bad request' });
  } else {
    const usersParams = {
      TableName: ACTIVE_USERS_TABLE,
      Key: {
        username: username,
      },
    };

    dynamodb.delete(usersParams, (error, data) => {
      if (error) {
        console.log(error);
        res.status(400).json({ error: 'Unable to fetch users' });
      } else {
        res.status(200).json({ username });
      }
    });
  }
});

module.exports = router;
