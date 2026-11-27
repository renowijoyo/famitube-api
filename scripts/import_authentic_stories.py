# -*- coding: utf-8 -*-
"""
Imports 100% authentic children's storybooks from open-license online resources:
- Book Dash (CC BY 4.0 open source books from GitHub bookdash/bookdash-books)
- Pratham Books (CC BY 4.0 open source books from GitHub global-asp/pb-source & pb-imagebank)
- African Storybook Project (CC BY 4.0 from GitHub global-asp/asp-source & asp-imagebank)
- Indonesian Regional Folklore (Kemdikbud & trionoputra/cerita-rakyat)

STRICT RULE:
ONLY import stories that have authentic illustrations/pictures directly from the sources.
Every single page and cover image is verified to exist and return HTTP 200.
Any story without source images, or with missing/broken images, is strictly rejected.
"""
import urllib.request
import urllib.parse
import json
import re
import os
import sys
from html import unescape
from concurrent.futures import ThreadPoolExecutor

BG_COLORS = [
    "#1E293B", "#0F172A", "#1E3A8A", "#0C4A6E", 
    "#064E3B", "#14532D", "#312E81", "#4C1D95", 
    "#581C87", "#701A75", "#7C2D12", "#78350F", "#1F2937"
]

def clean_text(raw):
    text = re.sub(r'<[^>]+>', ' ', raw)
    text = unescape(text)
    text = ' '.join(text.split())
    text = re.sub(r'\[(.*?)\]\(.*?\)', r'\1', text)
    text = re.sub(r'[*_~`]', '', text)
    return text.strip()

def fetch_url(url, timeout=12):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode('utf-8', errors='ignore')

def fetch_json(url, timeout=12):
    return json.loads(fetch_url(url, timeout))

def verify_image_url(url, timeout=5):
    if not url or 'unsplash.com' in url or 'placeholder' in url:
        return False
    try:
        req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Range': 'bytes=0-100'})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status in (200, 206)
        except Exception:
            return False

def verify_all_book_images(book):
    """Ensures cover and every single page has a valid, reachable source image."""
    cover = book.get('coverUrl')
    if not verify_image_url(cover):
        return False
    pages = book.get('pages', [])
    if not pages or len(pages) < 2:
        return False
    for p in pages:
        img = p.get('imageUrl')
        if not verify_image_url(img):
            return False
    return True

def batch_verify_books(candidates, max_workers=20):
    print(f"  Verifying {len(candidates)} candidate books in parallel...")
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        results = list(executor.map(verify_all_book_images, candidates))
    verified = [b for b, ok in zip(candidates, results) if ok]
    rejected_count = len(candidates) - len(verified)
    print(f"  Result: {len(verified)} verified ({rejected_count} rejected due to missing source images).")
    return verified

