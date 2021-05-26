const express = require('express');
const uuid = require('uuid');
const aws = require('aws-sdk');
const axios = require('axios');

const router = express.Router({ mergeParams: true });

const IS_OFFLINE = process.env.IS_OFFLINE;
const EVENTS_TABLE = process.env.EVENTS_TABLE;
const ACTIVE_USERS_TABLE = process.env.ACTIVE_USERS_TABLE;
const dynamodb = new aws.DynamoDB.DocumentClient();

const isAuthenticated = (req, res, next) => {
  authUser = req.header('cc-authentication-user');
  authToken = req.header('cc-authentication-token');

  if (!(authUser && authToken)) {
    res.status(401).json({ error: 'Unauthorized' });
  } else {
    const params = {
      TableName: ACTIVE_USERS_TABLE,
      Key: {
        username: authUser,
      },
    };

    dynamodb.get(params, (error, data) => {
      if (error) {
        console.log(error);
        res.status(400).json({ error: 'Error' });
      }

      if (data.Item) {
        const { token } = data.Item;

        if (token != authToken) {
          res.status(401).json({ error: 'Unauthorized' });
        } else {
          next();
        }
      } else {
        res.status(401).json({ error: 'Unauthorized' });
      }
    });
  }
};

router.use(isAuthenticated);

router.get('/', (req, res) => {
  res.status(200).json({ message: 'Success' });
});

router.post('/create-event', (req, res) => {
  const { title, description, creator, startTime, endTime } = req.body;

  if (!(title && description && creator && startTime && endTime)) {
    res.status(400).json({ error: 'Bad request' });
  } else {
    const id = uuid.v4();
    const attendees = [];

    const params = {
      TableName: EVENTS_TABLE,
      Item: {
        id: id,
        title: title,
        description: description,
        creator: creator,
        attendees: attendees,
        startTime: startTime,
        endTime: endTime,
      },
    };

    dynamodb.put(params, (error) => {
      if (error) {
        console.log(error);
        res.status(400).json({ error: 'Unable to create event' });
      } else {
        res.status(200).json({
          id,
          title,
          description,
          creator,
          attendees,
          startTime,
          endTime,
        });
      }
    });
  }
});

router.get('/get-event-by-id/:id', (req, res) => {
  const { id } = req.params;

  if (!id) {
    res.status(400).json({ error: 'Bad request' });
  } else {
    const params = {
      TableName: EVENTS_TABLE,
      Key: {
        id: id,
      },
    };

    dynamodb.get(params, (error, data) => {
      if (error) {
        console.log(error);
        res.status(400).json({ error: 'Unable to fetch event' });
      }

      if (data.Item) {
        const {
          id,
          title,
          description,
          creator,
          attendees,
          startTime,
          endTime,
        } = data.Item;
        res.status(200).json({
          id,
          title,
          description,
          creator,
          attendees,
          startTime,
          endTime,
        });
      } else {
        res.status(404).json({ error: 'Event not found' });
      }
    });
  }
});

router.delete('/delete-event-by-id/:id', async (req, res) => {
  const { id } = req.params;

  if (!id) {
    res.status(400).json({ error: 'Bad request' });
  } else {
    const params = {
      TableName: EVENTS_TABLE,
      Key: {
        id: id,
      },
    };

    let baseUrl = IS_OFFLINE
      ? 'http://' + req.get('host')
      : 'https://' + req.get('host') + '/dev';

    const headers = {
      headers: {
        'cc-authentication-user': req.header('cc-authentication-user'),
        'cc-authentication-token': req.header('cc-authentication-token'),
      },
    };

    const event = await axios
      .get(`${baseUrl}/events/get-event-by-id/${id}`, headers)
      .then((result) => {
        console.log(result.data);
        return result.data;
      })
      .catch((error) => {
        console.log(error);
      });

    if (event) {
      dynamodb.delete(params, (error) => {
        if (error) {
          console.log(err);
          res.status(400).json({ error: 'Unable to delete event' });
        } else {
          res.status(200).json({ id });
        }
      });
    } else {
      res.status(404).json({ error: `Event does not exist` });
    }
  }
});

router.put('/update-event', async (req, res) => {
  const { id, title, description, startTime, endTime } = req.body;

  if (!id) {
    res.status(400).json({ error: 'Bad request' });
  } else {
    let baseUrl = IS_OFFLINE
      ? 'http://' + req.get('host')
      : 'https://' + req.get('host') + '/dev';

    const headers = {
      headers: {
        'cc-authentication-user': req.header('cc-authentication-user'),
        'cc-authentication-token': req.header('cc-authentication-token'),
      },
    };

    const event = await axios
      .get(`${baseUrl}/events/get-event-by-id/${id}`, headers)
      .then((result) => {
        console.log(result.data);
        return result.data;
      })
      .catch((error) => {
        console.log(error);
      });

    if (event) {
      const params = {
        TableName: EVENTS_TABLE,
        Key: {
          id: event.id,
        },
        UpdateExpression:
          'set #title = :a, #description = :b, #startTime = :c, #endTime = :d',
        ExpressionAttributeNames: {
          '#title': 'title',
          '#description': 'description',
          '#startTime': 'startTime',
          '#endTime': 'endTime',
        },
        ExpressionAttributeValues: {
          ':a': title || event.title,
          ':b': description || event.description,
          ':c': startTime || event.startTime,
          ':d': endTime || event.endTime,
        },
      };

      dynamodb.update(params, (error) => {
        if (error) {
          console.log(err);
          res.status(400).json({ error: 'Unable to update event' });
        } else {
          res.status(200).json({ id: event.id });
        }
      });
    } else {
      res.status(404).json({ error: `Event does not exist` });
    }
  }
});

router.put('/add-attendees', async (req, res) => {
  const { id, attendees } = req.body;

  if (Array.isArray(attendees) && id) {
    let baseUrl = IS_OFFLINE
      ? 'http://' + req.get('host')
      : 'https://' + req.get('host') + '/dev';

    const headers = {
      headers: {
        'cc-authentication-user': req.header('cc-authentication-user'),
        'cc-authentication-token': req.header('cc-authentication-token'),
      },
    };

    const event = await axios
      .get(`${baseUrl}/events/get-event-by-id/${id}`, headers)
      .then((result) => {
        console.log(result.data);
        return result.data;
      })
      .catch((error) => {
        console.log(error);
      });

    if (event) {
      let updatedAttendees = event.attendees;
      attendees.forEach((attendant) => {
        updatedAttendees.push(attendant);
      });

      const params = {
        TableName: EVENTS_TABLE,
        Key: {
          id: event.id,
        },
        UpdateExpression: 'set #attendees = :a',
        ExpressionAttributeNames: {
          '#attendees': 'attendees',
        },
        ExpressionAttributeValues: {
          ':a': updatedAttendees,
        },
      };
      dynamodb.update(params, (error) => {
        if (error) {
          console.log(err);
          res.status(400).json({ error: 'Unable to update event' });
        } else {
          res.status(200).json({ id: event.id, attendees: updatedAttendees });
        }
      });
    } else {
      res.status(404).json({ error: `Event does not exist` });
    }
  } else {
    res.status(400).json({ error: 'Bad request' });
  }
});

module.exports = router;
