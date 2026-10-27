"""JgSaw website logic, shared by the local server (serve.py) and the Vercel functions (api/index.py).

- GET /api/analyze?company=...&url=...  reads the company's public website and
  returns a basic go-to-market (GTM) snapshot as JSON for the vision board.

Optional AI enrichment: set these environment variables (any OpenAI-compatible API)
and the snapshot gains an AI-written positioning summary and ICP:
    JGSAW_LLM_BASE_URL   e.g. https://api.openai.com/v1
    JGSAW_LLM_API_KEY
    JGSAW_LLM_MODEL      e.g. gpt-4o-mini
Without them, everything still works from the website itself.
"""
import ipaddress
import json
import os
import re
import socket
import ssl
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 JgSawVision/1.0"
MAX_BYTES = 1_500_000
CACHE = {}          # url -> (time, result)
CACHE_TTL = 60 * 30


# ---------------------------------------------------------------- fetching
class FetchError(Exception):
    pass


def normalise_url(raw):
    raw = (raw or "").strip()
    if not raw:
        raise FetchError("Please enter the company website.")
    if not re.match(r"^https?://", raw, re.I):
        raw = "https://" + raw
    u = urllib.parse.urlparse(raw)
    if not u.hostname or "." not in u.hostname:
        raise FetchError("That doesn't look like a website address.")
    return urllib.parse.urlunparse((u.scheme.lower(), u.netloc.lower(), u.path or "/", "", u.query, ""))


def assert_public(host):
    """Refuse private, loopback and link-local addresses (stops the server being used to probe a local network)."""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise FetchError("We couldn't find that website. Check the address.")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise FetchError("That address isn't a public website.")


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        assert_public(urllib.parse.urlparse(newurl).hostname or "")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class Blocked(FetchError):
    """The site exists but refuses automated visitors (403, bot walls, broken certificates)."""


def _fetch_once(url, timeout, verify=True):
    assert_public(urllib.parse.urlparse(url).hostname)
    ctx = ssl.create_default_context() if verify else ssl._create_unverified_context()
    opener = urllib.request.build_opener(SafeRedirect, urllib.request.HTTPSHandler(context=ctx))
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en"})
    with opener.open(req, timeout=timeout) as r:
        ctype = r.headers.get("Content-Type", "")
        if "html" not in ctype and "xml" not in ctype:
            raise FetchError("That address doesn't return a web page.")
        body = r.read(MAX_BYTES)
        charset = r.headers.get_content_charset() or "utf-8"
        return r.geturl(), body.decode(charset, errors="replace")


def fetch(url, timeout=10):
    """Try the address as given, then with/without www. Only reads the public homepage, so if a
    certificate chain is broken we still read it (nothing is sent to the site)."""
    u = urllib.parse.urlparse(url)
    host = u.hostname or ""
    alt = host[4:] if host.startswith("www.") else "www." + host
    tries = [url, urllib.parse.urlunparse(u._replace(netloc=alt))]
    status = None
    for verify in (True, False):
        for t in tries:
            try:
                return _fetch_once(t, timeout, verify)
            except FetchError:
                raise
            except urllib.error.HTTPError as e:
                status = e.code
            except ssl.SSLError:
                status = status or "ssl"
            except urllib.error.URLError as e:
                if isinstance(getattr(e, "reason", None), ssl.SSLError):
                    status = status or "ssl"
                elif isinstance(getattr(e, "reason", None), socket.gaierror) and t == tries[-1] and status is None:
                    raise FetchError("We couldn't find that website. Check the address.")
            except Exception:
                pass
        if status != "ssl":
            break
    if status in (401, 403, 429, 503, "ssl") or status is None:
        raise Blocked("blocked")
    raise FetchError(f"The website answered with an error ({status}).")


