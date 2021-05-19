const express = require('express');
// const aws = require('aws-sdk');
// const axios = require('axios');

const router = express.Router({ mergeParams: true });

// const IS_OFFLINE = process.env.IS_OFFLINE;
// const dynamodb = new aws.DynamoDB.DocumentClient();

const isAuthenticated = (req, res, next) => {
  console.log('isAuthenticated called');
  next();
};

router.use(isAuthenticated);

router.get('/', (req, res) => {
  res.status(200).json({ message: 'Success' });
});

module.exports = router;