def import_pratham_books(max_count=80):
    print("\nFetching Pratham Books list from pb-source...")
    url = "https://api.github.com/repos/global-asp/pb-source/contents/en"
    try:
        items = fetch_json(url)
    except Exception as e:
        print(f"Error listing pb-source: {e}")
        return []
        
    md_files = [i['name'] for i in items if i['name'].endswith('.md') and not i['name'].startswith('README')]
    print(f"Total Pratham Books available: {len(md_files)}")
    
    candidates = []
    count = 0
    for fname in md_files:
        if count >= max_count:
            break
        try:
            book_id = fname.split('_')[0]
            raw_url = f"https://raw.githubusercontent.com/global-asp/pb-source/master/en/{fname}"
            content = fetch_url(raw_url)
            sections = [s.strip() for s in content.split('##') if s.strip()]
            if len(sections) < 3:
                continue
                
            title = sections[0].replace('#', '').strip()
            pages_raw = sections[1:-1]
            meta_raw = sections[-1]
            
            author_text = "Pratham Books"
            illus_text = ""
            for line in meta_raw.splitlines():
                if line.startswith('* Text:'):
                    author_text = line.replace('* Text:', '').strip()
                elif line.startswith('* Illustration:'):
                    illus_text = line.replace('* Illustration:', '').strip()
                    
            author_credit = f"{author_text}"
            if illus_text and illus_text != author_text:
                author_credit += f" • Illus. {illus_text}"
            author_credit += " (Pratham Books / CC BY 4.0)"
            
            pages = []
            for idx, p_text in enumerate(pages_raw):
                clean_p = clean_text(p_text)
                if not clean_p:
                    continue
                page_num = idx + 1
                img_url = f"https://raw.githubusercontent.com/global-asp/pb-imagebank/master/medium/{book_id}/{page_num:02d}.jpg"
                pages.append({
                    "pageNumber": page_num,
                    "text": clean_p,
                    "imageUrl": img_url,
                    "illustrationEmoji": "📖✨",
                    "bgColor": BG_COLORS[idx % len(BG_COLORS)]
                })
                
            if len(pages) < 2:
                continue
                
            cover_url = f"https://raw.githubusercontent.com/global-asp/pb-imagebank/master/medium/{book_id}/01.jpg"
            avg_words = sum(len(p['text'].split()) for p in pages) / len(pages)
            age_rating = "TODDLER" if (avg_words <= 12 or len(pages) <= 6) else "YOUNG_KIDS"
            reward = 20 if age_rating == "TODDLER" else 30
            desc = pages[0]['text'][:140] + "..." if len(pages[0]['text']) > 140 else pages[0]['text']
            
            candidates.append({
                "id": f"pb-en-{book_id}",
                "title": title,
                "author": author_credit,
                "description": desc,
                "coverUrl": cover_url,
                "ageRating": age_rating,
                "language": "en",
                "category": "Stories & Reading",
                "rewardFamibux": reward,
                "isApproved": True,
                "createdAt": f"2026-01-{(count % 28) + 1:02d}T08:00:00.000Z",
                "pages": pages
            })
            count += 1
        except Exception:
            pass
            
    return batch_verify_books(candidates)

def import_african_storybook(max_count=50):
    print("\nFetching African Storybook list from asp-source...")
    url = "https://api.github.com/repos/global-asp/asp-source/contents/en"
    try:
        items = fetch_json(url)
    except Exception as e:
        print(f"Error listing asp-source: {e}")
        return []
        
    md_files = [i['name'] for i in items if i['name'].endswith('.md') and not i['name'].startswith('README')]
    print(f"Total African Storybook stories available: {len(md_files)}")
    
    candidates = []
    count = 0
    for fname in md_files:
        if count >= max_count:
            break
        try:
            book_id = fname.split('_')[0]
            raw_url = f"https://raw.githubusercontent.com/global-asp/asp-source/master/en/{fname}"
            content = fetch_url(raw_url)
            sections = [s.strip() for s in content.split('##') if s.strip()]
            if len(sections) < 3:
                continue
                
            title = sections[0].replace('#', '').strip()
            pages_raw = sections[1:-1]
            meta_raw = sections[-1]
            
            author_text = "African Storybook"
            illus_text = ""
            for line in meta_raw.splitlines():
                if line.startswith('* Text:'):
                    author_text = line.replace('* Text:', '').strip()
                elif line.startswith('* Illustration:'):
                    illus_text = line.replace('* Illustration:', '').strip()
                    
            author_credit = f"{author_text}"
            if illus_text and illus_text != author_text:
                author_credit += f" • Illus. {illus_text}"
            author_credit += " (African Storybook / CC BY 4.0)"
            
            pages = []
            for idx, p_text in enumerate(pages_raw):
                clean_p = clean_text(p_text)
                if not clean_p:
                    continue
                page_num = idx + 1
                img_url = f"https://raw.githubusercontent.com/global-asp/asp-imagebank/master/medium/{book_id}/{page_num:02d}.jpg"
                pages.append({
                    "pageNumber": page_num,
                    "text": clean_p,
                    "imageUrl": img_url,
                    "illustrationEmoji": "🌍📚",
                    "bgColor": BG_COLORS[idx % len(BG_COLORS)]
                })
                
            if len(pages) < 2:
                continue
                
            avg_words = sum(len(p['text'].split()) for p in pages) / len(pages)
            age_rating = "TODDLER" if (avg_words <= 12 or len(pages) <= 6) else "YOUNG_KIDS"
            reward = 20 if age_rating == "TODDLER" else 30
            cover_url = f"https://raw.githubusercontent.com/global-asp/asp-imagebank/master/medium/{book_id}/01.jpg"
            desc = pages[0]['text'][:140] + "..." if len(pages[0]['text']) > 140 else pages[0]['text']
            
            candidates.append({
                "id": f"asp-en-{book_id}",
                "title": title,
                "author": author_credit,
                "description": desc,
                "coverUrl": cover_url,
                "ageRating": age_rating,
                "language": "en",
                "category": "Stories & Reading",
                "rewardFamibux": reward,
                "isApproved": True,
                "createdAt": f"2026-01-{(count % 28) + 1:02d}T09:00:00.000Z",
                "pages": pages
            })
            count += 1
        except Exception:
            pass
            
    return batch_verify_books(candidates)

