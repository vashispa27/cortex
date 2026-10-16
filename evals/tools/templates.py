"""Page-family builders. Each returns a Page: the node tree plus window metadata.
All content is invented. Structure imitates the real app so AX trees look real."""
import html

from corpus_lib import (G, H, T, B, L, TA, TF, AX, AXLEAF, Node, browser_chrome)


class Page(object):
    def __init__(self, stem, app_id, title, url, source_type, tree, css, body_cls="",
                 lang="en", notes="", article_role=None):
        self.stem = stem
        self.app_id = app_id
        self.title = title
        self.url = url
        self.source_type = source_type
        self.tree = tree
        self.css = css
        self.body_cls = body_cls
        self.lang = lang
        self.notes = notes


# --------------------------------------------------------------------- CSS

BASE_CSS = """
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
button{font:inherit;cursor:pointer}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
"""

CHATGPT_CSS = BASE_CSS + """
body{background:#212121;color:#ececec;display:flex}
.sidebar{width:260px;background:#171717;padding:12px;display:flex;flex-direction:column;gap:4px;height:100vh;overflow:auto}
.sidebar a{color:#ececec;text-decoration:none;padding:8px 10px;border-radius:8px;font-size:14px}
.sidebar a:hover,.sidebar a.cur{background:#2a2a2a}
.sidebar .newchat{background:none;border:0;color:#ececec;text-align:left;padding:8px 10px}
.pane{flex:1;display:flex;flex-direction:column;height:100vh}
.top{display:flex;justify-content:space-between;align-items:center;padding:10px 16px}
.top button{background:none;border:1px solid #444;color:#ececec;border-radius:16px;padding:4px 12px}
.convo{flex:1;overflow:auto;padding:0 0 24px}
.turn{max-width:760px;margin:0 auto;padding:14px 16px}
.turn.user .msg{background:#2f2f2f;border-radius:18px;padding:10px 16px;margin-left:80px}
.turn.assistant .msg p{margin:0 0 10px}
.turn ul{margin:0 0 10px;padding-left:22px}
.actions{display:flex;gap:6px;margin-top:6px}
.actions button{background:none;border:0;color:#9b9b9b;font-size:13px;padding:2px 6px}
.composer{max-width:760px;width:100%;margin:0 auto;padding:0 16px}
.composer .box{display:flex;gap:8px;background:#303030;border-radius:26px;padding:10px 14px;align-items:flex-end}
.composer textarea{flex:1;background:none;border:0;color:#ececec;resize:none;font:inherit;outline:none;height:44px}
.composer button{background:#fff;color:#000;border:0;border-radius:50%;width:32px;height:32px}
.disclaimer{text-align:center;color:#9b9b9b;font-size:12px;padding:8px}
.thought{color:#9b9b9b;font-size:13px;margin:0 0 6px}
"""

XCHAT_CSS = BASE_CSS + """
body{background:#000;color:#e7e9ea;display:flex}
.rail{width:88px;border-right:1px solid #2f3336;padding:12px;display:flex;flex-direction:column;gap:12px}
.rail a{color:#e7e9ea;text-decoration:none;font-weight:600}
.convs{width:340px;border-right:1px solid #2f3336;height:100vh;overflow:auto}
.convs h2{padding:14px 16px;margin:0;font-size:20px}
.convs li{list-style:none;padding:12px 16px;border-bottom:1px solid #16181c}
.convs ul{margin:0;padding:0}
.convs .prev{color:#71767b;font-size:14px}
.thread{flex:1;display:flex;flex-direction:column;height:100vh}
.thread header{padding:14px 16px;border-bottom:1px solid #2f3336;font-weight:700}
.msgs{flex:1;overflow:auto;padding:16px;margin:0;list-style:none}
.msgs li{margin:0 0 14px;max-width:70%}
.msgs li .meta{color:#71767b;font-size:12px}
.msgs li .bubble{background:#16181c;border-radius:16px;padding:8px 14px;display:inline-block}
.compose{display:flex;gap:8px;padding:12px 16px;border-top:1px solid #2f3336}
.compose textarea{flex:1;background:#202327;border:0;border-radius:20px;color:#e7e9ea;padding:10px 14px;font:inherit}
.compose button{background:#1d9bf0;color:#fff;border:0;border-radius:18px;padding:0 18px}
.kbd{color:#71767b;font-size:12px;padding:6px 16px}
"""

