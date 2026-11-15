import email
import imaplib
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from email.header import decode_header
from email.message import Message
from email.utils import parseaddr
from html import unescape
from html.parser import HTMLParser
from pathlib import Path


MAILBOX = "imap.gmail.com"
SENDER = "competitions@citchennai.net"
DATA_FILE = Path(__file__).with_name("hackathons.json")
IST = timezone(timedelta(hours=5, minutes=30), name="IST")


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)

    def handle_starttag(self, tag, attrs):
        if tag in ("br", "p", "div", "tr", "li"):
            self.parts.append("\n")
        if tag == "a":
            href = dict(attrs).get("href", "")
            if href:
                self.parts.append(f"\n{href}\n")


def decode_header_value(value):
    if not value:
        return ""
    parts = []
    for chunk, encoding in decode_header(value):
        if isinstance(chunk, bytes):
            parts.append(chunk.decode(encoding or "utf-8", errors="replace"))
        else:
            parts.append(chunk)
    return "".join(parts)


def message_body(message: Message):
    candidates = []
    parts = message.walk() if message.is_multipart() else [message]
    for part in parts:
        if part.get_content_disposition() == "attachment":
            continue
        content_type = part.get_content_type()
        if content_type not in ("text/plain", "text/html"):
            continue
        payload = part.get_payload(decode=True)
        if payload is None:
            continue
        charset = part.get_content_charset() or "utf-8"
        content = payload.decode(charset, errors="replace")
        if content_type == "text/html":
            extractor = TextExtractor()
            extractor.feed(content)
            content = "\n".join(extractor.parts)
        candidates.append(unescape(content))
    return "\n".join(candidates)


def field_value(text, labels):
    alternatives = "|".join(re.escape(label) for label in labels)
    match = re.search(
        rf"(?im)^[ \t]*(?:{alternatives})[ \t]*:?[ \t]*(.*?)[ \t]*$",
        text,
    )
    return match.group(1).strip() if match else ""


def parse_deadline(value):
    text = str(value or "").strip()
    for date_format in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, date_format).date()
        except ValueError:
            continue
    return None


def is_registration_open(event, today=None):
    deadline = parse_deadline(event.get("deadline"))
    return deadline is None or deadline >= (today or datetime.now(IST).date())


def parse_event(message: Message):
    sender = parseaddr(decode_header_value(message.get("From")))[1].lower()
    if sender != SENDER:
        return None

    body = message_body(message)
    subject = decode_header_value(message.get("Subject")).strip()
    title = field_value(body, ("Title",))
    if not title:
        subject_title = re.sub(
            r"(?i)^Greetings from CoE\s*(?::|[-|–—])?\s*",
            "",
            subject,
        ).strip()
        if subject_title:
            title = subject_title
    if not title:
        greeting = re.search(
            r"(?im)^[ \t]*Greetings from CoE[^\r\n]*\r?\n[ \t]*([^\r\n]+)",
            body,
        )
        title = greeting.group(1).strip() if greeting else ""
    if not title and subject and not re.search(r"Greetings from CoE", subject, re.I):
        title = subject

    url = field_value(
        body,
        ("Event Website & Registration Link", "Event Website and Registration Link"),
    )
    url_match = re.search(r"https?://[^\s<>\"']+", url)
    if not url_match:
        link_section = re.search(
            r"(?ims)^[ \t]*Event Website\s*(?:&|and)\s*Registration Link[ \t]*:?[ \t]*(.*?)"
            r"(?=^[ \t]*(?:Registration Deadline|Organizer|Prize Amount|Team size|Event mode|Eligible|Title)\b|\Z)",
            body,
        )
        url_match = re.search(r"https?://[^\s<>\"']+", link_section.group(1)) if link_section else None
    if url_match:
        url = url_match.group(0).rstrip(".,);]")

    event = {
        "title": title,
        "organizer": field_value(body, ("Organizer",)),
        "prize": field_value(body, ("Prize Amount",)),
        "team_size": field_value(body, ("Team size", "Team Size")),
        "mode": field_value(body, ("Event mode", "Event Mode")),
        "eligible": field_value(body, ("Eligible", "Eligibility")),
        "deadline": field_value(body, ("Registration Deadline", "Deadline")),
        "url": url,
    }
    if not all(event.values()):
        missing = [key for key, value in event.items() if not value]
        print(f"Skipping email with incomplete event details: {', '.join(missing)}")
        return None
    return event


def load_events():
    if not DATA_FILE.exists():
        return []
    with DATA_FILE.open("r", encoding="utf-8") as file:
        events = json.load(file)
    if not isinstance(events, list):
        raise ValueError(f"{DATA_FILE.name} must contain a JSON array")
    return events


def scan_mailbox(username, app_password):
    mailbox = imaplib.IMAP4_SSL(MAILBOX)
    try:
        mailbox.login(username, app_password)
        status, _ = mailbox.select("INBOX", readonly=True)
        if status != "OK":
            raise RuntimeError("Unable to select the Gmail inbox")
        status, results = mailbox.search(None, "FROM", f'"{SENDER}"')
        if status != "OK":
            raise RuntimeError(f"IMAP search for {SENDER} failed")

        updates = {}
        message_ids = results[0].split() if results and results[0] else []
        for message_id in message_ids:
            message_label = message_id.decode("ascii", errors="replace")
            try:
                status, response = mailbox.fetch(message_id, "(RFC822)")
                if status != "OK":
                    print(f"Could not fetch message {message_label}")
                    continue
                raw_messages = [item[1] for item in response if isinstance(item, tuple)]
                if not raw_messages:
                    continue
                message = email.message_from_bytes(raw_messages[0])
                event = parse_event(message)
                if event:
                    updates[event["url"]] = event
            except Exception as error:
                print(f"Skipping email {message_label} after parsing error: {error}")
        return list(updates.values())
    finally:
        try:
            mailbox.logout()
        except imaplib.IMAP4.error:
            pass


def main():
    username = os.environ.get("GMAIL_USER", "").strip()
    app_password = "".join(os.environ.get("GMAIL_APP_PASSWORD", "").split())
    if not username or not app_password:
        raise RuntimeError("GMAIL_USER and GMAIL_APP_PASSWORD must be configured")

    events = load_events()
    scanned = scan_mailbox(username, app_password)
    by_url = {event.get("url"): event for event in events if event.get("url")}
    for event in scanned:
        by_url[event["url"]] = event

    today = datetime.now(IST).date()
    merged = [event for event in by_url.values() if is_registration_open(event, today)]
    if merged != events:
        with DATA_FILE.open("w", encoding="utf-8", newline="\n") as file:
            json.dump(merged, file, ensure_ascii=False, indent=2)
            file.write("\n")
        print(f"Updated {DATA_FILE.name} with {len(scanned)} event(s)")
    else:
        print(f"No event changes found ({len(scanned)} matching event(s))")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Email scan failed: {error}", file=sys.stderr)
        sys.exit(1)