def import_bookdash_books(max_count=45):
    print("\nFetching Book Dash books...")
    meta_url = "https://raw.githubusercontent.com/bookdash/bookdash-books/master/_data/meta.yml"
    try:
        meta_content = fetch_url(meta_url)
    except Exception as e:
        print(f"Error fetching Book Dash meta: {e}")
        return []
        
    lines = meta_content.splitlines()
    in_titles = False
    slugs = []
    for line in lines:
        if line.startswith('titles:'):
            in_titles = True
            continue
        if in_titles:
            if line.startswith('  ') and not line.startswith('    ') and ':' in line and not line.strip().startswith('#'):
                slugs.append(line.split(':')[0].strip())
                
    candidates = []
    count = 0
    for slug in slugs:
        if count >= max_count:
            break
        try:
            book_url = f"https://raw.githubusercontent.com/bookdash/bookdash-books/master/{slug}/en/index.md"
            content = fetch_url(book_url)
            
            title_m = re.search(r'title:\s*["\']?(.*?)["\']?\s*$', content, re.MULTILINE)
            title = title_m.group(1).strip() if title_m else slug.replace('-', ' ').title()
            
            parts = re.split(r'!\[.*?\]\(\{\{\s*site\.image-set\s*\}\}/(\d+\.jpg)\)', content)
            pages = []
            if len(parts) >= 3:
                for i in range(1, len(parts), 2):
                    img_name = parts[i]
                    text_raw = parts[i+1] if i+1 < len(parts) else ""
                    clean_p = clean_text(text_raw)
                    if not clean_p:
                        continue
                    p_num = len(pages) + 1
                    img_url = f"https://raw.githubusercontent.com/bookdash/bookdash-books/gh-pages/{slug}/en/images/{img_name}"
                    pages.append({
                        "pageNumber": p_num,
                        "text": clean_p,
                        "imageUrl": img_url,
                        "illustrationEmoji": "🎨📖",
                        "bgColor": BG_COLORS[p_num % len(BG_COLORS)]
                    })
                    
            if len(pages) < 2:
                continue
                
            cover_url = f"https://raw.githubusercontent.com/bookdash/bookdash-books/gh-pages/{slug}/en/images/01.jpg"
            avg_words = sum(len(p['text'].split()) for p in pages) / len(pages)
            age_rating = "TODDLER" if (avg_words <= 12 or len(pages) <= 8) else "YOUNG_KIDS"
            reward = 20 if age_rating == "TODDLER" else 30
            desc = pages[0]['text'][:140] + "..." if len(pages[0]['text']) > 140 else pages[0]['text']
            
            candidates.append({
                "id": f"bd-en-{slug}",
                "title": title,
                "author": "Book Dash Authors & Illustrators (Book Dash / CC BY 4.0)",
                "description": desc,
                "coverUrl": cover_url,
                "ageRating": age_rating,
                "language": "en",
                "category": "Stories & Reading",
                "rewardFamibux": reward,
                "isApproved": True,
                "createdAt": f"2026-01-{(count % 28) + 1:02d}T10:00:00.000Z",
                "pages": pages
            })
            count += 1
        except Exception:
            pass
            
    return batch_verify_books(candidates)