SLACK_CSS = BASE_CSS + """
body{background:#fff;color:#1d1c1d;display:flex}
.ws{width:70px;background:#3f0e40;color:#fff;padding:12px 0;text-align:center}
.side{width:250px;background:#4a154b;color:#e8d8e8;padding:14px;height:100vh;overflow:auto}
.side h3{font-size:13px;text-transform:uppercase;letter-spacing:.04em;margin:14px 0 6px;color:#cfc3cf}
.side a{display:block;color:#e8d8e8;text-decoration:none;padding:3px 6px}
.chan{flex:1;display:flex;flex-direction:column;height:100vh}
.chan header{padding:12px 20px;border-bottom:1px solid #ddd;font-weight:800;font-size:18px}
.mlist{flex:1;overflow:auto;padding:12px 20px;margin:0;list-style:none}
.mlist li{margin:0 0 14px}
.mlist .who{font-weight:800;background:none;border:0;padding:0;margin-right:8px}
.mlist .ts{color:#616061;font-size:12px;text-decoration:none}
.mlist .day{color:#616061;font-size:12px;font-weight:700;border-top:1px solid #ddd;padding-top:6px}
.cmp{padding:0 20px 20px}
.cmp textarea{width:100%;height:64px;border:1px solid #999;border-radius:8px;padding:8px;font:inherit}
"""

ARTICLE_CSS = BASE_CSS + """
body{background:#faf8f3;color:#222;font-family:Georgia,"Times New Roman",serif}
.cookie{background:#222;color:#fff;padding:10px 20px;display:flex;gap:16px;align-items:center;font:14px -apple-system,sans-serif}
.cookie button{background:#f2c14e;border:0;padding:6px 14px;border-radius:4px}
.hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 32px;border-bottom:1px solid #ddd;font-family:-apple-system,sans-serif}
.hdr .site{font-weight:800;font-size:20px;color:#222;text-decoration:none}
.hdr nav a{margin-left:18px;color:#555;text-decoration:none}
main{max-width:700px;margin:28px auto;padding:0 20px}
main h1{font-size:34px;line-height:1.2;margin:0 0 6px}
main h2{margin:26px 0 6px}
.by{color:#777;font:14px -apple-system,sans-serif;margin:0 0 20px}
main p,main li{font-size:18px;line-height:1.65}
footer{border-top:1px solid #ddd;margin-top:40px;padding:20px 32px;color:#777;font:13px -apple-system,sans-serif}
footer a{color:#777;margin-right:14px}
"""

EMAIL_CSS = BASE_CSS + """
body{background:#fff;color:#1c1c1e;display:flex}
.mbox{width:200px;background:#f1f1f3;padding:12px;height:100vh}
.mbox a{display:flex;justify-content:space-between;padding:5px 8px;color:#1c1c1e;text-decoration:none;border-radius:6px}
.mbox a.cur{background:#d7d7dc}
.mlist{width:320px;border-right:1px solid #ddd;height:100vh;overflow:auto;margin:0;padding:0;list-style:none}
.mlist li{padding:10px 14px;border-bottom:1px solid #eee}
.mlist .from{font-weight:600}.mlist .subj{color:#444}.mlist .snip{color:#888;font-size:13px}
.msg{flex:1;padding:18px 28px;overflow:auto}
.tools{display:flex;gap:8px;margin-bottom:14px}
.tools button{background:#f1f1f3;border:0;border-radius:6px;padding:5px 10px}
.msg h2{margin:0 0 8px}
.hd{color:#555;font-size:13px;margin-bottom:14px}
.hd div{margin:1px 0}
"""

