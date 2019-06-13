const express = require('express');
const bodyParser = require('body-parser');
const service = require('./service');

const app = express();
app.use(bodyParser.json());
const port = 3000;

app.get('/', (req, res) => res.send('API Ok'));

app.post('/profile', function(req, res) {
    service.scrapeProfile(req).then(data => res.send(data));
});


app.listen(port, () => console.log('Starting igscraper express app\nListening on port 3000\nHappy scraping :) '));