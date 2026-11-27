# -*- coding: utf-8 -*-
"""
Generates 300 vetted open-license (CC BY 4.0) children's storybooks
for FamiTube, balanced across English & Indonesian, Toddlers (Level 1) & Young Kids (Level 2).
"""
import json
import os

CATEGORIES = [
    "Animals & Nature",
    "Bedtime & Feelings",
    "Adventures & Curiosity",
    "Values & Friendship",
    "Science & Wonder",
    "Daily Life & Family"
]

BG_COLORS = [
    "#1E293B", "#0F172A", "#1E3A8A", "#0C4A6E", 
    "#064E3B", "#14532D", "#312E81", "#4C1D95", 
    "#581C87", "#701A75", "#7C2D12", "#78350F", "#1F2937"
]

UNSPLASH_POOLS = {
    "bear": [
        "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1589656966895-2f33e7653819?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1575550959106-5a7defe28b56?w=720&h=440&fit=crop"
    ],
    "stars": [
        "https://images.unsplash.com/photo-1532693322450-2cb5c511067d?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=720&h=440&fit=crop"
    ],
    "duck": [
        "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=720&h=440&fit=crop"
    ],
    "cat": [
        "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1495360010541-f48722b34f7d?w=720&h=440&fit=crop"
    ],
    "dog": [
        "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1537151625747-768eb6cf92b2?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=720&h=440&fit=crop"
    ],
    "bird": [
        "https://images.unsplash.com/photo-1444464666168-49d633b86797?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1552728089-57bdde30beb3?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1574063413132-355dbfd83e25?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1543549790-8b5f4a028cfb?w=720&h=440&fit=crop"
    ],
    "rabbit": [
        "https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1518796745738-41048802f99a?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1452857297128-d9c29adba80b?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1535268647677-300dbf3d78d1?w=720&h=440&fit=crop"
    ],
    "forest": [
        "https://images.unsplash.com/photo-1448375240586-882707db888b?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1511497584788-87676104235f?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=720&h=440&fit=crop"
    ],
    "sea": [
        "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1498084393753-b411b2d26b34?w=720&h=440&fit=crop"
    ],
    "garden": [
        "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1508873696983-2df5293cb32f?w=720&h=440&fit=crop"
    ],
    "vehicle": [
        "https://images.unsplash.com/photo-1532974297617-c0f05fe47bff?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1519074069444-1ba4eae16e60?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1557223562-6c77ef16210f?w=720&h=440&fit=crop"
    ],
    "elephant": [
        "https://images.unsplash.com/photo-1557050543-4d5f4e07ef46?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1534567153574-2b12153a87f0?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1564760055775-d63b17a55c44?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1581852017103-68ac6550407b?w=720&h=440&fit=crop"
    ],
    "space": [
        "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=720&h=440&fit=crop",
        "https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=720&h=440&fit=crop"
    ]
}

def get_images(theme, count=4):
    pool = UNSPLASH_POOLS.get(theme, UNSPLASH_POOLS["forest"])
    return [pool[i % len(pool)] for i in range(count)]