TERMINAL_CSS = BASE_CSS + """
body{background:#1e1e1e;color:#d4d4d4;font-family:Menlo,Monaco,monospace}
.bar{background:#323232;padding:6px 12px;font-size:12px;color:#aaa;text-align:center}
.shell{margin:0;padding:12px 14px;font-size:13px;line-height:1.35;white-space:pre-wrap}
"""

NOTES_CSS = BASE_CSS + """
body{background:#fffdf5;color:#2c2c2c;display:flex}
.folders{width:190px;background:#f4f1e6;padding:12px;height:100vh}
.folders a{display:block;padding:4px 8px;color:#2c2c2c;text-decoration:none;border-radius:5px}
.folders a.cur{background:#e6dfc4}
.nlist{width:260px;border-right:1px solid #e3ddc6;height:100vh;margin:0;padding:0;list-style:none}
.nlist li{padding:10px 14px;border-bottom:1px solid #eee8d2}
.nlist .t{font-weight:700}.nlist .s{color:#8a8570;font-size:13px}
.editor{flex:1;padding:24px 36px}
.editor textarea{width:100%;height:80vh;border:0;background:none;font:16px/1.6 -apple-system,sans-serif;outline:none;resize:none}
.tb{padding:6px 12px;border-bottom:1px solid #e3ddc6;display:flex;gap:8px}
.tb button{background:none;border:0;padding:4px 8px}
"""

NEWTAB_CSS = BASE_CSS + """
body{background:#fff;color:#202124;text-align:center;padding-top:14vh;font-family:Arial,sans-serif}
.tiles{display:flex;gap:18px;justify-content:center;margin-top:34px}
.tiles a{display:block;width:96px;color:#202124;text-decoration:none;font-size:13px}
.tiles a span{display:block;width:48px;height:48px;border-radius:50%;background:#e8eaed;margin:0 auto 8px}
.srch{width:560px;max-width:90%;padding:12px 20px;border-radius:24px;border:1px solid #dfe1e5;font-size:16px}
"""


def _windowed(app_id, title, url, content, chrome):
    if chrome:
        return browser_chrome(app_id, title, url, content)
    return Node("AXWindow", name=title, children=content, tag="div")


# ------------------------------------------------------------------ ChatGPT

def chatgpt_page(stem, title, chat_title, turns, app_id="com.google.Chrome",
                 url=None, chats=None, draft="", notes="", article_role="AXArticle"):
    """turns: list of ("user", text) | ("assistant", [blocks]).
    block: ("p", text) | ("ul", [items]) | ("h", text) | ("thought", text)"""
    chats = chats or ["Weekly meal prep ideas", "Python decorators explained",
                      "Cover letter feedback", "Weekend hike packing list"]
    side = G(
        B("New chat", glyph="+ New chat", cls="newchat"),
        L("Search chats"),
        G(*[L(c, cls=("cur" if c == chat_title else None)) for c in chats] + [L(chat_title, cls="cur")],
          name="Chat history", tag="nav", cls=None),
        tag="aside", cls="sidebar", name="Sidebar")
    turn_nodes = []
    for kind, content in turns:
        if kind == "user":
            turn_nodes.append(G(
                H("You said:", level=5, cls="sr"),
                G(T(content), cls="msg"),
                G(B("Edit message", glyph="✎"), B("Copy", glyph="⧉"), cls="actions"),
                tag="article", ax=article_role, cls="turn user"))
        else:
            blocks = []
            for blk in content:
                if blk[0] == "p":
                    blocks.append(T(blk[1]))
                elif blk[0] == "h":
                    blocks.append(H(blk[1], level=3))
                elif blk[0] == "thought":
                    blocks.append(T(blk[1], tag="p", cls="thought"))
                elif blk[0] == "ul":
                    blocks.append(G(*[G(T(i, tag="span"), tag="li", ax="AXGroup") for i in blk[1]],
                                    tag="ul", ax="AXList"))
            turn_nodes.append(G(
                H("ChatGPT said:", level=5, cls="sr"),
                G(*blocks, cls="msg"),
                G(B("Copy", glyph="⧉"), B("Rate response", glyph="👍"), B("Share", glyph="↗"),
                  B("Read aloud", glyph="🔊"), cls="actions"),
                tag="article", ax=article_role, cls="turn assistant"))
    conversation = G(*turn_nodes, name="Conversation", cls="convo")
    composer = G(
        G(B("Add files and more", glyph="+"),
          TA("Ask ChatGPT", value=draft, placeholder="Ask anything"),
          B("Dictate", glyph="🎙"), B("Send", glyph="↑"), cls="box"),
        tag="form", name="Composer", cls="composer")
    main = G(
        G(B("ChatGPT", glyph="ChatGPT ▾"), B("Share", glyph="Share"), cls="top", tag="header"),
        conversation,
        composer,
        T("ChatGPT can make mistakes. Check important info.", cls="disclaimer"),
        tag="main", cls="pane")
    content = [side, main]
    tree = _windowed(app_id, title, url, content, chrome=True)
    return Page(stem, app_id, title, url, "browser", tree, CHATGPT_CSS, notes=notes)


