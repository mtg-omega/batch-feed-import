import { sequelize, Feed, Article } from 'mtg-omega-models/sql';

import { batch } from '../src';

describe('Feed Importer', () => {
  const url1 = 'http://www.gatheringmagic.com/feed/';

  beforeEach(() => sequelize.sync({ force: true }));

  it('should store articles from site1', () => Feed.create({ url: url1 })
    .then(() => batch())
    .then(() => Promise.all([
      Feed.findAll({ include: [{ model: Article }] }),
      Article.findAll(),
    ]))
    .then(([feeds, articles]) => {
      expect(feeds).toHaveLength(1);
      expect(articles).not.toHaveLength(0);

      expect(feeds[0].articles.length).toBe(articles.length);
    })
    .catch((err) => {
      console.error(err);

      throw new Error(err);
    }));
});
