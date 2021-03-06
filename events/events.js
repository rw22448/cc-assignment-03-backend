const express = require('express');
const uuid = require('uuid');
const aws = require('aws-sdk');
const axios = require('axios');

const router = express.Router({ mergeParams: true });

const IS_OFFLINE = process.env.IS_OFFLINE;
const EVENTS_TABLE = process.env.EVENTS_TABLE;
const ACTIVE_USERS_TABLE = process.env.ACTIVE_USERS_TABLE;
const JOIN_EVENTS_TABLE = process.env.JOIN_EVENTS_TABLE;

const dynamodbConfig = IS_OFFLINE
  ? { endpoint: 'http://localhost:8000/', region: 'localhost' }
  : {};

const dynamodb = new aws.DynamoDB.DocumentClient(dynamodbConfig);

const isAuthenticated = async (req, res, next) => {
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
        res.status(500).json({ error: 'Error' });
      } else if (data && data.Item) {
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

router.get('/', async (req, res) => {
  res.status(200).json({ message: 'Success' });
});

router.post('/create-event', (req, res) => {
  const { title, description, creator, startTime, endTime, location } =
    req.body;

  if (!(title && description && creator && startTime && endTime && location)) {
    res.status(400).json({
      error:
        'Bad request, needs title, descritpion, creator, startTime (ISO), endTime (ISO), and location fields',
    });
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
        location: location,
        pastEvent: false,
      },
    };

    dynamodb.put(params, (error) => {
      if (error) {
        console.log(error);
        res.status(500).json({ error: 'Unable to create event' });
      } else {
        res.status(200).json({
          id,
          title,
          description,
          creator,
          attendees,
          numberOfAttendees: attendees.length,
          startTime,
          endTime,
          location,
          pastEvent: false,
        });
      }
    });
  }
});

router.get('/get-event-by-id/:id', async (req, res) => {
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
        res.status(500).json({ error: 'Unable to fetch event' });
      } else if (data && data.Item) {
        const {
          id,
          title,
          description,
          creator,
          attendees,
          startTime,
          endTime,
          location,
          pastEvent,
        } = data.Item;
        res.status(200).json({
          id,
          title,
          description,
          creator,
          attendees,
          numberOfAttendees: attendees.length,
          startTime,
          endTime,
          location,
          pastEvent,
        });
      } else {
        res.status(404).json({ error: 'Event not found' });
      }
    });
  }
});

router.get('/get-events-by-creator/:username', async (req, res) => {
  const { username } = req.params;

  if (!username) {
    res.status(400).json({ error: 'Bad request' });
  } else {
    const params = {
      TableName: EVENTS_TABLE,
      FilterExpression: 'creator = :creator',
      ExpressionAttributeValues: {
        ':creator': username,
      },
    };

    dynamodb.scan(params, (error, data) => {
      if (error) {
        console.log(error);
        res.status(500).json({ error: 'Unable to fetch event' });
      } else if (data && data.Items) {
        res.status(200).json({ events: data.Items });
      } else {
        res.status(404).json({ error: 'No events found' });
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
      const attendees = event.attendees;

      const results = await Promise.all(
        attendees.map(async (attendant) => {
          return await axios
            .post(
              `${baseUrl}/events/remove-event-from-user`,
              {
                username: attendant,
                id: id,
              },
              headers
            )
            .then((result) => {
              return;
            })
            .catch((error) => {
              return null;
            });
        })
      );

      dynamodb.delete(params, (error) => {
        if (error) {
          console.log(err);
          res.status(500).json({ error: 'Unable to delete event' });
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
  const { id, title, description, startTime, endTime, location } = req.body;

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
          'set #title = :a, #description = :b, #startTime = :c, #endTime = :d, #location = :e',
        ExpressionAttributeNames: {
          '#title': 'title',
          '#description': 'description',
          '#startTime': 'startTime',
          '#endTime': 'endTime',
          '#location': 'location',
        },
        ExpressionAttributeValues: {
          ':a': title || event.title,
          ':b': description || event.description,
          ':c': startTime || event.startTime,
          ':d': endTime || event.endTime,
          ':e': location || event.location,
        },
      };

      dynamodb.update(params, (error) => {
        if (error) {
          console.log(err);
          res.status(500).json({ error: 'Unable to update event' });
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

      const results = await Promise.all(
        attendees.map(async (attendant) => {
          return await axios
            .post(
              `${baseUrl}/events/add-event-to-user`,
              {
                username: attendant,
                id: id,
              },
              headers
            )
            .then((result) => {
              if (!updatedAttendees.includes(attendant)) {
                updatedAttendees.push(attendant);
              }

              return attendant;
            })
            .catch((error) => {
              return null;
            });
        })
      );

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
          res.status(500).json({ error: 'Unable to update event' });
        } else {
          res.status(200).json({
            id: event.id,
            attendees: updatedAttendees,
            numberOfAttendees: updatedAttendees.length,
          });
        }
      });
    } else {
      res.status(404).json({ error: `Event does not exist` });
    }
  } else {
    res.status(400).json({ error: 'Bad request' });
  }
});

router.put('/remove-attendees', async (req, res) => {
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

      const results = await Promise.all(
        attendees.map(async (attendant) => {
          return await axios
            .post(
              `${baseUrl}/events/remove-event-from-user`,
              {
                username: attendant,
                id: id,
              },
              headers
            )
            .then((result) => {
              const index = updatedAttendees.indexOf(attendant);

              if (index == -1) {
              } else {
                updatedAttendees.splice(index, 1);
              }

              return attendant;
            })
            .catch((error) => {
              return null;
            });
        })
      );

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
          res.status(500).json({ error: 'Unable to update event' });
        } else {
          res.status(200).json({
            id: event.id,
            attendees: updatedAttendees,
            numberOfAttendees: updatedAttendees.length,
          });
        }
      });
    } else {
      res.status(404).json({ error: `Event does not exist` });
    }
  } else {
    res.status(400).json({ error: 'Bad request' });
  }
});