# -------------------------------------------------------------------- X chat

def xchat_page(stem, title, convo_title, convos, messages, url, app_id="com.apple.Safari",
               notes=""):
    """messages: [(sender, time, text)]"""
    rail = G(L("Home"), L("Explore"), L("Notifications"), L("Messages"), tag="nav", cls="rail",
             name="Primary")
    clist = G(H("Messages", level=2),
              G(*[G(T(n, tag="span"), T(p, tag="span", cls="prev"), tag="li", ax="AXGroup")
                  for n, p in convos], tag="ul", ax="AXList"),
              tag="section", cls="convs", name="Conversations")
    items = []
    for sender, tm, text in messages:
        label = "%s %s" % (sender, tm)
        items.append(G(T(text, cls="bubble"), T(tm, tag="span", cls="meta"),
                       tag="li", name=label, ax="AXGroup"))
    thread = G(
        G(H(convo_title, level=2), tag="header"),
        G(*items, tag="ul", ax="AXList", name="Messages", cls="msgs"),
        G(TA("Start a new message", value="", placeholder="Start a new message"),
          B("Send", glyph="Send"), tag="form", name="Message composer", cls="compose"),
        T("To view keyboard shortcuts, press question mark", cls="kbd"),
        tag="section", cls="thread", name="Conversation")
    tree = _windowed(app_id, title, url, [rail, clist, thread], chrome=True)
    return Page(stem, app_id, title, url, "browser", tree, XCHAT_CSS, notes=notes)


# --------------------------------------------------------------------- Slack

def slack_page(stem, channel, messages, app_id="com.tinyspeck.slackmacgap", notes=""):
    """messages: [(sender, time, text)] or ("--day--", "Monday, October 12", None)."""
    title = "%s - Northwind - Slack" % channel
    side = G(
        T("Northwind", tag="h3"),
        H("Channels", level=3),
        L("# general"), L("# launch-crew"), L("# design"), L("# standup"),
        H("Direct messages", level=3),
        L("Lokesh Mehta"), L("Priya Nair"), L("Priya Raman"),
        tag="aside", cls="side", name="Sidebar")
    items = []
    for sender, tm, text in messages:
        if sender == "--day--":
            items.append(G(T(tm, tag="div", cls="day"), tag="li", ax="AXGroup"))
            continue
        items.append(G(B(sender, cls="who"), L(tm, cls="ts"), T(text, tag="div"),
                       tag="li", ax="AXGroup"))
    chan = G(
        G(H(channel, level=1), tag="header"),
        G(*items, tag="ul", ax="AXList", name="Message list", cls="mlist"),
        G(TA("Message " + channel, value="", placeholder="Message " + channel),
          B("Send", glyph="Send"), cls="cmp", name="Composer", tag="form"),
        tag="section", cls="chan", name="Channel")
    tree = Node("AXWindow", name=title, children=[
        Node("AXWebArea", name=title, children=[G(T("Northwind", tag="div"), cls="ws"), side, chan], tag="div")
    ], tag="div")
    return Page(stem, app_id, title, None, "app", tree, SLACK_CSS, notes=notes)


