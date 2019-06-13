const puppeteer = require('puppeteer');
const constants = require('./constants');
const models = require('./models');

const identifiers = constants.identifiers;

exports.scrapeProfile = async function(request){
    if(!request.body.username) return "No username was provided";
    const username = request.body.username;
    console.log("Scraping profile for user: " + username);

    const browser = await initBrowser();
    let profile = models.profile;

    try {        
        const page = await browser.newPage();
        await page.goto(identifiers.baseUrl + username);

        await page.waitForSelector(identifiers.profile.fullname);
        
        profile.fullName = await evalText(page, identifiers.profile.fullname);
        profile.bio = await evalText(page, identifiers.profile.bio);
        profile.displayPicture = await evalUrl(page, identifiers.profile.displayPicture);
        
    } catch (error) {
        return error;
    }finally{
        await browser.close();
    }

    return profile;
}


/* Helpers */
async function initBrowser(){
    return await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
}

async function evalText(page, identifier){
    try {
        const el = await page.$(identifier);
        return await page.evaluate(el => el.textContent, el);
    } catch (error) {
        console.log(error);
    }
}

async function evalUrl(page, identifier){
    try{
        const el = await page.$(identifier);
        return await page.evaluate(el => el.src, el);
    }catch(error){
        console.log(error);
    }
}