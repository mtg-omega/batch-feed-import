require('babel-polyfill');

/* eslint-disable import/first */
import request from 'request-promise-native';
import FeedParser from 'feedparser';
import { Feed, Article } from 'mtg-omega-models-sql';
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

export async function batch() {
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

export function handler(event, context, done) {
  return Promise.resolve()
    .then(() => batch())
    .then(() => done())
    .catch((err) => {
      log.error('Error while executing the batch');
      log.info(err);

      done(err);
    });
}
