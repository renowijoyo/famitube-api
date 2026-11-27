import { StoryBook } from './types.js';
import { STORY_CATALOG_300 } from './story-seed-catalog.js';

const CORE_STORY_BOOKS: StoryBook[] = [
  // ==========================================
  // TODDLER STORIES (Ages 2–4)
  // ==========================================
  {
    id: 'story-tod-en-1',
    title: "Little Bear's Sleepy Moon",
    author: 'FamiTube Storybooks',
    description: 'A gentle bedtime flip-book following Little Bear as he says goodnight to the forest.',
    coverUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&h=400&fit=crop',
    ageRating: 'TODDLER',
    language: 'en',
    category: 'Stories & Reading',
    rewardFamibux: 20,
    isApproved: true,
    createdAt: '2026-01-10T08:00:00.000Z',
    pages: [
      {
        pageNumber: 1,
        text: 'Little Bear sees the bright moon.',
        imageUrl: 'https://images.unsplash.com/photo-1532693322450-2cb5c511067d?w=720&h=440&fit=crop',
        illustrationEmoji: '🐻🌙',
        bgColor: '#1E293B'
      },
      {
        pageNumber: 2,
        text: 'Soft stars twinkle in the sky.',
        imageUrl: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=720&h=440&fit=crop',
        illustrationEmoji: '✨🌟',
        bgColor: '#312E81'
      },
      {
        pageNumber: 3,
        text: 'Owl says hoot hoot goodnight.',
        imageUrl: 'https://images.unsplash.com/photo-1543549790-8b5f4a028cfb?w=720&h=440&fit=crop',
        illustrationEmoji: '🦉🌲',
        bgColor: '#1E3A5F'
      },
      {
        pageNumber: 4,
        text: 'Little Bear curls up to sleep.',
        imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=720&h=440&fit=crop',
        illustrationEmoji: '🐻💤',
        bgColor: '#2E1065'
      }
    ]
  },
  {
    id: 'story-tod-en-2',
    title: 'Splash Goes the Yellow Duck',
    author: 'FamiTube Storybooks',
    description: 'Count and splash along with a happy yellow duck in the sunny pond.',
    coverUrl: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=600&h=400&fit=crop',
    ageRating: 'TODDLER',
    language: 'en',
    category: 'Stories & Reading',
    rewardFamibux: 20,
    isApproved: true,
    createdAt: '2026-01-11T08:00:00.000Z',
    pages: [
      {
        pageNumber: 1,
        text: 'One yellow duck swims today.',
        imageUrl: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=720&h=440&fit=crop',
        illustrationEmoji: '🦆💧',
        bgColor: '#0C4A6E'
      },
      {
        pageNumber: 2,
        text: 'Two green frogs hop and play.',
        imageUrl: 'https://images.unsplash.com/photo-1579380656108-f98e4df8ea62?w=720&h=440&fit=crop',
        illustrationEmoji: '🐸🌿',
        bgColor: '#064E3B'
      },
      {
        pageNumber: 3,
        text: 'Splash splash goes the cool water.',
        imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=720&h=440&fit=crop',
        illustrationEmoji: '💦🌊',
        bgColor: '#155E75'
      },
      {
        pageNumber: 4,
        text: 'Three happy friends wave goodbye.',
        imageUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=720&h=440&fit=crop',
        illustrationEmoji: '🦆🐸👋',
        bgColor: '#1E3A8A'
      }
    ]
  },
  {
    id: 'story-tod-id-1',
    title: 'Kucing Kecil Suka Susu',
    author: 'Cerita FamiTube',
    description: 'Cerita bergambar lembut tentang kucing kecil yang mencari mangkuk susu hangat.',
    coverUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&h=400&fit=crop',
    ageRating: 'TODDLER',
    language: 'id',
    category: 'Stories & Reading',
    rewardFamibux: 20,
    isApproved: true,
    createdAt: '2026-01-12T08:00:00.000Z',
    pages: [
      {
        pageNumber: 1,
        text: 'Ini kucing kecil yang lucu.',
        imageUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=720&h=440&fit=crop',
        illustrationEmoji: '🐱💛',
        bgColor: '#4C1D95'
      },
      {
        pageNumber: 2,
        text: 'Kucing minum susu putih hangat.',
        imageUrl: 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=720&h=440&fit=crop',
        illustrationEmoji: '🥛🐾',
        bgColor: '#1E3A8A'
      },
      {
        pageNumber: 3,
        text: 'Lalu kucing main bola merah.',
        imageUrl: 'https://images.unsplash.com/photo-1526336024174-e58f5cdd8e13?w=720&h=440&fit=crop',
        illustrationEmoji: '🧶🔴',
        bgColor: '#831843'
      },
      {
        pageNumber: 4,
        text: 'Sekarang kucing tidur nyenyak.',
        imageUrl: 'https://images.unsplash.com/photo-1548802673-380ab8ebc7b7?w=720&h=440&fit=crop',
        illustrationEmoji: '🐱💤',
        bgColor: '#312E81'
      }
    ]
  },
  {
    id: 'story-tod-id-2',
    title: 'Pelangi di Taman Kelinci',
    author: 'Cerita FamiTube',
    description: 'Mengenal warna pelangi bersama kelinci putih di taman bunga.',
    coverUrl: 'https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?w=600&h=400&fit=crop',
    ageRating: 'TODDLER',
    language: 'id',
    category: 'Stories & Reading',
    rewardFamibux: 20,
    isApproved: true,
    createdAt: '2026-01-13T08:00:00.000Z',
    pages: [
      {
        pageNumber: 1,
        text: 'Kelinci melompat di taman hijau.',
        imageUrl: 'https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?w=720&h=440&fit=crop',
        illustrationEmoji: '🐰🌱',
        bgColor: '#065F46'
      },
      {
        pageNumber: 2,
        text: 'Hujan turun pelan lalu berhenti.',
        imageUrl: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?w=720&h=440&fit=crop',
        illustrationEmoji: '🌦️💧',
        bgColor: '#0E7490'
      },
      {
        pageNumber: 3,
        text: 'Lihat ada pelangi indah sekali.',
        imageUrl: 'https://images.unsplash.com/photo-1507608616759-54f48f0af0ee?w=720&h=440&fit=crop',
        illustrationEmoji: '🌈✨',
        bgColor: '#4338CA'
      },
      {
        pageNumber: 4,
        text: 'Kelinci tersenyum senang sekali.',
        imageUrl: 'https://images.unsplash.com/photo-1452857297128-d9c29adba80b?w=720&h=440&fit=crop',
        illustrationEmoji: '🐰🌸',
        bgColor: '#701A75'
      }
    ]
  },

  // ==========================================
  // YOUNG KIDS STORIES (Ages 5–8)
  // ==========================================
  {
    id: 'story-yk-en-1',
    title: 'Rocket Pup Visits the Red Planet',
    author: 'FamiTube Storybooks',
    description: 'Read aloud with Astro the puppy as he blasts off to explore Mars!',
    coverUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&h=400&fit=crop',
    ageRating: 'YOUNG_KIDS',
    language: 'en',
    category: 'Stories & Reading',
    rewardFamibux: 30,
    isApproved: true,
    createdAt: '2026-01-14T08:00:00.000Z',
    pages: [
      {
        pageNumber: 1,
        text: 'Astro the puppy put on his shiny silver helmet and climbed into his red rocket.',
        imageUrl: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=720&h=440&fit=crop',
        illustrationEmoji: '🐶🚀',
        bgColor: '#1E1B4B'
      },
      {
        pageNumber: 2,
        text: 'Three, two, one, blast off! The rocket zoomed past fluffy white clouds into space.',
        imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=720&h=440&fit=crop',
        illustrationEmoji: '☁️🛸',
        bgColor: '#0F172A'
      },
      {
        pageNumber: 3,
        text: 'Soon Astro landed softly on the dusty red rocks of Mars and wagged his tail.',
        imageUrl: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?w=720&h=440&fit=crop',
        illustrationEmoji: '🔴🪐',
        bgColor: '#7C2D12'
      },
      {
        pageNumber: 4,
        text: 'He found a friendly little rover robot taking pictures of bright sparkling stones.',
        imageUrl: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=720&h=440&fit=crop',
        illustrationEmoji: '🤖💎',
        bgColor: '#1E3A8A'
      },
      {
        pageNumber: 5,
        text: 'After sharing a snack, Astro flew home safely to tell his family all about Mars.',
        imageUrl: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=720&h=440&fit=crop',
        illustrationEmoji: '🌍🏡',
        bgColor: '#312E81'
      }
    ]
  },
  {
    id: 'story-yk-en-2',
    title: 'Maya and the Singing Treehouse',
    author: 'FamiTube Storybooks',
    description: 'Maya discovers a magical wooden treehouse where every leaf plays a musical note.',
    coverUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=600&h=400&fit=crop',
    ageRating: 'YOUNG_KIDS',
    language: 'en',
    category: 'Stories & Reading',
    rewardFamibux: 30,
    isApproved: true,
    createdAt: '2026-01-15T08:00:00.000Z',
    pages: [
      {
        pageNumber: 1,
        text: 'Maya climbed the wooden ladder to her cozy treehouse behind the garden.',
        imageUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=720&h=440&fit=crop',
        illustrationEmoji: '🌳🪜',
        bgColor: '#064E3B'
      },
      {
        pageNumber: 2,
        text: 'When the warm breeze blew, the golden leaves began to hum a gentle tune.',
        imageUrl: 'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=720&h=440&fit=crop',
        illustrationEmoji: '🍃🎶',
        bgColor: '#14532D'
      },
      {
        pageNumber: 3,
        text: 'Two bluebirds perched on the window sill and whistled along with the song.',
        imageUrl: 'https://images.unsplash.com/photo-1444464666168-49d633b86797?w=720&h=440&fit=crop',
        illustrationEmoji: '🐦🎵',
        bgColor: '#0C4A6E'
      },
      {
        pageNumber: 4,
        text: 'Maya tapped a rhythm on her wooden desk and smiled at the forest orchestra.',
        imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=720&h=440&fit=crop',
        illustrationEmoji: '🥁🌿',
        bgColor: '#3F6212'
      },
      {
        pageNumber: 5,
        text: 'As the sun turned orange, Maya waved to the birds and promised to sing again tomorrow.',
        imageUrl: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=720&h=440&fit=crop',
        illustrationEmoji: '🌅💛',
        bgColor: '#7C2D12'
      }
    ]
  },
  {
    id: 'story-yk-id-1',
    title: 'Petualangan Bima dan Penyu Laut',
    author: 'Cerita FamiTube',
    description: 'Bacakan dengan suara lantang petualangan Bima menolong penyu kecil kembali ke laut biru.',
    coverUrl: 'https://images.unsplash.com/photo-1437622368342-7a3d73a34c8f?w=600&h=400&fit=crop',
    ageRating: 'YOUNG_KIDS',
    language: 'id',
    category: 'Stories & Reading',
    rewardFamibux: 30,
    isApproved: true,
    createdAt: '2026-01-16T08:00:00.000Z',
    pages: [
      {
        pageNumber: 1,
        text: 'Pagi itu Bima berjalan di pantai pasir putih bersama ayahnya yang ramah.',
        imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=720&h=440&fit=crop',
        illustrationEmoji: '🏖️👦',
        bgColor: '#0E7490'
      },
      {
        pageNumber: 2,
        text: 'Mereka melihat seekor penyu kecil yang tersangkut di antara ranting kayu.',
        imageUrl: 'https://images.unsplash.com/photo-1437622368342-7a3d73a34c8f?w=720&h=440&fit=crop',
        illustrationEmoji: '🐢🌿',
        bgColor: '#115E59'
      },
      {
        pageNumber: 3,
        text: 'Dengan hati hati Bima mengangkat ranting itu agar penyu bisa bergerak bebas.',
        imageUrl: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=720&h=440&fit=crop',
        illustrationEmoji: '🤲🌊',
        bgColor: '#1E40AF'
      },
      {
        pageNumber: 4,
        text: 'Penyu kecil berenang gembira menuju ombak biru yang jernih dan tenang.',
        imageUrl: 'https://images.unsplash.com/photo-1582967788606-a171c1080cb0?w=720&h=440&fit=crop',
        illustrationEmoji: '🐢💙',
        bgColor: '#1D4ED8'
      },
      {
        pageNumber: 5,
        text: 'Bima berjanji selalu menjaga kebersihan pantai demi semua hewan laut.',
        imageUrl: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=720&h=440&fit=crop',
        illustrationEmoji: '🌏✨',
        bgColor: '#0F766E'
      }
    ]
  },
  {
    id: 'story-yk-id-2',
    title: 'Kereta Bintang Malam Hari',
    author: 'Cerita FamiTube',
    description: 'Naiklah ke kereta api bercahaya yang melaju melintasi awan malam penuh bintang.',
    coverUrl: 'https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=600&h=400&fit=crop',
    ageRating: 'YOUNG_KIDS',
    language: 'id',
    category: 'Stories & Reading',
    rewardFamibux: 30,
    isApproved: true,
    createdAt: '2026-01-17T08:00:00.000Z',
    pages: [
      {
        pageNumber: 1,
        text: 'Lampu kereta biru menyala terang saat malam tiba di stasiun desa.',
        imageUrl: 'https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=720&h=440&fit=crop',
        illustrationEmoji: '🚂🌙',
        bgColor: '#1E293B'
      },
      {
        pageNumber: 2,
        text: 'Rara duduk di dekat jendela sambil memegang buku gambar kesayangannya.',
        imageUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=720&h=440&fit=crop',
        illustrationEmoji: '👧📖',
        bgColor: '#312E81'
      },
      {
        pageNumber: 3,
        text: 'Kereta melaju melewati bukit hijau dan jembatan panjang di bawah bulan.',
        imageUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=720&h=440&fit=crop',
        illustrationEmoji: '🌉🌕',
        bgColor: '#1E1B4B'
      },
      {
        pageNumber: 4,
        text: 'Kunang kunang menari di luar kaca seperti ribuan bintang kecil.',
        imageUrl: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=720&h=440&fit=crop',
        illustrationEmoji: '✨🪲',
        bgColor: '#3B0764'
      },
      {
        pageNumber: 5,
        text: 'Kereta pun sampai di kota tujuan dengan selamat dan penuh senyuman.',
        imageUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=720&h=440&fit=crop',
        illustrationEmoji: '🏙️😊',
        bgColor: '#0F172A'
      }
    ]
  }
];

export const INITIAL_STORY_BOOKS: StoryBook[] = [...CORE_STORY_BOOKS, ...STORY_CATALOG_300];
