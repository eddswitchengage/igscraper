const express = require('express');
const bodyParser = require('body-parser');
<<<<<<< HEAD
const service = require('./service');
const models = require('./models');
const constants = require('./constants');
const cors = require('cors');
=======
const service = require('./js/service');
const models = require('./data/models');
const constants = require('./data/constants');
const logger = require('./js/logger');
>>>>>>> a07b6dc712bd165afa2546e48bf593e9af3ad3b1

const app = express();
app.use(cors());
app.use(bodyParser.json());
const port = 3000;

app.get('/', (req, res) => res.send('API Ok'));

//Retrieve a user's profile
app.post('/user', function (req, res) {
    if (!req.body.username) return res.send('No username provided');

    const settings = Object.assign(models.scrape_settings, req.body);
    settings.scrape_type = constants.types.user;

    service.scrape(settings).then(data => {
        return res.send(data)
    });
});

//Retrieve an amount of posts from a user
app.post('/post/all', function (req, res) {
    if (!req.body.username) return res.send('No username was provided');

    const settings = Object.assign(models.scrape_settings, req.body);
    settings.scrape_type = constants.types.posts;

    service.scrape(settings).then(data => {
        return res.send(data)
    });
});

//Retrieve a single post from the given url
app.post('/post', function (req, res) {
    if (!req.body.post_url) return res.send('No url was provided');

    const settings = Object.assign(models.scrape_settings, req.body);
    settings.scrape_type = constants.types.posts_single;

<<<<<<< HEAD
    service.scrape(settings).then(data => res.send(data));
=======
    service.scrape(settings).then(data => {
        return res.send(data)
    });
>>>>>>> a07b6dc712bd165afa2546e48bf593e9af3ad3b1
});

//Retrieve a random post from a user
app.post('/post/random', function (req, res) {
    if (!req.body.username) return res.send('No username was provided');

    const settings = Object.assign(models.scrape_settings, req.body);
    settings.scrape_type = constants.types.posts_random;

    service.scrape(settings).then(data => {
        return res.send(data)
    });
});

//Retrieve comments from a post
app.post('/post/comments', function (req, res) {
    if (!req.body.post_url) return res.send('No url was provided');

    const settings = Object.assign(models.scrape_settings, req.body);
    settings.scrape_type = constants.types.comments;

    service.scrape(settings).then(data => {
        return res.send(data)
    });
});

//Retrieve logs
app.get('/logs', function (req, res) {
    return res.send(logger.read_logs());
});

app.listen(port, () => console.log('igscraper listening on :3000\nCORS is enabled'));