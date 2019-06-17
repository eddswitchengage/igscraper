const express = require('express');
const bodyParser = require('body-parser');
const service = require('./service');
const models = require('./models');
const constants = require('./constants');

const app = express();
app.use(bodyParser.json());
const port = 3000;

app.get('/', (req, res) => res.send('API Ok'));

app.post('/user', function(req, res) {
    if(!req.body.username) res.send('No username provided');    

    const settings = Object.assign(models.scrape_settings, req.body);
    settings.scrape_type = constants.types.user;

    await service.scrape(settings).then(data => res.send(data));
});

app.post('/posts', function(req,res){
    if(!req.body.username) res.send('No username was provided');

    const settings = Object.assign(models.scrape_settings, req.body);
    settings.scrape_type = constants.types.posts;

    await service.scrape(settings).then(data => res.send(data));
});

app.post('/posts/random', function(req, res){
    if(!req.body.username) res.send('No username was provided');

    console.log("Settings: " + JSON.stringify(req.body));

    const settings = Object.assign(models.scrape_settings, req.body);    

    settings.scrape_type = constants.types.posts_random;

    await service.scrape(settings).then(data => res.send(data));
});


app.listen(port, () => console.log('Starting igscraper express app\nListening on port 3000\nHappy scraping :) '));