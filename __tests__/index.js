import config from 'config';
import { sequelize, Feed, Article } from 'mtg-omega-models-sql';

import { batch, init, check } from '../src';

describe('Feed Importer', () => {
  beforeEach(() => sequelize.sync({ force: true }));

  const feedsToImport = config.get('app.batch-feed-import.feeds');

  feedsToImport.forEach((url) => {
    it(`should store articles from "${url}"`, () => Feed.create({ url })
      .then(() => batch())
      .then(() => Promise.all([
        Feed.findAll({ include: [{ model: Article }] }),
        Article.findAll(),
      ]))
      .then(([feeds, articles]) => {
        expect(feeds).toHaveLength(1);
        expect(articles).not.toHaveLength(0);

        expect(feeds[0].articles.length).toBe(articles.length);
      }));
  });

  it('should initialize the feeds', () => init()
    .then(() => Feed.findAll())
    .then(feeds => expect(feeds).toHaveLength(feedsToImport.length)));

  it('should check and clean unwanted feeds', () => Feed.create({ url: 'http://foo.bar' })
    .then(() => check())
    .then(() => Feed.findAll())
    .then(feeds => expect(feeds).toHaveLength(0)));
});
