const express = require('express');
const uuid = require('uuid');
const aws = require('aws-sdk');
// const axios = require('axios');

const router = express.Router({ mergeParams: true });

// const IS_OFFLINE = process.env.IS_OFFLINE;
const EVENTS_TABLE = process.env.EVENTS_TABLE;
const dynamodb = new aws.DynamoDB.DocumentClient();

// const isAuthenticated = (req, res, next) => {
//   console.log('isAuthenticated called');
//   next();
// };

// router.use(isAuthenticated);

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
        attendees: {
          SS: attendees,
        },
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

module.exports = router;
