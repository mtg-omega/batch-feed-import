require('babel-polyfill');

/* eslint-disable import/first */
import request from 'request-promise-native';
import FeedParser from 'feedparser';
import config from 'config';
import { Feed, Article, sequelize } from 'mtg-omega-models-sql';
import { log } from 'zweer-utils';
/* eslint-enable import/first */

function parseRss(rss) {
  const feedparser = new FeedParser();
  const articles = [];

  log.silly(rss);
  log.info('Parsing rss');

  return new Promise((resolve, reject) => {
    feedparser
      .on('error', err => reject(err))
      .on('readable', () => {
        let article;

        while (article = feedparser.read()) { // eslint-disable-line no-cond-assign
          articles.push(article);
        }
      })
      .on('end', () => {
        resolve({
          meta: feedparser.meta,
          articles,
        });
      })
      .end(rss);
  });
}

export async function check() {
  log.info('Check phase begun');

  const feedsToImport = config.get('app.batch-feed-import.feeds');
  const feeds = await Feed.findAll({
    where: {
      url: {
        $notIn: feedsToImport,
      },
    },
  });

  log.info(`Found ${feeds.length} feed[s] to delete`);

  for (let i = 0, tot = feeds.length; i < tot; i += 1) {
    const feed = feeds[i];

    log.info(`Removing feed: ${feed.url}`);

    await feed.destroy();
  }
}

export async function init() {
  log.info('Init phase begun');

  const feedsToImport = config.get('app.batch-feed-import.feeds');

  for (let i = 0, tot = feedsToImport.length; i < tot; i += 1) {
    const url = feedsToImport[i];
    const [feed, isNew] = await Feed.findCreateFind({
      where: {
        url,
      },
    });

    log.info(`Feed ${feed.url} is ${isNew ? 'new' : 'old'}`);
  }
}

export async function batch() {
  log.info('Batch phase begun');

  const feeds = await Feed.findAll();
  const totFeeds = feeds.length;

  log.info(`Found ${totFeeds} feed[s]`);

  for (let i = 0; i < totFeeds; i += 1) {
    const feed = feeds[i];
    const url = feed.url;

    const rss = await request(url);
    const { meta, articles } = await parseRss(rss);
    const totArticles = articles.length;

    log.info(`Working on feed "${feed.title}": ${totArticles} article[s] found`);

    feed.title = meta.title;
    feed.description = meta.description;
    feed.link = meta.link;
    feed.url = meta.xmlurl;
    feed.author = meta.author;
    feed.language = meta.language;
    feed.copyright = meta.copyright;
    feed.generator = meta.generator;
    feed.categories = meta.categories;

    feed.image = meta.image ? meta.image.url : null;
    feed.favicon = meta.favicon ? meta.favicon.url : null;

    feed.mostRecentUpdateAt = new Date(meta.date);
    feed.publishedAt = new Date(meta.pubdate);

    await feed.save();

    for (let j = 0; j < totArticles; j += 1) {
      const article = articles[j];

      const articleCount = await Article.count({ where: { guid: article.guid } });
      if (articleCount === 0) {
        log.info(`Article ${article.title} is new!`);

        await feed.createArticle({
          title: article.title,
          description: article.description,
          summary: article.summary,
          author: article.author,
          guid: article.guid,

          link: article.link,
          originalLink: article.origlink,
          permalink: article.permalink,

          comments: article.comments,

          image: article.image ? article.image.url : null,

          categories: article.categories,

          articleUpdatedAt: new Date(article.date),
          articlePublishedAt: new Date(article.pubdate),
        });
      } else {
        log.info(`Article ${article.title} is already in our database!`);
      }
    }

    log.info(`Finished working on feed "${feed.title}"`);
  }
}

export async function handler(event, context, done) {
  if (typeof done === 'undefined') {
    log.debug('Redefining "done" param');
    done = () => {}; // eslint-disable-line no-param-reassign
  }

  try {
    await sequelize.sync();
    await check();
    await init();
    await batch();

    done();
  } catch (err) {
    log.error('Error while executing the batch');
    log.info(err);

    done(err);
  }
}