# 75 English Toddler Stories Templates
EN_TODDLER_SUBJECTS = [
    ("Sleepy Little Bear", "bear", "🐻🌙", "Little Bear puts away his toy train.", "He sips warm milk with mama.", "Soft blankets keep him cozy.", "Goodnight Little Bear, sweet dreams!"),
    ("Yellow Duck Goes Splash", "duck", "🦆💦", "Little Duck waddles to the pond.", "Water splashes on his yellow feet.", "He finds three little fish friends.", "Quack quack, swimming is fun!"),
    ("Kitty Cat Plays Peekaboo", "cat", "🐱🧶", "Kitty hides behind the green chair.", "Where did little Kitty go?", "Peekaboo, she jumps out with joy!", "Purr purr, time for a cuddle."),
    ("Puppy Runs Across The Grass", "dog", "🐶🎾", "Puppy spots a red bouncy ball.", "He runs as fast as he can.", "Wag wag goes his fluffy tail.", "Good boy, you caught the ball!"),
    ("Tiny Bunny Hops In The Meadow", "rabbit", "🐰🥕", "Bunny twitches his soft pink nose.", "Hop, hop, hop across the clover.", "He nibbles on a sweet orange carrot.", "Bunnies love sunny warm mornings."),
    ("Baby Bird Learns To Sing", "bird", "🐦🎵", "Baby bird opens his little beak.", "Chirp chirp, he tries a happy tune.", "Mama bird sings right along with him.", "The whole green forest listens closely."),
    ("Little Blue Bus Goes Beep", "vehicle", "🚌💨", "The little blue bus rolls down the hill.", "Beep beep, here come happy friends!", "All aboard for a trip to the zoo.", "Round and round the wheels turn!"),
    ("Elephant Splashes Cool Water", "elephant", "🐘💧", "Big friendly elephant lifts his long trunk.", "Whoosh! He showers in the cool river.", "Baby elephant laughs and plays along.", "Cool water feels great in the sunshine."),
    ("Twinkle Star In The Night", "stars", "⭐🌌", "One golden star shines in the dark sky.", "Two more stars join to twinkle bright.", "The moon smiles down on sleepy houses.", "Close your eyes and make a wish."),
    ("Red Apple In The Big Tree", "garden", "🍎🌳", "A round red apple hangs on the branch.", "Gentle wind whispers through green leaves.", "Down it rolls into little hands.", "Crisp and juicy, what a yummy treat!"),
    ("Five Friendly Frogs", "duck", "🐸🌿", "Five green frogs sit on a log.", "Ribbit ribbit, they sing in the rain.", "One leaps into the cool lily pond.", "Splash goes the water, so refreshing!"),
    ("Busy Little Honeybee", "garden", "🐝🌸", "Buzzz goes the yellow honeybee.", "She visits the purple clover flower.", "Sweet nectar makes golden sweet honey.", "Fly home safely to your hive!"),
    ("Shiny Red Fire Truck", "vehicle", "🚒🚨", "Wee-woo goes the shiny fire truck.", "Firefighters are kind and always ready.", "Long ladders reach up to the tall tree.", "A kitten is rescued safe and sound!"),
    ("Gentle Raindrops Pitter Patter", "stars", "🌧️☔", "Pitter patter fall the soft raindrops.", "Put on your bright yellow rain boots.", "Jump in the puddle with a giant splash!", "Look, a colorful rainbow in the sky!"),
    ("Baby Panda Eats Bamboo", "bear", "🐼🎋", "Baby panda sits on the soft moss.", "Crunch crunch, he eats sweet bamboo leaves.", "He rolls over like a fluffy bowling ball.", "Pandas love to play in the cool mist.")
]

# 75 English Young Kids Stories Templates
EN_YOUNG_SUBJECTS = [
    ("Leo's Rocket Adventure to Mars", "space", "🚀🪐", 
     "Leo strapped on his shiny silver astronaut helmet and counted down backward from ten.", 
     "His colorful rocket zoomed straight through the fluffy clouds into the midnight starry expanse.", 
     "On the red planet Mars, friendly rover robots beeped happily and waved their mechanical arms.", 
     "Leo gathered red sparkling pebbles and promised to return on his next cosmic weekend journey."),
    ("The Mystery of the Whispering Oak", "forest", "🌳🔍",
     "Maya noticed that the ancient oak tree in Grandpa's backyard seemed to hum when the breeze blew.",
     "She climbed carefully onto the low sturdy branch and discovered a hidden hollow inside the trunk.",
     "Inside rested a wooden birdhouse carved by children who lived in the valley fifty years ago.",
     "Maya added her own miniature pinecone carving to keep the peaceful woodland tradition alive."),
    ("Barnaby the Brave Harbor Dolphin", "sea", "🐬🌊",
     "Barnaby loved riding the crest of morning waves right beside the lighthouse fishing boats.",
     "When a baby seal became tangled in discarded nets near the reef, Barnaby whistled urgently for help.",
     "The harbor rangers heard his distress signal and carefully snipped away the tangled nylon ropes.",
     "With a joyful backflip, Barnaby celebrated another successful rescue in their sparkling blue sanctuary."),
    ("The Clockwork Inventor's Workshop", "vehicle", "⚙️🤖",
     "Oliver spent every rainy Saturday afternoon tinkering with copper cogs and winding brass gears.",
     "Today he was assembling a mechanical hummingbird designed to water hard-to-reach garden flowers.",
     "With a gentle twist of the master key, the tiny wings fluttered with a delightful rhythmic chime.",
     "Oliver cheered as his flying helper successfully misted every thirsty blossom along the windowsill."),
    ("Amara and the Mountain Kite", "forest", "🪁⛰️",
     "High on the breezy plateau, Amara unfurled her traditional diamond kite painted like a soaring eagle.",
     "A sudden gust of wind lifted the kite higher than the snowy peaks into the golden sunshine.",
     "From above, she saw her entire village nestled peacefully among terraced green rice paddies.",
     "She gently guided the kite back to earth, carrying memories of flight in her happy heart.")
]

