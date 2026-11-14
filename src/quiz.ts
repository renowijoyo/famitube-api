import { v4 as uuidv4 } from 'uuid';
import { QuizQuestion, QuizType } from './types.js';

function shuffleWithCorrectIndex(items: string[], correctValue: string): { options: string[]; correctIndex: number } {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return {
    options: arr,
    correctIndex: arr.indexOf(correctValue)
  };
}

function generateMathQuestion(): QuizQuestion {
  const opIndex = Math.floor(Math.random() * 3);
  let a: number;
  let b: number;
  let answer: number;
  let symbol: string;

  if (opIndex === 0) {
    a = Math.floor(Math.random() * 18) + 2;
    b = Math.floor(Math.random() * 18) + 2;
    answer = a + b;
    symbol = '+';
  } else if (opIndex === 1) {
    a = Math.floor(Math.random() * 20) + 10;
    b = Math.floor(Math.random() * (a - 1)) + 1;
    answer = a - b;
    symbol = '-';
  } else {
    a = Math.floor(Math.random() * 9) + 2;
    b = Math.floor(Math.random() * 9) + 2;
    answer = a * b;
    symbol = '×';
  }

  const distractors = new Set<number>([answer]);
  while (distractors.size < 4) {
    const offset = (Math.floor(Math.random() * 9) - 4) || 5;
    const candidate = Math.max(0, answer + offset);
    distractors.add(candidate);
  }

  const { options, correctIndex } = shuffleWithCorrectIndex(
    Array.from(distractors).map(String),
    String(answer)
  );

  return {
    id: `q-${uuidv4().slice(0, 8)}`,
    type: 'MATH',
    prompt: `What is ${a} ${symbol} ${b}?`,
    options,
    correctIndex
  };
}

const SCIENCE_BANK: Array<{ prompt: string; options: string[]; answer: string }> = [
  { prompt: 'Which planet is known as the Red Planet?', options: ['Mars', 'Venus', 'Jupiter', 'Saturn'], answer: 'Mars' },
  { prompt: 'What gas do plants breathe in to make food?', options: ['Carbon dioxide', 'Oxygen', 'Helium', 'Nitrogen'], answer: 'Carbon dioxide' },
  { prompt: 'How many legs does a spider have?', options: ['8', '6', '10', '4'], answer: '8' },
  { prompt: 'What is the center of our solar system?', options: ['The Sun', 'The Moon', 'Earth', 'Mars'], answer: 'The Sun' },
  { prompt: 'Water freezes into ice at what temperature (°C)?', options: ['0°C', '100°C', '50°C', '-20°C'], answer: '0°C' },
  { prompt: 'Which part of a plant grows underground and absorbs water?', options: ['Roots', 'Leaves', 'Stem', 'Flower'], answer: 'Roots' },
  { prompt: 'What force keeps us on the ground on Earth?', options: ['Gravity', 'Magnetism', 'Friction', 'Wind'], answer: 'Gravity' },
  { prompt: 'Which animal is a mammal that lives in the ocean?', options: ['Dolphin', 'Shark', 'Octopus', 'Salmon'], answer: 'Dolphin' }
];

const ENGLISH_BANK: Array<{ prompt: string; options: string[]; answer: string }> = [
  { prompt: 'Which word is a synonym (same meaning) for "happy"?', options: ['Joyful', 'Angry', 'Sleepy', 'Loud'], answer: 'Joyful' },
  { prompt: 'Which word rhymes with "light"?', options: ['Bright', 'Lamp', 'Dark', 'Sun'], answer: 'Bright' },
  { prompt: 'What is the opposite (antonym) of "ancient"?', options: ['Modern', 'Old', 'Dusty', 'Huge'], answer: 'Modern' },
  { prompt: 'Which sentence has correct spelling?', options: ['The friend was kind.', 'The freind was kind.', 'The friend was kynd.', 'The frend was kind.'], answer: 'The friend was kind.' },
  { prompt: 'Which word is a noun (a person, place, or thing)?', options: ['Library', 'Quickly', 'Jump', 'Blue'], answer: 'Library' },
  { prompt: 'What is the plural of "child"?', options: ['Children', 'Childs', 'Childes', 'Childrens'], answer: 'Children' },
  { prompt: 'Which word is an adjective (describing word)?', options: ['Sparkling', 'Run', 'Desk', 'Under'], answer: 'Sparkling' }
];

const LOGIC_BANK: Array<{ prompt: string; options: string[]; answer: string }> = [
  { prompt: 'What comes next in the pattern: 2, 4, 6, 8, ___?', options: ['10', '9', '12', '11'], answer: '10' },
  { prompt: 'Which one does NOT belong: Apple, Banana, Carrot, Grape?', options: ['Carrot', 'Apple', 'Banana', 'Grape'], answer: 'Carrot' },
  { prompt: 'What comes next in the pattern: 5, 10, 15, 20, ___?', options: ['25', '22', '30', '24'], answer: '25' },
  { prompt: 'If today is Tuesday, what day will it be in 2 days?', options: ['Thursday', 'Wednesday', 'Friday', 'Monday'], answer: 'Thursday' },
  { prompt: 'Which shape has 3 sides and 3 corners?', options: ['Triangle', 'Square', 'Circle', 'Hexagon'], answer: 'Triangle' },
  { prompt: 'What comes next: A, C, E, G, ___?', options: ['I', 'H', 'J', 'K'], answer: 'I' },
  { prompt: 'Mia is taller than Leo. Leo is taller than Sam. Who is shortest?', options: ['Sam', 'Leo', 'Mia', 'Cannot tell'], answer: 'Sam' }
];

function pickFromBank(
  type: 'SCIENCE' | 'ENGLISH' | 'LOGIC',
  bank: Array<{ prompt: string; options: string[]; answer: string }>
): QuizQuestion {
  const item = bank[Math.floor(Math.random() * bank.length)];
  const { options, correctIndex } = shuffleWithCorrectIndex(item.options, item.answer);
  return {
    id: `q-${uuidv4().slice(0, 8)}`,
    type,
    prompt: item.prompt,
    options,
    correctIndex
  };
}

export function generateQuizQuestion(quizType: QuizType): QuizQuestion {
  const types: Array<Exclude<QuizType, 'MIXED'>> = ['MATH', 'SCIENCE', 'ENGLISH', 'LOGIC'];
  const resolved: Exclude<QuizType, 'MIXED'> =
    quizType === 'MIXED' ? types[Math.floor(Math.random() * types.length)] : quizType;

  switch (resolved) {
    case 'SCIENCE':
      return pickFromBank('SCIENCE', SCIENCE_BANK);
    case 'ENGLISH':
      return pickFromBank('ENGLISH', ENGLISH_BANK);
    case 'LOGIC':
      return pickFromBank('LOGIC', LOGIC_BANK);
    case 'MATH':
    default:
      return generateMathQuestion();
  }
}
