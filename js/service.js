const puppeteer = require('puppeteer');
const constants = require('../data/constants');
const models = require('../data/models');
const logger = require('./logger');

const identifiers = constants.identifiers;

exports.scrape = async function (settings) {
    const log = {
        "settings": settings,
        "exception": "",
        "response": undefined
    };

    const browser = await init_browser();
    var response = JSON.parse(JSON.stringify(models.ig_response));

    try {
        switch (settings.scrape_type) {
            case constants.types.user:
                response = await this.scrape_user(browser, response, settings); break;
            case constants.types.posts:
                response = await this.scrape_posts(browser, response, settings); break;
            case constants.types.posts_random:
                response = await this.scrape_random_post(browser, response, settings); break;
            case constants.types.posts_single:
                response.data.push(await this.scrape_single_post(browser, settings, settings.post_url));
                response.meta.code = 200;
                break;
            case constants.types.comments:
                response = await this.scrape_post_comments(browser, response, settings); break;
        }

        response.meta.code = 200;
    } catch (error) {
        log.exception = error;
        console.log(error);
        response.meta.code = 500;
    } finally {
        browser.close();
    }
    log.response = response;
    logger.log_request(log);

    return response;
}

this.scrape_user = async function (browser, response, settings) {
    var user = JSON.parse(JSON.stringify(models.user));
    user.username = settings.username;

    const page = await browser.newPage();
    await page.goto(identifiers.baseUrl + user.username);

    await page.waitForSelector(identifiers.profile.fullname);

    user.full_name = await eval_text(page, identifiers.profile.fullname);
    user.bio = await eval_text(page, identifiers.profile.bio);
    user.profile_picture = await eval_url(page, identifiers.profile.displayPicture);

    user.post_count = await eval_number(page, identifiers.profile.stats, null, 0);
    user.followers = await eval_number(page, identifiers.profile.stats, true, 1);
    user.following = await eval_number(page, identifiers.profile.stats, null, 2);

    //Success, set status code to 200 and push the retrieved user to the response
    response.data.push(user);

    return response;
}

this.get_random_index = (length) => {
    return Math.floor(Math.random() * length);
};

this.scrape_random_post = async function (browser, response, settings) {

    var media = null;

    const page = await browser.newPage();
    await page.goto(identifiers.baseUrl + settings.username);

    var post_collection = await this.scrape_post_urls(page, settings.max_posts, settings.continuation_token);

    var indices_tried = []
    var attempts = 0;

    while (media === null && attempts < 3) {
        var index = this.get_random_index(post_collection.urls.length);
        while (indices_tried.includes(index)) index = this.get_random_index(post_collection.urls.length);
        indices_tried.push(index);

        media = await this.scrape_single_post(browser, settings, post_collection.urls[index]);

        //If none of the retrieved posts were suitable, retrieve the next set
        if (indices_tried.length === post_collection.urls.length) {
            post_collection = await this.scrape_post_urls(page, settings.max_posts, post_collection.continuation_token)
            indices_tried = [];
            attempts += 1;
        }
    }

    response.data.push(media);
    return response;
}


this.scrape_posts = async function (browser, response, settings) {
    const page = await browser.newPage();
    await page.goto(identifiers.baseUrl + settings.username);

    var post_collection = await this.scrape_post_urls(page, settings.max_posts, settings.continuation_token);
    for (var i = 0; i < post_collection.urls.length; i++) {
        var p = await this.scrape_single_post(browser, settings, post_collection.urls[i])
        if (p) response.data.push(p);
    }
    response.continuation_token = post_collection.continuation_token;

    return response;
}

this.scrape_single_post = async function (browser, settings, post_url) {
    const page = await browser.newPage();
    await page.goto(post_url);

    var media = JSON.parse(JSON.stringify(models.media));
    media.link = post_url;

    var video_element = await page.$(identifiers.post.videoControl);
    if (video_element) {
        if (settings.retrieve_video) {
            media.type = "video";
            media.views = await eval_number(page, identifiers.post.views, null);

            var thumb = await eval_url(page, identifiers.post.videoThumb);
            media.images.standard_resolution = { src: thumb, width: 1080, height: 1080 };

        } else {
            return null;
        }
    } else {
        media.type = "image";

        media.likes = await eval_number(page, identifiers.post.likes, null);
        var srcset_element = await page.$(identifiers.post.image);
        var srcset = await page.evaluate(srcset_element => srcset_element.srcset, srcset_element);
        media.images = strip_srcs(srcset);
    }

    media.caption = await eval_text(page, identifiers.post.captionRoot + ' span', null, ':not([class])');
    media.tags = strip_tags(media.caption);
    media.created_time = await eval_date(page, identifiers.post.timestamp, null);

    return media;
}

this.scrape_post_urls = async function (page, max_posts, continuation_token) {
    var retrieve = true;
    var lastmost = null;
    var visible_posts = await page.$$(identifiers.profile.postThumb);

    var urls = [];

    while (retrieve) {
        var reached_continuation = !is_valid_continuation(continuation_token);

        for (var i = 0; i < visible_posts.length; i++) {
            var element = visible_posts[i];
            var url = await page.evaluate(element => element.href, element);

            if (reached_continuation) {
                urls.push(url);
                lastmost = element;
            }

            if (urls.length == max_posts) {
                retrieve = false;
                break;
            }

            if (!reached_continuation && url == continuation_token) reached_continuation = true;
        }

        continuation_token = urls[urls.length - 1];

        if (retrieve) {
            var current_count = visible_posts.length;

            await page.evaluate(() => {
                window.scrollBy(0, 1000);
            });

            visible_posts = await page.$$(identifiers.profile.postThumb);

            if (current_count == visible_posts.length) {
                //If reached the bottom of the page (there are no more images to load) and the most recently retrieved post is the final post
                var last_visible = visible_posts[visible_posts.length - 1];
                var last_visible_url = await page.evaluate(last_visible => last_visible.href, last_visible);

                if (continuation_token == last_visible_url) {
                    continuation_token = "";
                    retrieve = false;
                }
            }
        }
    }

    return { continuation_token, urls };
}