router.put('/toggle-past-event', async (req, res) => {
  const { id } = req.body;

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
      const updatedPastEvent = !event.pastEvent;
      const params = {
        TableName: EVENTS_TABLE,
        Key: {
          id: event.id,
        },
        UpdateExpression: 'set #pastEvent = :a',
        ExpressionAttributeNames: {
          '#pastEvent': 'pastEvent',
        },
        ExpressionAttributeValues: {
          ':a': updatedPastEvent,
        },
      };

      dynamodb.update(params, (error) => {
        if (error) {
          console.log(err);
          res.status(500).json({ error: 'Unable to update event' });
        } else {
          res.status(200).json({ id: event.id, pastEvent: updatedPastEvent });
        }
      });
    } else {
      res.status(404).json({ error: `Event does not exist` });
    }
  }
});

router.get('/get-events-by-username/:username', async (req, res) => {
  const { username } = req.params;

  if (!username) {
    res.status(400).json({ error: 'Bad request' });
  } else {
    const params = {
      TableName: JOIN_EVENTS_TABLE,
      KeyConditionExpression: '#username = :username',
      ExpressionAttributeNames: {
        '#username': 'username',
      },
      ExpressionAttributeValues: {
        ':username': username,
      },
    };

    dynamodb.query(params, (error, data) => {
      if (error) {
        console.log(error);
        res.status(500).json({ error: 'Unable to fetch user' });
      } else {
        console.log(data);
        if (data && data.Items) {
          res.status(200).json({
            data: data.Items,
          });
        } else {
          res.status(404).json({
            error: 'User not found, user may not currently be attending events',
          });
        }
      }
    });
  }
});

router.post('/add-event-to-user', async (req, res) => {
  const { username, id } = req.body;

  if (!(username && typeof id == 'string')) {
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

    const user = await axios
      .get(`${baseUrl}/users/get-user-by-username/${username}`)
      .then((result) => {
        return result.data;
      })
      .catch((error) => {});

    if (user) {
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
        const joinEventsTableParams = {
          TableName: JOIN_EVENTS_TABLE,
          Item: {
            username: username,
            eventId: id,
          },
        };

        dynamodb.put(joinEventsTableParams, (error) => {
          if (error) {
            console.log(err);
            res.status(500).json({ error: 'Unable to update user' });
          } else {
            res.status(200).json({
              username: username,
              eventId: id,
            });
          }
        });
      } else {
        res.status(404).json({ error: `Event does not exist` });
      }
    } else {
      res.status(404).json({ error: `User does not exist` });
    }
  }
});

router.post('/remove-event-from-user', async (req, res) => {
  const { username, id } = req.body;

  if (!(username && typeof id == 'string')) {
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

    const user = await axios
      .get(`${baseUrl}/events/get-events-by-username/${username}`, headers)
      .then((result) => {
        return result.data;
      })
      .catch((error) => {});

    if (user) {
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
        const joinEventsTableParams = {
          TableName: JOIN_EVENTS_TABLE,
          Key: {
            username: username,
            eventId: id,
          },
        };

        dynamodb.delete(joinEventsTableParams, (error) => {
          if (error) {
            console.log(err);
            res.status(500).json({
              error: 'Unable to delete, user may not be attending event',
            });
          } else {
            res.status(200).json({
              username: username,
              eventId: id,
            });
          }
        });
      } else {
        res.status(404).json({ error: `Event does not exist` });
      }
    } else {
      res.status(404).json({ error: `User does not exist` });
    }
  }
});

module.exports = router;
