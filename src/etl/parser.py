import json
import re
from pathlib import Path
from typing import List, Dict, Optional
from bs4 import BeautifulSoup
from dataclasses import dataclass, asdict

@dataclass
class Post:
    id: int
    url: str
    text: str
    date: str
    reactions: int = 0

class TelegramExportParser:
    """Parses Telegram Desktop HTML export files."""
    
    def __init__(self, file_path: Path, channel_link: str = "https://t.me/channel"):
        self.file_path = file_path
        self.channel_link = channel_link.rstrip('/')

    def parse(self) -> List[Dict]:
        """Parses the HTML file and returns a list of posts."""
        if not self.file_path.exists():
            raise FileNotFoundError(f"File not found: {self.file_path}")

        with open(self.file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        soup = BeautifulSoup(content, 'html.parser')
        messages = soup.find_all('div', class_='message')
        
        posts = []
        
        for msg in messages:
            post = self._extract_post_data(msg)
            if post:
                posts.append(asdict(post))
                
        return posts

    def _extract_post_data(self, msg_div) -> Optional[Post]:
        """Extracts and validates data from a single message div."""
        # 1. Extract ID
        msg_id_str = msg_div.get('id', '')
        if not msg_id_str.startswith('message'):
            return None
        
        try:
            msg_id = int(msg_id_str.replace('message', ''))
        except ValueError:
            return None

        # 2. Extract Text
        text_div = msg_div.find('div', class_='text')
        text = ""
        if text_div:
            # Preserve newlines by replacing <br> with \n
            for br in text_div.find_all('br'):
                br.replace_with('\n')
            text = text_div.get_text().strip()

        # Check for media if text is empty
        has_media = msg_div.find('div', class_='media_photo') or \
                   msg_div.find('div', class_='media_video') or \
                   msg_div.find('div', class_='media_voice_message') or \
                   msg_div.find('div', class_='media_audio_file') or \
                   msg_div.find('div', class_='media_file')

        # Validation: Ignore empty messages unless they have media
        if not text and not has_media:
            return None

        # 3. Extract Date
        date_div = msg_div.find('div', class_='pull_right date details')
        date_str = date_div['title'] if date_div and 'title' in date_div.attrs else ""
        
        # 4. Construct Link
        url = f"{self.channel_link}/{msg_id}"

        # 5. Extract Reactions
        reactions = 0
        reactions_span = msg_div.find('span', class_='reactions')
        if reactions_span:
            for count_span in reactions_span.find_all('span', class_='count'):
                try:
                    reactions += int(count_span.get_text().strip())
                except ValueError:
                    pass

        return Post(
            id=msg_id,
            url=url,
            text=text,
            date=date_str,
            reactions=reactions
        )

def parse_html_export(input_path: str, output_path: str):
    """Main function to run the parser."""
    parser = TelegramExportParser(Path(input_path))
    posts = parser.parse()
    
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)
    
    print(f"Successfully parsed {len(posts)} posts. Saved to {output_path}")

if __name__ == "__main__":
    # Default paths for manual running
    INPUT_FILE = "data/messages.html"
    OUTPUT_FILE = "data/posts.json"
    
    try:
        parse_html_export(INPUT_FILE, OUTPUT_FILE)
    except Exception as e:
        print(f"Error: {e}")