# ---------------------------------------------------------------- parsing
class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.meta = {}
        self.h1, self.h2 = [], []
        self.links = []          # (href, text)
        self.scripts = []        # src values + inline snippets
        self.text = []
        self._stack = []
        self._buf = ""
        self._a = None
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("script", "style", "noscript", "svg"):
            self._skip += 1
            if tag == "script" and a.get("src"):
                self.scripts.append(a["src"])
        if tag == "meta":
            k = (a.get("name") or a.get("property") or "").lower()
            if k and a.get("content"):
                self.meta[k] = a["content"].strip()
        if tag in ("title", "h1", "h2"):
            self._stack.append(tag)
            self._buf = ""
        if tag == "a":
            self._a = [a.get("href", ""), ""]
        if tag == "link" and a.get("href"):
            self.scripts.append(a["href"])

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg") and self._skip:
            self._skip -= 1
        if self._stack and tag == self._stack[-1]:
            t = re.sub(r"\s+", " ", self._buf).strip()
            self._stack.pop()
            if t:
                if tag == "title" and not self.title:
                    self.title = t
                elif tag == "h1" and len(self.h1) < 6:
                    self.h1.append(t)
                elif tag == "h2" and len(self.h2) < 16:
                    self.h2.append(t)
        if tag == "a" and self._a:
            self.links.append((self._a[0], re.sub(r"\s+", " ", self._a[1]).strip()))
            self._a = None

    def handle_data(self, data):
        if self._stack:
            self._buf += data
        if self._a is not None:
            self._a[1] += data
        if not self._skip:
            d = data.strip()
            if d:
                self.text.append(d)


def script_blob(html, srcs):
    """Only scripts and linked assets: tools are detected from what the page loads, not from words in its copy."""
    inline = " ".join(re.findall(r"<script[^>]*>(.*?)</script>", html, re.S | re.I))[:400_000]
    return (inline + " " + " ".join(srcs)).lower()


TECH = [
    ("HubSpot", r"hs-scripts|hubspot|hsforms"), ("Salesforce / Pardot", r"pardot|salesforce|force\.com"),
    ("Marketo", r"marketo|munchkin"), ("Intercom", r"widget\.intercom|intercomcdn|intercomSettings"), ("Drift", r"drift\.com|js\.driftt"),
    ("Zendesk", r"zendesk|zdassets"), ("Google Analytics", r"googletagmanager|google-analytics|gtag\("),
    ("Segment", r"segment\.(com|io)|analytics\.js"), ("LinkedIn Insight", r"snap\.licdn|linkedin_partner"),
    ("Meta Pixel", r"connect\.facebook\.net|fbq\("), ("Hotjar", r"hotjar"), ("Calendly", r"calendly"),
    ("Mailchimp", r"mailchimp|list-manage"), ("Zoho", r"zoho"), ("Webflow", r"webflow"), ("WordPress", r"wp-content|wordpress"),
    ("Shopify", r"cdn\.shopify|shopify\.com/s/|myshopify"), ("Wix", r"wix\.com|wixstatic"), ("Squarespace", r"squarespace"),
]
SOCIAL = [("LinkedIn", r"linkedin\.com/(company|in|school)"), ("X / Twitter", r"(twitter|x)\.com/"),
          ("YouTube", r"youtube\.com/"), ("Instagram", r"instagram\.com/"), ("Facebook", r"facebook\.com/"),
          ("TikTok", r"tiktok\.com/"), ("GitHub", r"github\.com/")]
CTA_WORDS = r"(book|request|get|schedule|start|try|contact|talk|demo|trial|quote|sign ?up|free|buy|shop|subscribe|join)"


