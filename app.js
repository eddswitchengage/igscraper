const express = require('express');
const bodyParser = require('body-parser');
const service = require('./service');
const models = require('./models');

const app = express();
app.use(bodyParser.json());
const port = 3000;

app.get('/', (req, res) => res.send('API Ok'));

app.post('/user', function(req, res) {
    const settings = Object.assign(models.scrape_settings, req.body);
    settings.scrape_type = "USER";
    
    service.scrape(settings).then(data => res.send(data));
});


app.listen(port, () => console.log('Starting igscraper express app\nListening on port 3000\nHappy scraping :) '));