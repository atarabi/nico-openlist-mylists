'use strict';

const stream = require('stream');
const fs = require('fs');
const co = require('co');
const request = require('request');
const cheerio = require('cheerio');

const LOGIN_URL = 'https://secure.nicovideo.jp/secure/login';
const OPENLIST_URL = 'http://www.nicovideo.jp/openlist';

function promisify(fn, delay) {
  const params = Array.prototype.slice.call(arguments, 2);
  fn = Function.prototype.bind.apply(fn, [null].concat(params));
  return new Promise((resolve, reject) => {
    fn(function (err) {
      if (err) {
        return reject(err);
      }
      const result = Array.prototype.slice.call(arguments, 1);
      setTimeout(() => {
        resolve(result);
      }, delay);
    });
  });
}

function getSm() {
  const sm = process.argv.slice(2)[0];
  if (!sm || !/^(sm|nm|so|ca|nl)\d+$/.test(sm)) {
    throw new Error('Give a movie id (e.g. sm9)');
  }
  return sm;
}

function extractSession(response) {
  let session = null;
  let cookies = response.headers['set-cookie'] || [];
  for (const cookie of cookies) {
    if (cookie.match(/^user_session=user_session/)) {
      session = cookie.slice(0, cookie.indexOf(';') + 1);
    }
  }

  if (!session) {
    throw new Error('Login error.');
  }

  return session;
}

function scrapeMylistLinks(body) {
  const $ = cheerio.load(body);
  const links = $('a');
  const mylists = [];
  links.each((index, elem) => {
    let href = elem.attribs.href;
    if (/^mylist\/\d+$/.test(href)) {
      mylists.push(href);
    }
  });
  return mylists;
}


function* getOpenlistMylists() {
  const config = require('./config.json');
  const sm = getSm();

  const login_result = yield promisify(request.post, 0, {
    url: LOGIN_URL,
    form: {
      mail_tel: config.mail_tel,
      password: config.password,
    }
  });
  const session = extractSession(login_result[0]);

  let mylists = [];
  for (let page = 1; page <= config.max_page; page++) {
    const openlist_result = yield promisify(request.post, config.interval, {
      url: `${OPENLIST_URL}/${sm}?page=${page}`,
      headers: {
        Cookie: session
      },
    });
    const body = openlist_result[1];
    const new_mylists = scrapeMylistLinks(body);
    if (!new_mylists.length) {
      break;
    }
    console.log(`Page ${page}`);
    console.log(new_mylists.join('\n'));
    mylists = mylists.concat(new_mylists);
  }

  yield promisify(fs.writeFile, 0, `${sm}.text`, mylists.join('\n'));
}

function main() {
  co(getOpenlistMylists).catch((err) => {
    console.log(err);
  });
};

main();