def import_indonesian_folklore():
    print("\nImporting authentic Indonesian regional folklore with original illustrations...")
    candidates = []
    regions = ['Jawa', 'Sumatera', 'Kalimantan', 'Sulawesi', 'Maluku', 'Nusa Tenggara', 'Papua']
    
    count = 0
    for reg in regions:
        try:
            api_url = f"https://api.github.com/repos/trionoputra/cerita-rakyat/contents/app/src/main/assets/{urllib.parse.quote(reg)}"
            items = fetch_json(api_url)
            for item in items:
                if item['type'] != 'dir':
                    continue
                story_name = item['name']
                raw_html_url = f"https://raw.githubusercontent.com/trionoputra/cerita-rakyat/master/app/src/main/assets/{urllib.parse.quote(reg)}/{urllib.parse.quote(story_name)}/index.html"
                try:
                    html = fetch_url(raw_html_url)
                except Exception:
                    continue
                    
                # STRICT: ONLY stories that have source illustrations
                img_matches = re.findall(r'src=["\']([^"\']+\.(?:jpg|png|webp|jpeg))["\']', html, re.IGNORECASE)
                if not img_matches:
                    # Skip stories that do NOT have source illustrations!
                    continue
                    
                paragraphs = re.findall(r'<P[^>]*>(.*?)</P>', html, re.DOTALL | re.IGNORECASE)
                cleaned_pages = []
                for p in paragraphs:
                    text = clean_text(p)
                    if text and len(text) > 35 and not text.startswith('( Cerita Rakyat') and story_name.lower() not in text[:20].lower():
                        cleaned_pages.append(text)
                        
                if len(cleaned_pages) < 2:
                    continue
                    
                pages = []
                page_slice = cleaned_pages[:6]
                for idx, text in enumerate(page_slice):
                    p_num = idx + 1
                    img_file = img_matches[idx] if idx < len(img_matches) else img_matches[idx % len(img_matches)]
                    img_url = f"https://raw.githubusercontent.com/trionoputra/cerita-rakyat/master/app/src/main/assets/{urllib.parse.quote(reg)}/{urllib.parse.quote(story_name)}/{img_file}"
                        
                    pages.append({
                        "pageNumber": p_num,
                        "text": text,
                        "imageUrl": img_url,
                        "illustrationEmoji": "🇮🇩📜",
                        "bgColor": BG_COLORS[idx % len(BG_COLORS)]
                    })
                    
                slug = re.sub(r'[^a-z0-9]+', '-', story_name.lower()).strip('-')
                cover_url = pages[0]['imageUrl']
                desc = f"Cerita rakyat nusantara dari daerah {reg}: {cleaned_pages[0][:140]}..."
                
                candidates.append({
                    "id": f"cr-id-{slug}",
                    "title": story_name,
                    "author": f"Cerita Rakyat {reg} (Kemdikbudristek / Warisan Budaya Nusantara)",
                    "description": desc,
                    "coverUrl": cover_url,
                    "ageRating": "YOUNG_KIDS",
                    "language": "id",
                    "category": "Stories & Reading",
                    "rewardFamibux": 30,
                    "isApproved": True,
                    "createdAt": f"2026-01-{(count % 28) + 1:02d}T11:00:00.000Z",
                    "pages": pages
                })
                count += 1
        except Exception:
            pass
            
    return batch_verify_books(candidates)

