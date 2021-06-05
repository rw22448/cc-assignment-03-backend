const express = require('express');
const aws = require('aws-sdk');
const axios = require('axios');
const uuid = require('uuid');

const router = express.Router({ mergeParams: true });

const USERS_TABLE = process.env.USERS_TABLE;
const ACTIVE_USERS_TABLE = process.env.ACTIVE_USERS_TABLE;
const IS_OFFLINE = process.env.IS_OFFLINE;
const USER_IMAGES_BUCKET = process.env.USER_IMAGES_BUCKET;

const dynamodbConfig = IS_OFFLINE
  ? { endpoint: 'http://localhost:8000/', region: 'localhost' }
  : {};

const s3Config = {};

const dynamodb = new aws.DynamoDB.DocumentClient(dynamodbConfig);
const s3 = new aws.S3(s3Config);

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
        res.status(500).json({ error: 'Unable to fetch user' });
      } else if (data && data.Item) {
        res.status(200).json({
          username: username,
          created_events: data.Item.created_events,
          attending_events: data.Item.attending_events,
        });
      } else {
        res.status(404).json({ error: 'User not found' });
      }
    });
  }
});

router.post('/create-user', async (req, res) => {
  const { username, password } = req.body;

  if (!(username && password)) {
    res
      .status(400)
      .json({ error: 'Username and/or password must be provided' });
  } else if (!(typeof username == 'string' && typeof password == 'string')) {
    res
      .status(400)
      .json({ error: 'Username and/or password must be a string' });
  } else {
    const userTableParams = {
      TableName: USERS_TABLE,
      Item: {
        username: username,
        password: password,
        created_events: [],
        attending_events: [],
      },
    };

    let baseUrl = IS_OFFLINE
      ? 'http://' + req.get('host')
      : 'https://' + req.get('host') + '/dev';

    const user = await axios
      .get(`${baseUrl}/users/get-user-by-username/${username}`)
      .then((result) => {
        return result.data;
      })
      .catch((error) => {});

    if (user) {
      res.status(409).json({ error: `User '${username}' already exists` });
    } else {
      dynamodb.put(userTableParams, (error) => {
        if (error) {
          res.status(500).json({ error: 'Unable to complete request' });
        } else {
          res
            .status(200)
            .json({ username, created_events: [], attending_events: [] });
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

    const user = await axios
      .get(`${baseUrl}/users/get-user-by-username/${username}`)
      .then((result) => {
        return result.data;
      })
      .catch((error) => {});

    if (user) {
      dynamodb.update(params, (error) => {
        if (error) {
          console.log(error);
          res.status(500).json({ error: 'Unable to update user' });
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
        return result.data;
      })
      .catch((error) => {});

    if (user) {
      dynamodb.delete(params, (error) => {
        if (error) {
          console.log(error);
          res.status(500).json({ error: 'Unable to delete user' });
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
        res.status(500).json({ error: 'Unable to fetch users' });
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
              res.status(500).json({ error: 'Unable to complete request' });
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
        res.status(500).json({ error: 'Unable to fetch users' });
      } else {
        res.status(200).json({ username });
      }
    });
  }
});

router.get('/images/get-image-by-username/:username', async (req, res) => {
  const { username } = req.params;

  if (!username) {
    res.status(400).json({ error: 'Bad request' });
  } else {
    const userImageParams = {
      Bucket: USER_IMAGES_BUCKET,
      Key: username,
    };

    s3.getObject(userImageParams, (error, data) => {
      if (error) {
        if (error.statusCode == 404) {
          res.status(404).json({ error: 'User image does not exist' });
        } else {
          console.log(error);
          res.status(500).json({
            error: 'Unable to complete request, user image may not exist',
          });
        }
      } else {
        res.status(200).json({
          username,
          image: 'data:image/jpeg;base64,' + data.Body.toString('base64'),
        });
      }
    });
  }
});

router.put('/images/create-image', async (req, res) => {
  const { username, image } = req.body;

  if (!(username && image)) {
    res.status(400).json({ error: 'Bad request' });
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

    s3.upload(userImageParams, (error) => {
      if (error) {
        console.log(error);
        res.status(500).json({ error: 'Unable to complete request' });
      } else {
        res.status(200).json({
          username,
          image,
        });
      }
    });
  }
});

router.put('/add-to-created-events', async (req, res) => {
  const { username, id } = req.body;

  if (!(username && typeof id == 'string')) {
    res.status(400).json({ error: 'Bad request' });
  } else {
    let baseUrl = IS_OFFLINE
      ? 'http://' + req.get('host')
      : 'https://' + req.get('host') + '/dev';

    const user = await axios
      .get(`${baseUrl}/users/get-user-by-username/${username}`)
      .then((result) => {
        return result.data;
      })
      .catch((error) => {});

    if (user) {
      let updatedEventsArray = user.created_events;
      updatedEventsArray.push(id);

      const params = {
        TableName: USERS_TABLE,
        Key: {
          username: username,
        },
        UpdateExpression: 'set #created_events = :a',
        ExpressionAttributeNames: {
          '#created_events': 'created_events',
        },
        ExpressionAttributeValues: {
          ':a': updatedEventsArray,
        },
      };

      dynamodb.update(params, (error) => {
        if (error) {
          console.log(err);
          res.status(500).json({ error: 'Unable to update user' });
        } else {
          res.status(200).json({
            username: user.username,
            created_events: user.created_events,
            attending_events: user.attending_events,
          });
        }
      });
    } else {
      res.status(404).json({ error: `User does not exist` });
    }
  }
});

router.post('/add-to-attending-events', async () => {
  const { username, id } = req.body;

  if (!(username && typeof id == 'string')) {
    res.status(400).json({ error: 'Bad request' });
  } else {
    let baseUrl = IS_OFFLINE
      ? 'http://' + req.get('host')
      : 'https://' + req.get('host') + '/dev';

    const user = await axios
      .get(`${baseUrl}/users/get-user-by-username/${username}`)
      .then((result) => {
        return result.data;
      })
      .catch((error) => {});

    if (user) {
      let updatedEventsArray = user.attending_events;
      updatedEventsArray.push(id);

      const params = {
        TableName: USERS_TABLE,
        Key: {
          username: username,
        },
        UpdateExpression: 'set #attending_events = :a',
        ExpressionAttributeNames: {
          '#attending_events': 'attending_events',
        },
        ExpressionAttributeValues: {
          ':a': updatedEventsArray,
        },
      };

      dynamodb.update(params, (error) => {
        if (error) {
          console.log(err);
          res.status(500).json({ error: 'Unable to update user' });
        } else {
          res.status(200).json({
            username: user.username,
            created_events: user.created_events,
            attending_events: user.attending_events,
          });
        }
      });
    } else {
      res.status(404).json({ error: `User does not exist` });
    }
  }
});

module.exports = router;
