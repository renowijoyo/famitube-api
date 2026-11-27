import { db } from '../db.js';
import { INITIAL_STORY_BOOKS } from '../story-seed.js';

async function run() {
  console.log(`Starting import of ${INITIAL_STORY_BOOKS.length} storybooks into MySQL...`);
  await db.init();
  let count = 0;
  for (const book of INITIAL_STORY_BOOKS) {
    await db.createStoryBook(book).catch(async () => {
      await db.updateStoryBook(book.id, book);
    });
    count++;
    if (count % 50 === 0) {
      console.log(`Imported ${count}/${INITIAL_STORY_BOOKS.length} books...`);
    }
  }
  console.log(`Successfully completed import of ${count} storybooks!`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Failed to import storybooks:', err);
  process.exit(1);
});