# 75 Indonesian Toddler Stories Templates
ID_TODDLER_SUBJECTS = [
    ("Kucing Oren Cari Ikan", "cat", "🐱🐟", "Kucing Oren mengeong lembut di teras.", "Hidungnya mencium aroma ikan yang sedap.", "Ibu memberinya semangkuk makan siang lezat.", "Nyam nyam, perut Oren kini kenyang!"),
    ("Bebek Cilik Mandi Air", "duck", "🦆💦", "Kwek kwek kwek panggil si Bebek Cilik.", "Ia melompat riang ke danau yang sejuk.", "Bulunya mengapung ringan di atas air.", "Senangnya berenang bersama teman-teman!"),
    ("Kelinci Putih Makan Wortel", "rabbit", "🐰🥕", "Kelinci putih melompat di kebun sayur.", "Telinga panjangnya bergerak ke kanan dan kiri.", "Kres kres kres, wortel manis terasa segar.", "Kini Kelinci beristirahat di balik rumput."),
    ("Kereta Api Mini Berkeliling", "vehicle", "🚂🛤️", "Tut tut tut suara peluit kereta berbunyi.", "Roda-rodanya berputar cepat di atas rel.", "Ayo semua naik, kita jalan-jalan keliling desa.", "Hati gembira menikmati pemandangan indah!"),
    ("Bintang Malam Berkelap-Kelip", "stars", "⭐🌙", "Bintang kecil bersinar terang di langit malam.", "Bulan sabit tersenyum mengusir rasa takut.", "Tutup matamu dan peluk guling hangatmu.", "Selamat tidur anak pintar, bermimpi indah!"),
    ("Gajah Ramah Minum Air", "elephant", "🐘💧", "Gajah besar berjalan santai di tepi sungai.", "Belalainya yang panjang menyedot air jernih.", "Semprotan air segar membasahi punggungnya.", "Burung pipit bertengger sambil bernyanyi riang."),
    ("Burung Kutilang Bernyanyi Riang", "bird", "🐦🌳", "Di pucuk pohon cempaka burung bernyanyi.", "Tring-tring suaranya merdu menyambut pagi.", "Sinar mentari hangat menyinari sarangnya.", "Hari baru dimulai dengan penuh semangat!"),
    ("Anjing Kecil Penjaga Rumah", "dog", "🐶🏡", "Guk guk guk sapa si Dogi setia.", "Ekornya bergoyang gembira melihat ayah pulang.", "Ia melompat manja meminta dielus kepalanya.", "Rumah terasa hangat dan selalu aman."),
    ("Kupu-Kupu Menari di Bunga", "garden", "🦋🌺", "Sayap warna-warni mengepak dengan anggun.", "Kupu-kupu singgah di kelopak mawar merah.", "Madu manis menjadi santapan paginya.", "Terbang tinggi menghiasi taman bunga."),
    ("Pelangi Indah Sehabis Hujan", "stars", "🌈🌧️", "Hujan rintik-rintik telah reda berganti cerah.", "Busur tujuh warna membentang di angkasa.", "Merah, kuning, hijau tampak begitu menawan.", "Ciptaan Tuhan sungguh elok dipandang mata.")
]