def analyse(company, url):
    final_url, html = fetch(url)
    p = PageParser()
    try:
        p.feed(html)
    except Exception:
        pass
    host = urllib.parse.urlparse(final_url).hostname or ""
    root = host.replace("www.", "")
    blob = script_blob(html, p.scripts)
    text = " ".join(p.text)
    lower = text.lower()

    links = []
    for href, label in p.links:
        full = urllib.parse.urljoin(final_url, href)
        links.append((full, label, full.lower()))

    def has_page(*words):
        for full, label, fl in links:
            lab = label.lower()
            if any(w in fl or w in lab for w in words):
                return True
        return False

    social = sorted({name for name, pat in SOCIAL for full, _, fl in links if re.search(pat, fl) and "share" not in fl and "intent" not in fl})
    tech = [name for name, pat in TECH if re.search(pat, blob)]
    ctas = []
    for full, label, _ in links:
        if 2 < len(label) < 40 and re.search(CTA_WORDS, label, re.I) and label not in ctas:
            ctas.append(label)
    channels = {
        "Blog / content": has_page("/blog", "/insights", "/resources", "/articles", "/news", "blog"),
        "Case studies": has_page("case-stud", "customers", "/stories", "success", "case stud"),
        "Pricing page": has_page("/pricing", "/plans", "pricing"),
        "Demo / trial offer": bool(re.search(r"\b(demo|free trial|start (for )?free|get started)\b", lower)) or has_page("demo", "trial"),
        "Newsletter / email capture": bool(re.search(r"newsletter|subscribe", lower)) or "mailchimp" in blob,
        "Careers page": has_page("/careers", "/jobs", "careers", "join us"),
        "Events / webinars": has_page("webinar", "/events", "event"),
        "Partners": has_page("/partners", "partner"),
    }
    proof = {
        "Testimonials": bool(re.search(r"testimonial|what (our )?(customers|clients) say|\u201c.{20,200}\u201d", text, re.I)),
        "Customer logos / names": bool(re.search(r"trusted by|our (customers|clients)|used by|loved by", lower)),
        "Numbers / results": bool(re.search(r"\b\d{1,3}(,\d{3})*\+?\s?(%|x|customers|clients|users|countries|companies)\b", lower)),
        "Awards / reviews": bool(re.search(r"g2|capterra|trustpilot|award|rated", lower)),
    }
    b2b = len(re.findall(r"\b(teams?|business(es)?|enterprise|b2b|saas|platform|clients|workflow|roi|revenue|sales)\b", lower))
    b2c = len(re.findall(r"\b(shop|cart|buy now|free shipping|order|collection|men|women|kids)\b", lower))
    model = "B2C / retail" if ("Shopify" in [n for n, pat in TECH if re.search(pat, blob)] or b2c > b2b) else "B2B"

    desc = p.meta.get("description") or p.meta.get("og:description") or ""
    headline = (p.h1[0] if p.h1 else "") or p.meta.get("og:title") or p.title
    words = len(text.split())

    # ---- scores (0-100): how much of a working GTM motion is visible from the outside
    def pct(xs):
        return round(100 * sum(1 for x in xs if x) / max(1, len(xs)))
    scores = {
        "Positioning": min(100, (35 if headline else 0) + (30 if len(desc) > 50 else 10 if desc else 0) + (20 if len(p.h2) >= 4 else 8 * len(p.h2) // 2) + (15 if words > 400 else 5)),
        "Proof": pct(proof.values()),
        "Content engine": min(100, (45 if channels["Blog / content"] else 0) + (25 if channels["Case studies"] else 0) + (15 if channels["Events / webinars"] else 0) + 5 * min(3, len(social))),
        "Pipeline capture": min(100, 22 * min(2, len(ctas)) + (25 if channels["Demo / trial offer"] else 0) + (15 if channels["Newsletter / email capture"] else 0) + (14 if any(t in tech for t in ("HubSpot", "Salesforce / Pardot", "Marketo", "Zoho")) else 0)),
        "Channels": min(100, 14 * len(social) + (16 if "LinkedIn Insight" in tech or "Meta Pixel" in tech else 0) + (12 if "Google Analytics" in tech else 0)),
    }
    gaps = []
    if scores["Proof"] < 50: gaps.append("Little visible proof: add case studies, customer names and results")
    if not channels["Case studies"]: gaps.append("No case studies to back up claims in deals")
    if not channels["Blog / content"]: gaps.append("No content engine: no blog or resources to pull in buyers")
    if len(ctas) < 2: gaps.append("Few clear calls to action, so interested buyers have nowhere obvious to go")
    if "LinkedIn" not in social: gaps.append("No LinkedIn presence linked from the site")
    if not any(t in tech for t in ("HubSpot", "Salesforce / Pardot", "Marketo", "Zoho")): gaps.append("No marketing automation or CRM visible on the site")
    if len(desc) < 50: gaps.append("Weak or missing meta description: the one-line pitch isn't clear")
    if not gaps: gaps.append("Strong foundations: the next gain is applying one method to every deal and asset")

    result = {
        "company": company or (p.meta.get("og:site_name") or root.split(".")[0].title()),
        "url": final_url, "domain": root,
        "headline": headline[:180], "description": desc[:320],
        "model": model, "ctas": ctas[:5], "social": social, "tech": tech[:8],
        "channels": channels, "proof": proof, "scores": scores,
        "overall": round(sum(scores.values()) / len(scores)),
        "gaps": gaps[:5],
        "messages": [h for h in p.h2 if 8 < len(h) < 90][:5],
        "ai": None,
    }
    result["logos"] = find_logo(final_url, html)
    result["ai"] = enrich(result, text)
    return result



# ---------------------------------------------------------------- logo
def fetch_image(url, timeout=8):
    """Fetch an image server-side and return it as a data URL (so the browser can sample its pixels)."""
    import base64
    if url.startswith("data:image/"):   # logo embedded right in the page
        head, _, body = url.partition(",")
        if "svg" in head:
            try:
                raw = base64.b64decode(body) if ";base64" in head else urllib.parse.unquote(body).encode()
                return svg_data_url(raw.decode("utf-8", "replace"))
            except Exception:
                return None
        return url if ";base64" in head and len(body) > 200 else None
    try:
        assert_public(urllib.parse.urlparse(url).hostname or "")
        opener = urllib.request.build_opener(SafeRedirect, urllib.request.HTTPSHandler(context=ssl._create_unverified_context()))
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/*"})
        with opener.open(req, timeout=timeout) as r:
            ctype = (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            body = r.read(700_000)
    except Exception:
        return None
    if url.lower().split("?")[0].endswith(".svg") or "svg" in ctype or body[:300].lstrip().startswith((b"<svg", b"<?xml")):
        try:
            return svg_data_url(body.decode("utf-8", "replace"))
        except Exception:
            return None
    if not ctype.startswith("image/") or len(body) < 200:
        return None
    return f"data:{ctype};base64," + base64.b64encode(body).decode()


def svg_data_url(svg):
    import base64
    m = re.search(r"<svg\b.*?</svg>", svg, re.S | re.I)
    if not m:
        return None
    svg = m.group(0)
    svg = re.sub(r"<script\b.*?</script>", "", svg, flags=re.S | re.I)
    svg = re.sub(r"\son\w+=\"[^\"]*\"", "", svg)
    head = re.match(r"<svg\b[^>]*>", svg, re.I).group(0)
    new = head
    new = new.replace('xmlns="https://www.w3.org/2000/svg"', 'xmlns="http://www.w3.org/2000/svg"')   # common typo that stops it rendering
    if "xmlns=" not in new:
        new = new.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1)
    if "xlink:" in svg and "xmlns:xlink" not in new:
        new = new.replace("<svg", '<svg xmlns:xlink="http://www.w3.org/1999/xlink"', 1)
    vb = re.search(r'viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)', head)
    w = re.search(r'\swidth="([\d.]+)(px)?"', head)
    h = re.search(r'\sheight="([\d.]+)(px)?"', head)
    if vb and not (w and h):   # canvas needs an intrinsic size to draw an SVG
        vw, vh = float(vb.group(1)), float(vb.group(2))
        k = 400 / max(vw, vh, 1)
        new = re.sub(r'\s(width|height)="[^"]*"', "", new)
        new = new.replace("<svg", f'<svg width="{vw * k:.0f}" height="{vh * k:.0f}"', 1)
    # Many sites colour their logo with page CSS (fill: currentColor), which doesn't exist inside an <img>.
    # Give shapes that have no colour of their own a solid fill so the logo still shows.
    # Root fill="none" (common when the page colours the logo with CSS) would hide shapes with no colour of
    # their own. Swap it for an inherited black: the logo's own fills and class styles still win over it.
    if 'fill="none"' in head:
        new = new.replace('fill="none"', 'fill="#000"', 1)
    svg = svg.replace(head, new, 1).replace("currentColor", "#000")
    svg = re.sub(r"var\(--[^)]*\)", "#000", svg)   # CSS variables don't resolve inside an <img>
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


def find_logo(final_url, html):
    """Rank every logo-like thing on the page and return the best few (as data URLs).

    Strongest: the home link in the header (<a href="/"> wrapping an <svg>/<img>), or anything
    whose alt / class / src / aria-label names the company itself. Product logos, partner logos and
    banners lose points. After those come the site's own icons (svg favicon, mask icon,
    apple-touch icon), then public logo services as a last resort."""
    host = (urllib.parse.urlparse(final_url).hostname or "").lower()
    root = host[4:] if host.startswith("www.") else host
    brand = re.sub(r"[^a-z0-9]", "", root.split(".")[0])
    head_end = html.lower().find("</header>")
    top = html[: head_end + 9] if 0 < head_end < 400_000 else html[:150_000]
    BAD = r"partner|award|badge|banner|promo|hero|product|campaign|universe|event|sponsor|client|customer|footer|app-?store|google-?play|flag|avatar"
    cands = []   # (score, kind, value)

    def named(txt):
        t = re.sub(r"[^a-z0-9]", "", txt.lower())
        return bool(brand) and brand in t

    def add_tag(score, tag, ctx=""):
        if tag.lower().startswith("<svg"):
            cands.append((score, "svg", tag))
            return
        src = re.search(r'\s(?:src|data-src)="([^"]+)"', tag)
        if src and not src.group(1).startswith("data:image/gif"):
            v = src.group(1).replace("&amp;", "&")
            cands.append((score, "url", v if v.startswith("data:") else urllib.parse.urljoin(final_url, v)))

    # 1) the home link: <a href="/"> (or to the site's own root) containing an svg or img
    for m in re.finditer(r"<a\b([^>]*)>(.*?)</a>", top, re.I | re.S):
        attrs, inner = m.group(1), m.group(2)
        href = re.search(r'href="([^"]*)"', attrs)
        if not href:
            continue
        if href.group(1).strip().startswith(("#", "javascript:")):
            continue
        h = urllib.parse.urljoin(final_url, href.group(1))
        hu = urllib.parse.urlparse(h)
        # home = the site root, the page we landed on, or a language root like /en-us or /en/
        home_paths = {"", "/", urllib.parse.urlparse(final_url).path.rstrip("/")}
        home = ((hu.hostname or "").lower().replace("www.", "") == root and not hu.query
                and (hu.path.rstrip("/") in home_paths or re.fullmatch(r"/[a-z]{2}(-[a-z]{2})?/?", hu.path, re.I)))
        if not home:
            continue
        el = re.search(r"<svg\b.*?</svg>|<img\b[^>]*>", inner, re.I | re.S)
        if el:
            sc = 100 + (20 if re.search(r"logo|brand|home", attrs, re.I) else 0) + (15 if named(attrs + el.group(0)[:400]) else 0)
            sc -= 50 if re.search(r"cart|purchase|search|menu|account|user|lang|locale|i18n|globe", attrs, re.I) else 0
            sc -= 60 if re.search(BAD, attrs + el.group(0)[:300], re.I) else 0
            add_tag(sc, el.group(0))
        if len(cands) >= 3:
            break

    # 2) any svg / img that says "logo" (or names the company) near the top of the page
    for m in re.finditer(r"<svg\b[^>]*>.*?</svg>|<img\b[^>]*>", top, re.I | re.S):
        el = m.group(0)
        opener = el[: el.find(">") + 1] if el.lower().startswith("<svg") else el
        # the surrounding element's class / label often holds the clue (e.g. <a class="logo">)
        before = top[max(0, m.start() - 300): m.start()]
        ctx = before[before.rfind("<"):] if "<" in before else ""
        tag_text = opener + " " + ctx
        src_m = re.search(r'\s(?:src|data-src)="([^"]+)"', opener)
        src_v = src_m.group(1) if src_m else ""
        fname = "" if src_v.startswith("data:") else urllib.parse.urlparse(src_v).path.rsplit("/", 1)[-1]
        label = re.sub(r'\s(?:src|data-src|data-cl-lazy-src|srcset)="[^"]*"', "", tag_text)   # alt, class, aria-label, title...
        says_logo = re.search(r"logo|brand|wordmark", label + " " + fname, re.I)
        names_co = named(label) or named(fname)
        if not says_logo and not names_co:
            continue
        sc = 40 + (35 if names_co else 0) + (10 if says_logo else 0)
        if re.search(r"icon|card|thumb|nav-?item|menu", label, re.I) and not re.search(r"logo", label, re.I):
            sc -= 30   # navigation / card icons, not the brand mark
        if src_v and not src_v.startswith("data:"):
            sh = (urllib.parse.urlparse(urllib.parse.urljoin(final_url, src_v)).hostname or "").lower()
            if sh and brand not in sh.replace("-", "") and not sh.endswith(root) and not names_co:
                sc -= 15   # hosted on someone else's domain and not named after the company
        if re.search(BAD, label + " " + fname, re.I):
            sc -= 45
        if re.search(r"\.(jpe?g|webp)(\?|$)", src_v, re.I) or re.search(r"chrome|firefox|safari|edge|browser|download", fname, re.I):
            sc -= 40   # photos and browser / download icons, not logos
        add_tag(sc, el)

    # 3) the site's own icons
    for m in re.finditer(r"<link\b[^>]*rel=\"([^\"]*icon[^\"]*)\"[^>]*>", html, re.I):
        tag, rel = m.group(0), m.group(1).lower()
        href = re.search(r'href="([^"]+)"', tag)
        if not href:
            continue
        hv = href.group(1)
        size = re.search(r'sizes="(\d+)', tag)
        px = int(size.group(1)) if size else (180 if "apple" in rel else 0)
        sc = 30 + (14 if ".svg" in hv.lower() else 0) + (10 if "mask" in rel else 0) + min(10, px // 20) - (25 if hv.lower().split("?")[0].endswith(".ico") else 0)
        cands.append((sc, "url", urllib.parse.urljoin(final_url, hv.replace("&amp;", "&"))))

    seen, tries = set(), []
    for sc, kind, val in sorted(cands, key=lambda c: -c[0]):
        key = val[:300]
        if key in seen or sc < 0:
            continue
        seen.add(key)
        tries.append((kind, val))
    tries = tries[:6] + service_logos(root)
    found = []   # several candidates: the browser checks each one really looks like a logo and uses the first good one
    for kind, val in tries:
        try:
            data = svg_data_url(val) if kind == "svg" else fetch_image(val)
        except Exception:
            data = None
        if data and data not in found:
            found.append(data)
        if len(found) >= 5:
            break
    return found


def service_logos(host):
    """Public logo services: work even when the company's own site blocks us."""
    root = host[4:] if host.startswith("www.") else host
    return [("url", f"https://logo.clearbit.com/{root}?size=256"),
            ("url", f"https://unavatar.io/{root}?fallback=false"),
            ("url", f"https://www.google.com/s2/favicons?domain={root}&sz=256"),
            ("url", f"https://icons.duckduckgo.com/ip3/{root}.ico")]


def logos_only(host):
    found = []
    for _, u in service_logos(host):
        d = fetch_image(u)
        if d and d not in found:
            found.append(d)
    return found


def limited(company, url):
    """For sites that block automated reading: logo + name, and an honest note instead of made-up scores."""
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    root = host[4:] if host.startswith("www.") else host
    return {
        "company": company or root.split(".")[0].title(), "url": url, "domain": root, "limited": True,
        "headline": "", "description": "", "model": "", "ctas": [], "social": [], "tech": [],
        "channels": {}, "proof": {}, "scores": {}, "overall": 50, "gaps": [], "messages": [],
        "logos": logos_only(root), "ai": None,
    }


# ---------------------------------------------------------------- optional AI enrichment
def enrich(r, text):
    base, key, model = os.environ.get("JGSAW_LLM_BASE_URL"), os.environ.get("JGSAW_LLM_API_KEY"), os.environ.get("JGSAW_LLM_MODEL")
    if not (base and key and model):
        return None
    prompt = (
        "You are a B2B go-to-market analyst. From this company's homepage, return JSON only with keys: "
        "positioning (one sentence), icp (one sentence: who they sell to), buyers (array of up to 4 job titles in the buying committee), "
        "competitors (array of up to 3 likely competitors), quick_wins (array of 3 short, specific GTM actions).\n\n"
        f"Company: {r['company']}\nURL: {r['url']}\nHeadline: {r['headline']}\nDescription: {r['description']}\n"
        f"Sections: {'; '.join(r['messages'])}\nPage text: {text[:5000]}"
    )
    body = json.dumps({"model": model, "max_tokens": 600, "temperature": 0.3,
                       "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request(base.rstrip("/") + "/chat/completions", data=body,
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=40) as res:
            content = json.loads(res.read())["choices"][0]["message"]["content"]
        m = re.search(r"\{.*\}", content, re.S)
        return json.loads(m.group(0)) if m else None
    except Exception:
        return None


# ---------------------------------------------------------------- shared request handling
def analyse_cached(company, raw_url):
    url = normalise_url(raw_url)
    hit = CACHE.get(url)
    if hit and time.time() - hit[0] < CACHE_TTL:
        res = dict(hit[1]); res["company"] = company or res["company"]
        return res
    try:
        res = analyse(company, url)
    except Blocked:
        res = limited(company, url)
    CACHE[url] = (time.time(), res)
    return res


def api_get(name, query):
    """name: 'analyze' or 'logo'. query: dict of lists (parse_qs). Returns (status, json-able)."""
    url = query.get("url", [""])[0]
    if name == "logo":
        try:
            res = analyse_cached("", url)
            return 200, {"logos": res.get("logos") or [], "company": res.get("company")}
        except Exception:
            return 200, {"logos": []}
    if name == "analyze":
        company = (query.get("company", [""])[0] or "").strip()[:80]
        try:
            return 200, analyse_cached(company, url)
        except FetchError as e:
            return 422, {"error": str(e)}
        except Exception:
            return 500, {"error": "Something went wrong reading that website. Please try again."}
    return 404, {"error": "Not found"}


def save_deal(raw, local_file=None):
    """Validates a deal. Locally it is appended to deals.jsonl. On Vercel (no lasting disk) it is written to
    the function log, and also POSTed to JGSAW_DEALS_WEBHOOK if that is set (Slack, Zapier, Make, a CRM...)."""
    try:
        d = json.loads(raw or b"{}")
    except Exception:
        return 400, {"error": "We couldn't send that. Please try again."}
    deal = {k: str(d.get(k, ""))[:2000].strip() for k in ("company", "url", "offer", "email")}
    if not deal["company"] or not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", deal["email"]):
        return 422, {"error": "Please add your company and a valid work email."}
    deal["received"] = time.strftime("%Y-%m-%d %H:%M:%S")
    ok = False
    if local_file:
        with open(local_file, "a") as f:
            f.write(json.dumps(deal) + "\n")
        ok = True
    else:
        print("JGSAW_DEAL " + json.dumps(deal), flush=True)
        ok = True
    hook = os.environ.get("JGSAW_DEALS_WEBHOOK")
    if hook:
        try:
            body = json.dumps({"text": f"New JgSaw deal: {deal['company']} ({deal['url']}), {deal['email']}: {deal['offer']}", "deal": deal}).encode()
            urllib.request.urlopen(urllib.request.Request(hook, data=body, headers={"Content-Type": "application/json"}), timeout=8)
        except Exception as e:
            print("JGSAW_DEAL_WEBHOOK_FAILED " + str(e), flush=True)
    return (200, {"ok": True}) if ok else (500, {"error": "We couldn't send that. Please try again."})