def import_bible_stories():
    """
    Imports age-appropriate illustrated Bible stories for Toddlers (2-4) and Young Kids (5-8)
    from Open Bible Stories (Door43 / unfoldingWord under CC BY-SA 4.0).
    Every single illustration is verified directly from Door43 CDN.
    """
    print("\nFetching age-appropriate Open Bible Stories (Door43 / unfoldingWord CC BY-SA 4.0)...")
    toddler_indices = [1, 3, 23, 30, 34]
    young_kids_indices = [8, 9, 12, 17, 27, 31, 33, 35, 44]
    curated = toddler_indices + young_kids_indices
    candidates = []
    
    for s_idx in curated:
        for lang in ["en", "id"]:
            try:
                if lang == "en":
                    url = f"https://git.door43.org/unfoldingWord/en_obs/raw/branch/master/content/{s_idx:02d}.md"
                else:
                    url = f"https://git.door43.org/shower/ind_obs/raw/branch/master/ingredients/content/{s_idx:02d}.md"
                    
                md = fetch_url(url, timeout=10)
                title = ""
                for line in md.splitlines():
                    if line.startswith('#'):
                        title = line.strip('# \t')
                        title = re.sub(r'^\d+\.\s*', '', title)
                        break
                        
                chunks = re.split(r'!\[.*?\]\((.*?)\)', md)
                pages = []
                page_num = 1
                for i in range(1, len(chunks), 2):
                    img_url = chunks[i].strip()
                    text = chunks[i+1].strip()
                    text = re.sub(r'//.*?//', '', text, flags=re.DOTALL).strip()
                    text = re.sub(r'_.*?_', '', text, flags=re.DOTALL).strip()
                    text = ' '.join(text.split())
                    if not text:
                        continue
                    pages.append({
                        "pageNumber": page_num,
                        "text": text,
                        "imageUrl": img_url,
                        "illustrationEmoji": "📖✨" if lang == "en" else "🇮🇩📖",
                        "bgColor": BG_COLORS[(page_num - 1) % len(BG_COLORS)]
                    })
                    page_num += 1
                    
                if not pages:
                    continue
                    
                age_rating = "TODDLER" if s_idx in toddler_indices else "YOUNG_KIDS"
                reward = 25 if age_rating == "TODDLER" else 35
                slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
                desc = pages[0]['text'][:140] + "..." if len(pages[0]['text']) > 140 else pages[0]['text']
                
                author_credit = (
                    "Door43 & unfoldingWord (Open Bible Stories / CC BY-SA 4.0)"
                    if lang == "en"
                    else "Door43 & unfoldingWord Indonesia (Kisah Alkitab Terbuka / CC BY-SA 4.0)"
                )
                
                candidates.append({
                    "id": f"obs-{lang}-{s_idx:02d}-{slug}",
                    "title": title,
                    "author": author_credit,
                    "description": desc,
                    "coverUrl": pages[0]['imageUrl'],
                    "ageRating": age_rating,
                    "language": lang,
                    "category": "Bible Stories",
                    "rewardFamibux": reward,
                    "isApproved": True,
                    "createdAt": f"2026-01-{(s_idx % 28) + 1:02d}T10:00:00.000Z",
                    "pages": pages
                })
            except Exception as e:
                pass
                
    return batch_verify_books(candidates)