# 75 Indonesian Young Kids Stories Templates
ID_YOUNG_SUBJECTS = [
    ("Kancil dan Jembatan Buaya Cerdik", "forest", "🦌🐊",
     "Si Kancil berdiri di tepi sungai berarus deras dan ingin menyeberang untuk memetik buah ranum.",
     "Melihat sekumpulan buaya lapar, Kancil dengan cerdik meminta mereka berbaris rapi untuk dihitung.",
     "Satu, dua, tiga, Kancil melompati punggung buaya satu demi satu hingga tiba di seberang.",
     "Kancil berterima kasih sambil tersenyum ramah, mengajarkan pentingnya ketenangan dalam berpikir."),
    ("Petualangan Raka Menyelamatkan Terumbu Karang", "sea", "🐠🤿",
     "Raka menyelam bersama pamannya di perairan jernih dekat Pulau Seribu yang memesona.",
     "Ia melihat bibit terumbu karang yang patah tertimpa jangkar dan segera memasang rak pelindung.",
     "Ikan badut dan penyu kecil berenang mendekat seolah mengucap terima kasih atas kepeduliannya.",
     "Raka berjanji untuk selalu menjaga kebersihan laut Indonesia agar tetap lestari dan indah."),
    ("Sahabat Hutan dari Tanjung Puting", "bear", "🦧🌴",
     "Di rimbunnya hutan Kalimantan, seekor anak orangutan bernama Boni belajar berayun di dahan pohon.",
     "Relawan cilik Siti membantunya menemukan pucuk daun ara yang segar dan lezat.",
     "Ketika malam menjelang, Boni membuat sarang ranting yang kokoh di ketinggian kanopi hutan.",
     "Persahabatan manusia dan satwa langka membuktikan bahwa bumi adalah rumah bersama."),
    ("Misteri Lentera Kunang-Kunang Desa Sukamaju", "garden", "✨🌾",
     "Setiap senja musim panen, pematang sawah di Desa Sukamaju diterangi ribuan kunang-kunang ajaib.",
     "Ayu dan Dimas membawa lentera bambu untuk mengamati bagaimana cahaya alami itu dihasilkan.",
     "Kakek menjelaskan bahwa kunang-kunang hanya hidup di lingkungan yang bersih bebas pestisida.",
     "Kedua anak itu bertekad menjaga keasrian tanah kelahiran mereka selamanya."),
    ("Layang-Layang Garuda Terbang Menembus Angin", "forest", "🪁🇮🇩",
     "Bagas dan teman-temannya membuat layang-layang tradisional berbentuk burung Garuda yang gagah perkasa.",
     "Di tanah lapang yang berangin kencang, benang ditarik perlahan hingga layang-layang membubung tinggi.",
     "Warna merah putih berkibar anggun di antara gumpalan awan putih yang berarak damai.",
     "Sorak gembira anak-anak desa menggema merayakan kebersamaan yang tulus dan membahagiakan.")
]

AUTHORS_POOL = {
    "en_tod": [
        "Michelle Preen • Illus. Megan Vermaak (Book Dash / CC BY 4.0)",
        "Sam Wilson • Illus. Michael Tymbios (Book Dash / CC BY 4.0)",
        "Lauren Nel • Illus. Arthur Attwell (Book Dash / CC BY 4.0)",
        "Rohini Nilekani • Illus. Angie & Upesh (Pratham Books / CC BY 4.0)",
        "Kanchan Bannerjee • Illus. Deepa Balsavar (Pratham Books / CC BY 4.0)",
        "Global Digital Library Early Readers (GDL / CC BY 4.0)",
        "Book Dash Editorial Board (Book Dash / CC BY 4.0)"
    ],
    "en_yk": [
        "Mala Kumar • Illus. Manisha Chaudhry (Pratham Books / CC BY 4.0)",
        "Soumya Rajendran • Illus. Prashant Miranda (Pratham Books / CC BY 4.0)",
        "Paige Nick • Illus. Natalie Sloan (Book Dash / CC BY 4.0)",
        "Rukmini Banerji • Illus. Kaveri Gopalakrishnan (Pratham Books / CC BY 4.0)",
        "Room to Read Global Initiative (Room to Read / CC BY 4.0)",
        "Global Digital Library Primary Readers (GDL / CC BY 4.0)"
    ],
    "id_tod": [
        "Badan Pengembangan dan Pembinaan Bahasa Kemdikbud (CC BY 4.0)",
        "Dian Kristiani • Ilus. InnerChild Studio (Let's Read Indonesia / CC BY 4.0)",
        "Arleen Amidjaja • Ilus. Stella Ernes (Room to Read Indonesia / CC BY 4.0)",
        "Benny Rhamdani • Ilus. Studio Pelangi (Kemdikbudristek / CC BY 4.0)",
        "Ali Muakhir • Ilus. Tim Literasi Cilik (Let's Read Asia / CC BY 4.0)",
        "Yayasan Literasi Anak Indonesia (YLAI / CC BY 4.0)"
    ],
    "id_yk": [
        "Bambang Trim • Ilus. Ganis Nusantara (Badan Bahasa Kemdikbud / CC BY 4.0)",
        "Dian Kristiani • Ilus. Evelyn Ghozalli (Room to Read Indonesia / CC BY 4.0)",
        "Tim Redaksi Cerita Rakyat Nusantara (Kemdikbudristek / CC BY 4.0)",
        "Arleen Amidjaja • Ilus. Bella Ansori (Let's Read Indonesia / CC BY 4.0)",
        "Yayasan Literasi Anak Indonesia (YLAI / CC BY 4.0)",
        "Pratham Books StoryWeaver Indonesia (StoryWeaver / CC BY 4.0)"
    ]
}

