import { sequelize, Feed, Article } from 'mtg-omega-models/sql';

import { batch } from '../src';

describe('Feed Importer', () => {
  beforeEach(() => sequelize.sync({ force: true }));

  [
    'http://www.gatheringmagic.com/feed/',
    'http://magic.tcgplayer.com/rss/rssfeed.xml',
    'http://www.eternalcentral.com/feed/',
    'http://www.mtgsalvation.com/articles.rss',
  ].forEach((url) => {
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
});