def generate_story_tags(book):
    title = (book.get('title') or '').lower()
    desc = (book.get('description') or '').lower()
    author = (book.get('author') or '').lower()
    category = (book.get('category') or '').lower()
    lang = book.get('language') or 'en'
    age = book.get('ageRating') or 'TODDLER'
    
    pages_text = ' '.join((p.get('text') or '').lower() for p in book.get('pages', [])[:8])
    full_corpus = f"{title} {desc} {pages_text} {author}"
    
    tags = set()
    if age == 'TODDLER':
        tags.update(['toddler', 'early-reader', 'picture-book'])
    else:
        tags.update(['young-kids', 'read-along'])
        
    if lang == 'id':
        tags.add('bahasa-indonesia')
    else:
        tags.add('english')
        
    if 'cerita rakyat' in author or 'kemdikbud' in author or 'nusantara' in full_corpus or 'cr-id-' in book.get('id', ''):
        tags.update(['folklore', 'cerita-rakyat', 'indonesia', 'legend', 'culture', 'heritage'])
        for reg in ['jawa', 'sunda', 'sumatera', 'bali', 'kalimantan', 'sulawesi', 'papua', 'maluku', 'ntb', 'ntt', 'aceh', 'lampung', 'riau', 'madura', 'betawi']:
            if reg in full_corpus:
                tags.add(reg)
    elif 'african storybook' in author or 'asp-en' in book.get('id', ''):
        tags.update(['folklore', 'culture', 'african-stories'])
    elif 'pratham' in author or 'pb-en' in book.get('id', ''):
        tags.update(['learning', 'culture'])
    elif 'book dash' in author or 'bd-en' in book.get('id', ''):
        tags.update(['picture-book', 'creative'])
    elif 'door43' in author or 'unfoldingword' in author or 'obs-' in book.get('id', '') or category == 'bible stories':
        tags.update(['bible', 'bible-stories', 'faith', 'scripture'])
        if lang == 'id':
            tags.update(['alkitab', 'cerita-alkitab', 'iman'])
        if 'creation' in full_corpus or 'penciptaan' in full_corpus:
            tags.update(['creation', 'penciptaan', 'nature', 'animals', 'world'])
        if 'flood' in full_corpus or 'air bah' in full_corpus or 'noah' in full_corpus or 'nuh' in full_corpus:
            tags.update(['noah', 'ark', 'animals', 'rainbow', 'bahtera-nuh', 'hewan'])
        if 'joseph' in full_corpus or 'yusuf' in full_corpus:
            tags.update(['joseph', 'yusuf', 'family', 'forgiveness', 'patience', 'keluarga'])
        if 'moses' in full_corpus or 'musa' in full_corpus:
            tags.update(['moses', 'musa', 'baby-moses', 'courage', 'keberanian'])
        if 'exodus' in full_corpus or 'keluaran' in full_corpus:
            tags.update(['exodus', 'red-sea', 'journey', 'freedom', 'keluaran', 'laut-merah'])
        if 'david' in full_corpus or 'daud' in full_corpus:
            tags.update(['david', 'daud', 'shepherd', 'gembala', 'music', 'courage'])
        if 'birth of jesus' in full_corpus or 'kelahiran yesus' in full_corpus:
            tags.update(['jesus', 'yesus', 'nativity', 'christmas', 'natal', 'baby-jesus', 'peace'])
        if 'samaritan' in full_corpus or 'samaria' in full_corpus:
            tags.update(['good-samaritan', 'samaria-yang-baik', 'kindness', 'kebaikan', 'helping', 'menolong'])
        if 'feeds' in full_corpus or 'memberi makan' in full_corpus:
            tags.update(['jesus', 'yesus', 'miracle', 'mukjizat', 'sharing', 'berbagi', 'food', 'fish', 'bread'])
        if 'water' in full_corpus or 'berjalan di atas air' in full_corpus:
            tags.update(['jesus', 'yesus', 'miracle', 'mukjizat', 'faith', 'iman', 'courage'])
        if 'farmer' in full_corpus or 'petani' in full_corpus:
            tags.update(['parable', 'perumpamaan', 'farmer', 'petani', 'nature', 'growth'])
        if 'other stories' in full_corpus or 'lainnya' in full_corpus or 'lost sheep' in full_corpus or 'domba' in full_corpus:
            tags.update(['parable', 'perumpamaan', 'lost-sheep', 'domba-tersesat', 'shepherd', 'gembala', 'love', 'kasih', 'animals'])
        if 'compassionate father' in full_corpus or 'penuh kasih' in full_corpus or 'prodigal' in full_corpus:
            tags.update(['parable', 'perumpamaan', 'prodigal-son', 'compassionate-father', 'family', 'keluarga', 'forgiveness', 'love', 'kasih'])
        if 'beggar' in full_corpus or 'pengemis' in full_corpus or 'peter and john' in full_corpus or 'petrus' in full_corpus:
            tags.update(['peter-and-john', 'petrus-yohanes', 'healing', 'miracle', 'mukjizat', 'joy', 'kindness'])
        
    animal_patterns = [
        (r'\b(animal|animals|beast|creature|zoo|safari|wildlife)\b', ['animals']),
        (r'\b(hewan|binatang|satwa)\b', ['animals', 'hewan']),
        (r'\b(rabbit|bunny|hare|kelinci)\b', ['animals', 'rabbit']),
        (r'\b(elephant|elephants|gajah)\b', ['animals', 'elephant']),
        (r'\b(lion|lions|singa)\b', ['animals', 'lion']),
        (r'\b(tiger|tigers|harimau|macan)\b', ['animals', 'tiger']),
        (r'\b(monkey|monkeys|baboon|ape|chimpanzee|monyet|kera|lutung)\b', ['animals', 'monkey']),
        (r'\b(bear|bears|beruang)\b', ['animals', 'bear']),
        (r'\b(dog|dogs|puppy|puppies|anjing)\b', ['animals', 'dog']),
        (r'\b(cat|cats|kitten|kittens|kucing)\b', ['animals', 'cat']),
        (r'\b(bird|birds|owl|eagle|sparrow|crow|burung|elang)\b', ['animals', 'bird']),
        (r'\b(fish|fishes|ikan)\b', ['animals', 'fish']),
        (r'\b(frog|frogs|toad|katak|kodok)\b', ['animals', 'frog']),
        (r'\b(turtle|tortoise|penyu|kura-kura)\b', ['animals', 'turtle']),
        (r'\b(crocodile|alligator|buaya)\b', ['animals', 'crocodile']),
        (r'\b(deer|fawn|gazelle|rusa|kijang|kancil)\b', ['animals', 'deer', 'mouse-deer']),
        (r'\b(cow|cattle|bull|ox|calf|sapi|lembu)\b', ['animals', 'cow']),
        (r'\b(goat|sheep|lamb|kambing|domba)\b', ['animals', 'goat']),
        (r'\b(horse|pony|donkey|kuda|keledai)\b', ['animals', 'horse']),
        (r'\b(chicken|rooster|hen|chick|ayam|jago)\b', ['animals', 'chicken']),
        (r'\b(duck|duckling|bebek|itik)\b', ['animals', 'duck']),
        (r'\b(butterfly|caterpillar|kupu-kupu|ulat)\b', ['animals', 'butterfly']),
        (r'\b(bee|bees|ant|ants|spider|insect|lebah|semut|laba-laba|serangga)\b', ['animals', 'insects']),
        (r'\b(snake|serpent|ular)\b', ['animals', 'snake']),
    ]
    for pattern, matched_tags in animal_patterns:
        if re.search(pattern, full_corpus):
            tags.update(matched_tags)
            
    theme_patterns = [
        (r'\b(bedtime|sleep|sleepy|dream|night|moon|lullaby|tidur|terlelap|mimpi|malam|bulan)\b', ['bedtime']),
        (r'\b(nature|forest|tree|trees|flower|garden|rain|river|mountain|sun|sky|alam|hutan|pohon|bunga|taman|hujan|sungai|gunung|matahari|langit)\b', ['nature']),
        (r'\b(friend|friends|friendship|together|share|sharing|play|teman|sahabat|persahabatan|bersama|berbagi|bermain)\b', ['friendship']),
        (r'\b(family|mother|father|mom|dad|mama|papa|sister|brother|baby|grandma|grandpa|keluarga|ibu|ayah|bunda|kakak|adik|bayi|nenek|kakek)\b', ['family']),
        (r'\b(adventure|journey|explore|quest|travel|petualangan|perjalanan|menjelajah)\b', ['adventure']),
        (r'\b(kind|kindness|help|helping|care|caring|honest|baik|kebaikan|menolong|tolong|peduli|jujur)\b', ['kindness']),
        (r'\b(brave|bravery|courage|hero|fearless|berani|keberanian|pahlawan)\b', ['courage']),
        (r'\b(learn|learning|school|count|counting|number|numbers|alphabet|read|reading|belajar|sekolah|angka|huruf|membaca|berhitung)\b', ['learning']),
        (r'\b(food|eat|eating|cook|cooking|kitchen|fruit|bread|makan|makanan|memasak|buah|roti|dapur)\b', ['food']),
        (r'\b(music|sing|song|dance|dancing|drum|musik|nyanyi|lagu|tari|menari)\b', ['music']),
        (r'\b(laugh|laughing|funny|silly|smile|smiling|lucu|konyol|tertawa|senyum)\b', ['humor', 'funny']),
        (r'\b(magic|magical|wizard|fairy|witch|sihir|ajaib)\b', ['magic']),
    ]
    for pattern, matched_tags in theme_patterns:
        if re.search(pattern, full_corpus):
            tags.update(matched_tags)
            
    if len(tags) < 4:
        tags.add('storytime')
        tags.add('kids')
        
    return sorted(list(tags))