# ------------------------------------------------------------------- Article

def article_page(stem, site, title, url, nav, headline, byline, blocks, footer,
                 cookie=True, app_id="com.apple.Safari", lang="en", notes="", tab_title=None,
                 cookie_text="We use cookies to improve your experience.",
                 cookie_buttons=("Accept all cookies", "Manage preferences")):
    """blocks: ("p", t) | ("h", t) | ("ul", [t]) | ("ol", [t])"""
    nodes = []
    if cookie:
        nodes.append(G(T(cookie_text, tag="span"),
                       B(cookie_buttons[0], glyph=cookie_buttons[0]),
                       B(cookie_buttons[1], glyph=cookie_buttons[1]),
                       cls="cookie", name="Cookie consent", tag="section"))
    nodes.append(G(L(site, cls="site"),
                   G(*[L(n) for n in nav], tag="nav", name="Primary"),
                   tag="header", cls="hdr", name="Site header"))
    body = [H(headline, level=1), T(byline, cls="by")]
    for blk in blocks:
        if blk[0] == "p":
            body.append(T(blk[1]))
        elif blk[0] == "h":
            body.append(H(blk[1], level=2))
        elif blk[0] in ("ul", "ol"):
            body.append(G(*[G(T(i, tag="span"), tag="li", ax="AXGroup") for i in blk[1]],
                          tag=blk[0], ax="AXList"))
    nodes.append(G(G(*body, tag="article", ax="AXGroup"), tag="main", name=None))
    nodes.append(G(*[T(f, tag="p") if isinstance(f, str) else L(f[0]) for f in footer],
                   tag="footer", name="Site footer"))
    tree = _windowed(app_id, title, url, nodes, chrome=True)
    return Page(stem, app_id, title, url, "browser", tree, ARTICLE_CSS, lang=lang, notes=notes)


# --------------------------------------------------------------------- Email

def email_page(stem, subject, sender, to, date, paragraphs, others, app_id="com.apple.mail", notes=""):
    """others: [(from, subject, snippet)] shown in the message list."""
    title = subject
    mbox = G(H("Mailboxes", level=3), L("Inbox"), L("VIP"), L("Flagged"), L("Drafts"), L("Sent"),
             L("Junk"), L("Trash"), tag="aside", cls="mbox", name="Sidebar")
    mlist = G(*[G(T(f, tag="div", cls="from"), T(s, tag="div", cls="subj"),
                  T(p, tag="div", cls="snip"), tag="li", ax="AXGroup") for f, s, p in others],
              tag="ul", ax="AXList", name="Message list", cls="mlist")
    msg = G(
        G(B("Archive", glyph="Archive"), B("Delete", glyph="Delete"), B("Reply", glyph="Reply"),
          B("Reply All", glyph="Reply All"), B("Forward", glyph="Forward"), cls="tools", tag="div",
          name="Message toolbar"),
        H(subject, level=2),
        G(T("From: " + sender, tag="div"), T("To: " + to, tag="div"), T("Date: " + date, tag="div"),
          cls="hd", name="Message header"),
        *[T(p) for p in paragraphs],
        tag="section", cls="msg", name="Message content")
    tree = Node("AXWindow", name=title, children=[mbox, mlist, msg], tag="div")
    return Page(stem, app_id, title, None, "app", tree, EMAIL_CSS, notes=notes)


# ------------------------------------------------------------------ Terminal

