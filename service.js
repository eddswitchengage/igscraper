const puppeteer = require('puppeteer');
const constants = require('./constants');
const models = require('./models');

const identifiers = constants.identifiers;

exports.scrape = async function(settings){
    const browser = await init_browser();
    let response = models.ig_response;

    try {
        switch(settings.scrape_type){
            case "USER":
                response = await this.scrape_user(browser, response, settings);
        }
    } catch (error) {
        console.log(error);
        response.meta.code = 500;
    }finally{
        browser.close();
    }

    return response;
}

this.scrape_user = async function(browser, response, settings){
    let user = models.user;
    user.username = settings.username;

    const page = await browser.newPage();
    await page.goto(identifiers.baseUrl + user.username);

    await page.waitForSelector(identifiers.profile.fullname);
    
    user.full_name = await eval_text(page, identifiers.profile.fullname);
    user.bio = await eval_text(page, identifiers.profile.bio);
    user.profile_picture = await eval_url(page, identifiers.profile.displayPicture);

    let stat_elements = await page.$$(identifiers.profile.stats);
    if(stat_elements.length >= 3){
        let post_count = stat_elements[0];
        let followers = stat_elements[1];
        let following = stat_elements[2];

        user.post_count = parse_number(await page.evaluate(post_count => post_count.textContent, post_count));
        user.followers = parse_number(await page.evaluate(followers => followers.title, followers));
        user.following = parse_number(await page.evaluate(following => following.textContent, following));
    }

    //Success, set status code to 200 and push the retrieved user to the response
    response.meta.code = 200;
    response.data.push(user);

    return response;
}

this.scrape_posts = async function(browser, response, settings){
    
}

/* Helpers */
async function init_browser(){
    return await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
}

function is_valid_continuation(token){
    if(token && token !== ""){
        if(token.substring(0, identifiers.postUrl.length) == identifiers.postUrl) {
            return true;
        }
    }
    return false;
}

function parse_number(text){
    if(!text || text === "") return 0;

    if(text.includes('k')){
        text = text.replace('k', '');
        return parseFloat(text) * 1000;
    }else if(text.includes('m')){
        text = text.replace('m', '');
        return parseFloat(text) * 1000000;
    }else{
        while(text.includes(',')) text = text.replace(',', '');
        text = text.replace(' likes', '');
        text = text.replace(' like', '');
        return parseFloat(text);   
    }    
}

async function eval_text(page, identifier){
    try {
        const el = await page.$(identifier);
        return await page.evaluate(el => el.textContent, el);
    } catch (error) {
        console.log(error);
    }
}

async function eval_url(page, identifier){
    try{
        const el = await page.$(identifier);
        return await page.evaluate(el => el.src, el);
    }catch(error){
        console.log(error);
    }
}