this.scrape_post_comments = async function (browser, response, settings) {
    const page = await browser.newPage();
    await page.goto(settings.post_url);

    var comments = [];

    var parsed = [];
    var has_caption = await try_find_element(page, identifiers.post.captionRoot);
    if (has_caption.success === true) parsed.push(0);

    var retrieve = true;

    while (retrieve) {
        var retd = await page.$$(identifiers.post.comment);
        for (var i = 0; i < retd.length; i++) {
            if (!parsed.includes(i)) {
                var comment = {};

                comment.content = await eval_text(page, identifiers.comment.content, i, ':not([class])');
                var username_index = has_caption.success ? i-1 : i; //If theres a caption, we need to offset the index of the username
                comment.username = await eval_text(page, identifiers.comment.username, username_index);
                comment.profile_picture = await eval_url(page, identifiers.comment.displayPicture, i + 2);
                comment.timestamp = await eval_date(page, identifiers.comment.timestamp, i);

                comments.push(comment);
                parsed.push(i);
            }
            if (comments.length === settings.max_comments) {
                retrieve = false;
                break;
            }
        }

        if (retrieve) {
            var load_more = await try_find_element(page, identifiers.comment.loadMore);
            if (load_more.success === true) {
                await page.click(identifiers.comment.loadMore);
            } else {
                retrieve = false;
            }
        }
    }

    for (var i = 0; i < comments.length; i++) response.data.push(comments[i]);
    return response;
}

/* Helpers */
async function init_browser() {
    return await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
}

function is_valid_continuation(token) {
    if (token && token !== "") {
        if (token.substring(0, identifiers.postUrl.length) == identifiers.postUrl) {
            return true;
        }
    }
    return false;
}

function strip_tags(text) {
    var tags = [];
    if (text === undefined) return tags;

    try {
        if (text.includes('#')) {
            var separate = text.split('#');
            separate = separate.slice(1);

            for (var i = 0; i < separate.length; i++) {
                var tag = separate[i].split(' ')[0];
                if (tag && tag !== "") tags.push(tag);
            }
        }
    } catch (error) {
        //logger.log_exception(error);
    }

    return tags;
}

function strip_srcs(src_set) {
    var srcs = [];
    var separate = src_set.split(',');
    for (var i = 0; i < separate.length; i++) {
        var values = separate[i].split(' ');
        var dim = parseInt(values[1].replace('w', ''));

        srcs.push({
            width: dim,
            height: dim,
            url: values[0]
        });
    }

    return {
        thumbnail: srcs[0],
        low_resolution: srcs[1],
        standard_resolution: srcs[2],
    };
}

function parse_number(text) {
    if (!text || text === "") return 0;

    if (text.includes('k')) {
        text = text.replace('k', '');
        return parseFloat(text) * 1000;
    } else if (text.includes('m')) {
        text = text.replace('m', '');
        return parseFloat(text) * 1000000;
    } else {
        while (text.includes(',')) text = text.replace(',', '');
        text = text.replace(' likes', '');
        text = text.replace(' like', '');
        return parseFloat(text);
    }
}

async function try_find_element(page, identifier) {
    try {
        var element = await page.$(identifier);
        if (element) return { "element": element, "success": true };
    } catch (error) {
        //logger.log_exception(error);
    }

    return { "element": null, "success": false };
}

async function eval_date(page, identifier, index) {
    try {
        let element;

        if (index) {
            var elements = await page.$$(identifier);
            element = elements[index];
        } else {
            element = await page.$(identifier);
        }

        var raw_date = await page.evaluate(element => element.dateTime, element);

        return new Date(raw_date).toUTCString();
    } catch (error) {
        //logger.log_exception(error);
    }

    return new Date();
}

async function eval_number(page, identifier, eval_title, index) {
    try {
        let element;

        if (index) {
            var elements = await page.$$(identifier);
            element = elements[index];
        } else {
            element = await page.$(identifier);
        }

        if (eval_title) return parse_number(await page.evaluate(element => element.title, element));
        else return parse_number(await page.evaluate(element => element.textContent, element));
    } catch (error) {
        //logger.log_exception(error);
    }

    return 0;
}

async function eval_text(page, identifier, index, deselector) {
    try {
        let element;

        if (!deselector) deselector = "";

        if (index) {
            var elements = await page.$$(identifier + deselector);
            element = elements[index];
        } else {
            element = await page.$(identifier + deselector);
        }

        return await page.evaluate(element => element.textContent, element);
    } catch (error) {
        //logger.log_exception(error);
    }

    return "";
}

async function eval_url(page, identifier, index) {
    try {
        let element;

        if (index) {
            var elements = await page.$$(identifier);
            element = elements[index];
        } else {
            element = await page.$(identifier);
        }

        return await page.evaluate(element => element.src, element);
    } catch (error) {
        //logger.log_exception(error);
    }

    return "";
}