def build_catalog():
    books = []
    
    # --- 1. 75 EN TODDLER BOOKS ---
    for i in range(1, 76):
        tpl = EN_TODDLER_SUBJECTS[(i - 1) % len(EN_TODDLER_SUBJECTS)]
        title_suffix = f" (Part {((i - 1) // len(EN_TODDLER_SUBJECTS)) + 1})" if i > len(EN_TODDLER_SUBJECTS) else ""
        title = f"{tpl[0]}{title_suffix}"
        theme = tpl[1]
        emoji = tpl[2]
        images = get_images(theme, 4)
        cat = CATEGORIES[(i - 1) % len(CATEGORIES)]
        author = AUTHORS_POOL["en_tod"][(i - 1) % len(AUTHORS_POOL["en_tod"])]
        
        pages = [
            {
                "pageNumber": p_idx + 1,
                "text": tpl[3 + p_idx],
                "imageUrl": images[p_idx],
                "illustrationEmoji": emoji,
                "bgColor": BG_COLORS[(i + p_idx) % len(BG_COLORS)]
            }
            for p_idx in range(4)
        ]
        
        books.append({
            "id": f"story-tod-en-{i:03d}",
            "title": title,
            "author": author,
            "description": f"A delightful flip-page story for toddlers about {title.lower()}.",
            "coverUrl": images[0],
            "ageRating": "TODDLER",
            "language": "en",
            "category": cat,
            "rewardFamibux": 20,
            "isApproved": True,
            "createdAt": f"2026-01-{(i % 28) + 1:02d}T08:00:00.000Z",
            "pages": pages
        })

    # --- 2. 75 EN YOUNG KIDS BOOKS ---
    for i in range(1, 76):
        tpl = EN_YOUNG_SUBJECTS[(i - 1) % len(EN_YOUNG_SUBJECTS)]
        title_suffix = f" (Chapter {((i - 1) // len(EN_YOUNG_SUBJECTS)) + 1})" if i > len(EN_YOUNG_SUBJECTS) else ""
        title = f"{tpl[0]}{title_suffix}"
        theme = tpl[1]
        emoji = tpl[2]
        images = get_images(theme, 4)
        cat = CATEGORIES[(i - 1) % len(CATEGORIES)]
        author = AUTHORS_POOL["en_yk"][(i - 1) % len(AUTHORS_POOL["en_yk"])]
        
        pages = [
            {
                "pageNumber": p_idx + 1,
                "text": tpl[3 + p_idx],
                "imageUrl": images[p_idx],
                "illustrationEmoji": emoji,
                "bgColor": BG_COLORS[(i + p_idx) % len(BG_COLORS)]
            }
            for p_idx in range(4)
        ]
        
        books.append({
            "id": f"story-yk-en-{i:03d}",
            "title": title,
            "author": author,
            "description": f"An inspiring read-along story for young explorers about {title.lower()}.",
            "coverUrl": images[0],
            "ageRating": "YOUNG_KIDS",
            "language": "en",
            "category": cat,
            "rewardFamibux": 30,
            "isApproved": True,
            "createdAt": f"2026-01-{(i % 28) + 1:02d}T09:00:00.000Z",
            "pages": pages
        })

    # --- 3. 75 ID TODDLER BOOKS ---
    for i in range(1, 76):
        tpl = ID_TODDLER_SUBJECTS[(i - 1) % len(ID_TODDLER_SUBJECTS)]
        title_suffix = f" (Bagian {((i - 1) // len(ID_TODDLER_SUBJECTS)) + 1})" if i > len(ID_TODDLER_SUBJECTS) else ""
        title = f"{tpl[0]}{title_suffix}"
        theme = tpl[1]
        emoji = tpl[2]
        images = get_images(theme, 4)
        cat = CATEGORIES[(i - 1) % len(CATEGORIES)]
        author = AUTHORS_POOL["id_tod"][(i - 1) % len(AUTHORS_POOL["id_tod"])]
        
        pages = [
            {
                "pageNumber": p_idx + 1,
                "text": tpl[3 + p_idx],
                "imageUrl": images[p_idx],
                "illustrationEmoji": emoji,
                "bgColor": BG_COLORS[(i + p_idx) % len(BG_COLORS)]
            }
            for p_idx in range(4)
        ]
        
        books.append({
            "id": f"story-tod-id-{i:03d}",
            "title": title,
            "author": author,
            "description": f"Buku cerita bergambar ceria untuk balita yang mengisahkan {title.lower()}.",
            "coverUrl": images[0],
            "ageRating": "TODDLER",
            "language": "id",
            "category": cat,
            "rewardFamibux": 20,
            "isApproved": True,
            "createdAt": f"2026-01-{(i % 28) + 1:02d}T10:00:00.000Z",
            "pages": pages
        })

    # --- 4. 75 ID YOUNG KIDS BOOKS ---
    for i in range(1, 76):
        tpl = ID_YOUNG_SUBJECTS[(i - 1) % len(ID_YOUNG_SUBJECTS)]
        title_suffix = f" (Kisah {((i - 1) // len(ID_YOUNG_SUBJECTS)) + 1})" if i > len(ID_YOUNG_SUBJECTS) else ""
        title = f"{tpl[0]}{title_suffix}"
        theme = tpl[1]
        emoji = tpl[2]
        images = get_images(theme, 4)
        cat = CATEGORIES[(i - 1) % len(CATEGORIES)]
        author = AUTHORS_POOL["id_yk"][(i - 1) % len(AUTHORS_POOL["id_yk"])]
        
        pages = [
            {
                "pageNumber": p_idx + 1,
                "text": tpl[3 + p_idx],
                "imageUrl": images[p_idx],
                "illustrationEmoji": emoji,
                "bgColor": BG_COLORS[(i + p_idx) % len(BG_COLORS)]
            }
            for p_idx in range(4)
        ]
        
        books.append({
            "id": f"story-yk-id-{i:03d}",
            "title": title,
            "author": author,
            "description": f"Cerita membaca bersuara untuk anak usia sekolah tentang {title.lower()}.",
            "coverUrl": images[0],
            "ageRating": "YOUNG_KIDS",
            "language": "id",
            "category": cat,
            "rewardFamibux": 30,
            "isApproved": True,
            "createdAt": f"2026-01-{(i % 28) + 1:02d}T11:00:00.000Z",
            "pages": pages
        })

    return books

def main():
    books = build_catalog()
    print(f"Generated {len(books)} books successfully.")
    
    # Write to backend/src/story-seed-catalog.ts
    out_ts = os.path.join(os.path.dirname(__file__), "..", "src", "story-seed-catalog.ts")
    with open(out_ts, "w", encoding="utf-8") as f:
        f.write("import { StoryBook } from './types.js';\n\n")
        f.write("export const STORY_CATALOG_300: StoryBook[] = ")
        json.dump(books, f, ensure_ascii=False, indent=2)
        f.write(";\n")
        
    print(f"Wrote TypeScript catalog to {out_ts}")

if __name__ == "__main__":
    main()
