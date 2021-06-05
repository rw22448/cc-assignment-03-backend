const express = require('express');
const aws = require('aws-sdk');

const router = express.Router({ mergeParams: true });

const IS_OFFLINE = process.env.IS_OFFLINE;
const EVENTS_TABLE = process.env.EVENTS_TABLE;

const dynamodbConfig = IS_OFFLINE
  ? { endpoint: 'http://localhost:8000/', region: 'localhost' }
  : {};

const dynamodb = new aws.DynamoDB.DocumentClient(dynamodbConfig);

router.get('/get-all-events', async (req, res) => {
  const params = {
    TableName: EVENTS_TABLE,
  };

  dynamodb.scan(params, (error, data) => {
    if (error) {
      res.status(500).json({ error: 'Scan could not be completed' });
    } else {
      res.status(200).json({ events: data.Items });
    }
  });
});

module.exports = router;
