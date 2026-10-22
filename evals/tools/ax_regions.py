#!/usr/bin/env python3
"""Print the region tree of stored Accessibility trees, so a person can see the page structure.

The capture helper emits a flat list of text-bearing nodes, each with an `ancestor_path` (container role and
label, window first). This groups the nodes by that path and prints, for every labelled container, its node
count and the first text under it. Unlabelled generic groups are folded into their parent.

Reads an eval archive (a copy of the memory directory, never local-memory) read-only.

  python3 evals/tools/ax_regions.py 18                      # one snapshot id
  python3 evals/tools/ax_regions.py --site linkedin         # every LinkedIn snapshot
  python3 evals/tools/ax_regions.py --site x --depth 6 --min-nodes 3
  python3 evals/tools/ax_regions.py --site all --labels     # only the label table across snapshots
  python3 evals/tools/ax_regions.py 20 --nodes              # every node, in order, with its container path
"""
import argparse, collections, json, os, sqlite3, sys

DEFAULT = os.path.expanduser("~/Library/Application Support/Rewind/eval-memory")
SITES = {"linkedin": ("linkedin.com",), "x": ("x.com", "twitter.com")}
# Containers worth showing even without a label.
SEMANTIC = {"AXList", "AXHeading", "AXToolbar", "AXWebArea", "AXTable", "AXRow", "AXCell", "AXTabGroup", "AXMenuBar", "AXMenu", "AXLandmarkMain", "AXLandmarkNavigation", "AXLandmarkBanner", "AXLandmarkComplementary", "AXLandmarkContentInfo", "AXArticle"}


def short(text, n=60):
    text = " ".join((text or "").split())
    return text if len(text) <= n else text[: n - 1] + "…"


def element(item):
    role = item.get("role", "")
    name = (item.get("name") or "").strip()
    if name or role in SEMANTIC:
        return (role, name)
    return None


def text_of(node):
    return (node.get("value") or "").strip() or (node.get("name") or "").strip()


class Region:
    def __init__(self, key):
        self.key, self.count, self.first, self.children = key, 0, None, collections.OrderedDict()


def build(nodes):
    root = Region(("root", ""))
    for node in nodes:
        if node.get("excluded") or node.get("protected"):
            continue
        path = [element(a) for a in node.get("ancestor_path", [])[1:]]
        path = [p for p in path if p]
        # The window title repeats in every Chrome container name; fold it away.
        cursor = root
        cursor.count += 1
        text = text_of(node) if node.get("role") in ("AXStaticText", "AXHeading", "AXLink", "AXTextArea") else ""
        for key in path:
            cursor = cursor.children.setdefault(key, Region(key))
            cursor.count += 1
            if cursor.first is None and text:
                cursor.first = text
    return root


def render(region, depth, max_depth, min_nodes, title, lines, labels):
    for key, child in region.children.items():
        role, name = key
        name = name.replace(title, "<window>") if title else name
        labels[(role, short(name, 80))] += child.count
        if depth < max_depth and child.count >= min_nodes:
            first = f'  first: "{short(child.first, 50)}"' if child.first else ""
            lines.append(f'{"  " * depth}{role} "{short(name)}" ({child.count}){first}')
            render(child, depth + 1, max_depth, min_nodes, title, lines, labels)
        else:
            # Still visit for the label table.
            render(child, depth + 1, 99, 10**9, title, [], labels)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ids", nargs="*", type=int)
    ap.add_argument("--archive", default=DEFAULT)
    ap.add_argument("--site", choices=["linkedin", "x", "all"])
    ap.add_argument("--depth", type=int, default=8)
    ap.add_argument("--min-nodes", type=int, default=2)
    ap.add_argument("--labels", action="store_true", help="print only the label table (role, label, node count)")
    ap.add_argument("--nodes", action="store_true", help="print every node in order: index, role, text, and its labelled container path")
    args = ap.parse_args()
    if "local-memory" in os.path.abspath(args.archive):
        sys.exit("refusing to open local-memory")
    db = sqlite3.connect(f"file:{os.path.join(args.archive, 'memory.sqlite3')}?mode=ro", uri=True)
    rows = []
    if args.ids:
        rows = db.execute(f"SELECT id,title,url,domain,ax_nodes_json FROM snapshots WHERE id IN ({','.join('?' * len(args.ids))}) ORDER BY id", args.ids).fetchall()
    elif args.site:
        domains = [d for s in (SITES if args.site == "all" else [args.site]) for d in SITES[s]]
        rows = [r for r in db.execute("SELECT id,title,url,domain,ax_nodes_json FROM snapshots ORDER BY id") if any((r[3] or "").endswith(d) for d in domains)]
    else:
        ap.error("give snapshot ids or --site")
    labels = collections.Counter()
    for sid, title, url, domain, raw in rows:
        nodes = json.loads(raw)
        if args.nodes:
            print(f"\n=== snapshot {sid}  {domain}  {url}  ({len(nodes)} nodes)")
            for index, node in enumerate(nodes):
                path = [f'{a.get("role", "")[2:]} "{short(a.get("name", ""), 28)}"' for a in node.get("ancestor_path", [])[1:] if (a.get("name") or "").strip()]
                flags = "".join(f" [{k}]" for k in ("protected", "excluded") if node.get(k))
                print(f'{index:4d} {node.get("role", "")[2:]:<11} {short(text_of(node), 70)!r}{flags}\n       in: {" > ".join(path) or "(window)"}')
            continue
        lines = []
        tree = build(nodes)
        render(tree, 0, args.depth, args.min_nodes, title, lines, labels)
        if args.labels:
            continue
        print(f"\n=== snapshot {sid}  {domain}  {url}  ({len(nodes)} nodes)\n    title: {short(title, 90)}")
        print("\n".join(lines))
    if args.labels:
        for (role, name), count in sorted(labels.items(), key=lambda kv: -kv[1]):
            if name:
                print(f"{count:6d}  {role} \"{name}\"")


if __name__ == "__main__":
    main()
