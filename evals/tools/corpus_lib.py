"""Tiny DSL that renders one page tree to (a) self-contained HTML and (b) the
Accessibility node list the macOS helper (crates/platform-mac/native/Capture.swift)
would emit for it.

The AX emission mirrors collectText():
  * pre-order walk, children in document order
  * a node is emitted only for text roles (value) or named roles (name)
  * `name` is "<context> / <own name>" where context is the nearest *named*
    AXGroup/AXRow/AXCell/AXWebArea/AXList/AXArticle ancestor
  * `ancestor_path` is [{role,name}] from the window down, capped at 12 entries
    (anonymous wrappers are removed first)
Only the exact roles Safari/Chrome use for each HTML element are uncertain; see
the `notes` field written into every hand-authored fixture.
"""
import html
import json

CONTAINER_ROLES = {"AXGroup", "AXRow", "AXCell", "AXWebArea", "AXList", "AXArticle"}
TEXT_ROLES = {"AXStaticText", "AXTextField", "AXTextArea", "AXTextView", "AXHeading"}
NAMED_ROLES = {"AXButton", "AXLink", "AXCheckBox", "AXRadioButton", "AXMenuItem", "AXTab"}
ANON_WRAPPERS = {"AXGroup", "AXUnknown", "unknown"}
MAX_ANCESTORS = 12


class Node(object):
    def __init__(self, role, name=None, text=None, children=None, tag="div",
                 attrs=None, ax_only=False, html_only=False, cls=None):
        self.role = role
        self.name = name or ""
        self.text = text
        self.children = list(children or [])
        self.tag = tag
        self.attrs = attrs or {}
        self.ax_only = ax_only
        self.html_only = html_only
        self.cls = cls


def _flat(children):
    out = []
    for c in children:
        if c is None:
            continue
        if isinstance(c, (list, tuple)):
            out.extend(_flat(c))
        else:
            out.append(c)
    return out


def G(*children, **kw):
    """Container. name -> aria-label / AXDescription."""
    ax = kw.pop("ax", "AXGroup")
    name = kw.pop("name", None)
    return Node(ax, name=name, children=_flat(children), **kw)


def H(text, level=2, **kw):
    return Node("AXHeading", text=text, tag="h%d" % level, **kw)


def T(text, tag="p", **kw):
    return Node("AXStaticText", text=text, tag=tag, **kw)


def B(label, glyph=None, **kw):
    n = Node("AXButton", name=label, text=glyph, tag="button", **kw)
    return n


def L(text, href="#", **kw):
    n = Node("AXLink", name=text, text=text, tag="a", **kw)
    n.attrs["href"] = href
    return n


def TA(label, value="", placeholder="", **kw):
    n = Node("AXTextArea", name=label, text=value, tag="textarea", **kw)
    n.attrs["placeholder"] = placeholder
    return n


def TF(label, value="", **kw):
    n = Node("AXTextField", name=label, text=value, tag="input", **kw)
    return n


def AX(role, *children, **kw):
    """Container that exists only in the AX tree (browser chrome)."""
    name = kw.pop("name", None)
    return Node(role, name=name, children=_flat(children), ax_only=True, **kw)


def AXLEAF(role, name="", text=None):
    return Node(role, name=name, text=text, ax_only=True)


# ---------------------------------------------------------------- AX output

def _trim(path):
    path = list(path)
    while len(path) > MAX_ANCESTORS:
        idx = None
        for i in range(1, len(path) - 2):
            if not path[i]["name"] and path[i]["role"] in ANON_WRAPPERS:
                idx = i
                break
        if idx is None:
            for i in range(1, len(path) - 2):
                if not path[i]["name"] and path[i]["role"] != "AXWebArea":
                    idx = i
                    break
        if idx is None:
            idx = 1
        del path[idx]
    return path


def to_ax(root):
    nodes = []

    def walk(node, ancestors, context):
        if node.html_only:
            return
        name = node.name
        role = node.role
        if role in TEXT_ROLES:
            display = node.text or ""
        elif role in NAMED_ROLES:
            display = name or (node.text or "")
        else:
            display = ""
        if display.strip() and not node.children:
            nodes.append({
                "role": role,
                "name": " / ".join([p for p in (context, name) if p]),
                "value": display,
                "ancestor_path": list(ancestors),
                "visible": True,
                "protected": False,
                "excluded": False,
                "children": [],
            })
            return
        nxt_ctx = name[:256] if (name and role in CONTAINER_ROLES) else context
        nxt_anc = _trim(list(ancestors) + [{"role": role, "name": name[:96]}])
        for child in node.children:
            walk(child, nxt_anc, nxt_ctx)

    walk(root, [], "")
    return nodes


# -------------------------------------------------------------- HTML output

def _attr_str(node):
    parts = []
    if node.cls:
        parts.append('class="%s"' % html.escape(node.cls, quote=True))
    if node.name and node.role != "AXLink":
        parts.append('aria-label="%s"' % html.escape(node.name, quote=True))
    if node.name and node.tag == "div" and node.role in CONTAINER_ROLES and "role" not in node.attrs:
        parts.append('role="group"')
    for k, v in sorted(node.attrs.items()):
        parts.append('%s="%s"' % (k, html.escape(str(v), quote=True)))
    return (" " + " ".join(parts)) if parts else ""


def to_html(node, indent=0):
    if node.ax_only:
        return ""
    pad = "  " * indent
    tag = node.tag
    attrs = _attr_str(node)
    if node.role == "AXTextArea":
        return "%s<textarea%s>%s</textarea>\n" % (pad, attrs, html.escape(node.text or ""))
    if node.role == "AXTextField":
        return '%s<input type="text"%s value="%s">\n' % (pad, attrs, html.escape(node.text or "", quote=True))
    if node.role == "AXButton":
        return "%s<%s%s>%s</%s>\n" % (pad, tag, attrs, html.escape(node.text or node.name[:1]), tag)
    if node.role in ("AXHeading", "AXStaticText", "AXLink"):
        txt = html.escape(node.text or "")
        if tag == "pre":
            return "%s<pre%s>%s</pre>\n" % (pad, attrs, txt)
        return "%s<%s%s>%s</%s>\n" % (pad, tag, attrs, txt, tag)
    kids = [to_html(c, indent + 1) for c in node.children]
    kids = [k for k in kids if k]
    if not kids:
        return ""
    return "%s<%s%s>\n%s%s</%s>\n" % (pad, tag, attrs, "".join(kids), pad, tag)


def browser_chrome(app, title, url, web_children, tabs=None):
    """Wrap page content in the window/toolbar/tab-strip tree a browser emits."""
    tabs = tabs or [title]
    toolbar = AX("AXToolbar",
                 AXLEAF("AXButton", "Back"), AXLEAF("AXButton", "Forward"),
                 AXLEAF("AXButton", "Reload"),
                 AXLEAF("AXTextField", "Address and search bar", url or ""),
                 name="")
    strip = AX("AXTabGroup", *[AXLEAF("AXRadioButton", t) for t in tabs], name="Tab Strip")
    web = Node("AXWebArea", name=title, children=_flat(web_children), tag="div")
    return Node("AXWindow", name=title, children=[toolbar, strip, web], tag="div")


def write_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=False)
        f.write("\n")
