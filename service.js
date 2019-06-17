const puppeteer = require('puppeteer');
const constants = require('./constants');
const models = require('./models');

const identifiers = constants.identifiers;

exports.scrape = async function (settings) {
    const browser = await init_browser();
    var response = models.ig_response;

    try {
        switch (settings.scrape_type) {
            case constants.types.user:
                response = await this.scrape_user(browser, response, settings); break;
            case constants.types.posts:
                response = await this.scrape_posts(browser, response, settings); break;
            case constants.types.posts_random:
                response = await this.scrape_random_post(browser, response, settings); break;
        }
    } catch (error) {
        console.log(error);
        response.meta.code = 500;
    } finally {
        browser.close();
    }

    return response;
}

this.scrape_user = async function (browser, response, settings) {
    var user = models.user;
    user.username = settings.username;

    const page = await browser.newPage();
    await page.goto(identifiers.baseUrl + user.username);

    await page.waitForSelector(identifiers.profile.fullname);

    user.full_name = await eval_text(page, identifiers.profile.fullname);
    user.bio = await eval_text(page, identifiers.profile.bio);
    user.profile_picture = await eval_url(page, identifiers.profile.displayPicture);

    var stat_elements = await page.$$(identifiers.profile.stats);
    if (stat_elements.length >= 3) {
        user.post_count = await eval_number(page, stat_elements[0], null);
        user.followers = await eval_number(page, stat_elements[1], true);
        user.following = await eval_number(page, stat_elements[2], null);
    }

    //Success, set status code to 200 and push the retrieved user to the response
    response.meta.code = 200;
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

    response.meta.code = 200;
    response.data.push(media);

    return response;
}


this.scrape_posts = async function (browser, response, settings) {
    const page = await browser.newPage();
    await page.goto(identifiers.baseUrl + settings.username);

    var collection = [];
    var post_collection = await this.scrape_post_urls(page, settings.max_posts, settings.continuation_token);

    for (var i = 0; i < post_collection.urls.length; i++) {
        var p = await this.scrape_single_post(browser, settings, post_collection.urls[i])
        if (p) collection.push(p);
    }

    response.meta.code = 200;
    response.continuation_token = post_collection.continuation_token;
    response.data.push(collection);

    return response;
}

this.scrape_single_post = async function (browser, settings, post_url) {
    const page = await browser.newPage();
    await page.goto(post_url);

    var media = models.media;
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

    if (await page.$(identifiers.post.captionRoot)) {
        var element_children = await page.$$(identifiers.post.captionRoot + " span");
        for (var i = 0; i < element_children.length; i++) {
            var element = element_children[i];
            var element_class = await page.evaluate(element => element.className, element);
            //The span that contains the caption is the only child without a class:
            if (!element_class || element_class === "") {
                media.caption = await page.evaluate(element => element.textContent, element);
                media.tags = strip_tags(media.caption);
            }
        }
    }

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

    if (text.includes('#')) {
        var separate = text.split('#');
        separate = separate.slice(1);

        for (var i = 0; i < separate.length; i++) {
            var tag = separate[i].split(' ')[0];
            if (tag && tag !== "") tags.add(tag);
        }
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

async function eval_date(page, identifier, root_element) {
    try {
        let element;

        if (root_element) {
            element = await page.$(root_element + " " + identifier);
        } else {
            element = await page.$(identifier);
        }

        var raw_date = await page.evaluate(element => element.dateTime, element);

        return new Date(raw_date);

    } catch (error) {
        console.log(error);
    }
}

async function eval_number(page, identifier, eval_title) {
    try {
        const element = await page.$(identifier);
        if (eval_title) return parse_number(await page.evaluate(element => element.title, element));
        else return parse_number(await page.evaluate(element => element.textContent, element));
    } catch (error) {
        console.log(error);
    }
}

async function eval_text(page, identifier) {
    try {
        const element = await page.$(identifier);
        return await page.evaluate(element => element.textContent, element);
    } catch (error) {
        console.log(error);
    }
}

async function eval_url(page, identifier) {
    try {
        const element = await page.$(identifier);
        return await page.evaluate(element => element.src, element);
    } catch (error) {
        console.log(error);
    }
}