def main():
    print("=== STARTING AUTHENTIC STORY IMPORT WITH PARALLEL SOURCE-IMAGE VERIFICATION ===")
    all_books = []
    
    # 1. Pratham Books with 100% verified source illustrations
    pb = import_pratham_books(max_count=80)
    all_books.extend(pb)
    
    # 2. African Storybook with 100% verified source illustrations
    asp = import_african_storybook(max_count=50)
    all_books.extend(asp)
    
    # 3. Book Dash Books with 100% verified source illustrations
    bd = import_bookdash_books(max_count=45)
    all_books.extend(bd)
    
    # 4. Indonesian Regional Folklore with 100% verified source illustrations
    cr = import_indonesian_folklore()
    all_books.extend(cr)
    
    # 5. Open Bible Stories (Door43 / unfoldingWord CC BY-SA 4.0) with 100% verified source illustrations
    obs = import_bible_stories()
    all_books.extend(obs)
    
    # Assign rich topical tags to each verified book
    for b in all_books:
        b['tags'] = generate_story_tags(b)
    
    # Note: Indonesian Fables using Unsplash stock photos are completely omitted
    
    print(f"\n==========================================")
    print(f"TOTAL AUTHENTIC IMPORTED BOOKS WITH 100% SOURCE IMAGES: {len(all_books)}")
    en_books = [b for b in all_books if b['language'] == 'en']
    id_books = [b for b in all_books if b['language'] == 'id']
    toddler_books = [b for b in all_books if b['ageRating'] == 'TODDLER']
    young_books = [b for b in all_books if b['ageRating'] == 'YOUNG_KIDS']
    bible_books = [b for b in all_books if b['category'] == 'Bible Stories']
    print(f" - English stories: {len(en_books)}")
    print(f" - Indonesian stories: {len(id_books)}")
    print(f" - Toddler level: {len(toddler_books)}")
    print(f" - Young Kids level: {len(young_books)}")
    print(f" - Bible stories: {len(bible_books)}")
    print(f"==========================================")
    
    catalog_ts = os.path.join(os.path.dirname(__file__), "..", "src", "story-seed-catalog.ts")
    with open(catalog_ts, "w", encoding="utf-8") as f:
        f.write("import { StoryBook } from './types.js';\n\n")
        f.write("export const STORY_CATALOG_AUTHENTIC: StoryBook[] = ")
        json.dump(all_books, f, ensure_ascii=False, indent=2)
        f.write(";\n")
        
    print(f"Saved authentic catalog with 100% verified source images and rich tags to {catalog_ts}")

if __name__ == "__main__":
    main()
