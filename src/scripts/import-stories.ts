import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: 'backend/.env' });

import { db } from '../db.js';
import { INITIAL_STORY_BOOKS } from '../story-seed.js';

async function run() {
  console.log(`Starting import of ${INITIAL_STORY_BOOKS.length} storybooks into MySQL...`);
  await db.init();

  const validIds = new Set(INITIAL_STORY_BOOKS.map((b) => b.id));
  const existingBooks = await db.getStoryBooks({ onlyApproved: false, includeAllAges: true });
  let removedCount = 0;
  for (const eb of existingBooks) {
    if (!validIds.has(eb.id)) {
      await db.deleteStoryBook(eb.id);
      removedCount++;
    }
  }
  if (removedCount > 0) {
    console.log(`Removed ${removedCount} stale/unverified stories without source images from MySQL.`);
  }

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