def terminal_page(stem, title, text, app_id="com.apple.Terminal", notes=""):
    # Terminal.app exposes the whole scrollback as one AXTextArea inside an AXScrollArea.
    shell = Node("AXTextArea", name="shell", text=text, tag="pre", cls="shell")
    scroll = G(shell, ax="AXScrollArea", tag="div")
    bar = Node("AXGroup", children=[Node("AXStaticText", text=title, tag="div", cls="bar")],
               tag="div", html_only=True)
    tree = Node("AXWindow", name=title, children=[bar, scroll], tag="div")
    return Page(stem, app_id, title, None, "app", tree, TERMINAL_CSS, notes=notes)


# ------------------------------------------------------------------ Messages

def messages_page(stem, contact, convos, messages, app_id="com.apple.MobileSMS", notes=""):
    title = "Messages - %s" % contact
    side = G(*[G(T(n, tag="span"), T(p, tag="span", cls="prev"), tag="li", ax="AXGroup")
               for n, p in convos], tag="ul", ax="AXList", cls="convs", name="Sidebar")
    thread = G(
        G(H(contact, level=2), tag="header"),
        G(*[G(T(t, cls="bubble"), tag="li", ax="AXGroup") for t in messages],
          tag="ul", ax="AXList", name="Transcript", cls="msgs"),
        G(TA("iMessage", value="", placeholder="iMessage"), B("Send", glyph="Send"),
          tag="form", name="Composer", cls="compose"),
        tag="section", cls="thread")
    tree = Node("AXWindow", name=title, children=[side, thread], tag="div")
    return Page(stem, app_id, title, None, "app", tree, XCHAT_CSS, notes=notes)


# --------------------------------------------------------------------- Notes

def notes_page(stem, title, note_text, folder, others, app_id="com.apple.Notes", notes=""):
    folders = G(H("Folders", level=3), L("iCloud"), L(folder, cls="cur"), L("Recently Deleted"),
                tag="aside", cls="folders", name="Sidebar")
    nlist = G(*[G(T(t, tag="div", cls="t"), T(s, tag="div", cls="s"), tag="li", ax="AXGroup")
                for t, s in others], tag="ul", ax="AXList", name="Notes", cls="nlist")
    editor = G(
        G(B("New Note", glyph="＋"), B("Delete", glyph="🗑"), B("Share", glyph="↗"), cls="tb", name="Notes toolbar"),
        TA("Note body", value=note_text),
        tag="section", cls="editor", name="Editor")
    tree = Node("AXWindow", name=title, children=[folders, nlist, editor], tag="div")
    return Page(stem, app_id, title, None, "app", tree, NOTES_CSS, notes=notes)


# ------------------------------------------------------------------- New tab

def newtab_page(stem, url="chrome://newtab/", app_id="com.google.Chrome", notes=""):
    title = "New Tab - Google Chrome"
    nodes = [
        TF("Search Google or type a URL", value=""),
        G(*[L(n) for n in ["Gmail", "Calendar", "Drive", "Maps", "YouTube", "News"]], cls="tiles",
          name="Most visited"),
        B("Customize Chrome", glyph="Customize Chrome"),
    ]
    tree = _windowed(app_id, title, url, nodes, chrome=True)
    return Page(stem, app_id, title, url, "browser", tree, NEWTAB_CSS, notes=notes)


# ---------------------------------------------------------------------- HTML

def render_page_html(page):
    from corpus_lib import to_html
    # Find the web area / content root for HTML; windows/chrome are AX only.
    def find_body(node):
        if node.role == "AXWebArea":
            return node.children
        for c in node.children:
            r = find_body(c)
            if r is not None:
                return r
        return None
    kids = find_body(page.tree)
    if kids is None:
        kids = page.tree.children
    inner = "".join(to_html(c, 1) for c in kids)
    return ("<!doctype html>\n<html lang=\"%s\">\n<head>\n<meta charset=\"utf-8\">\n"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n"
            "<title>%s</title>\n<style>%s</style>\n</head>\n<body>\n%s</body>\n</html>\n"
            % (page.lang, html.escape(page.title), page.css, inner))
