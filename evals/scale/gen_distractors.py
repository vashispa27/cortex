#!/usr/bin/env python3
"""Deterministic distractor fixtures for the scale test. Invented content only (real snapshots can be
mutated on request, see --mutate-real, and are flagged).

  python3 evals/scale/gen_distractors.py --n 1000 --seed 7 --out evals/scale/out/syn-1k

Layout of the output directory: one fixture JSON per page in the format of evals/corpus, plus
`_manifest.json` (ignored by the loader). Fixture ids:
  syn-NNNNNN[-a|-b|-c]   topical pages; -a/-b/-c are near-duplicate family members (re-captured with a later
                         sighting, scrolled, or one number edited)
  hard-qNNN-K            hard distractors for gold question qNNN: a mutated clone of its source page (same
                         layout, topic and entities, different facts), observed within hours of the source
  hard-absNNN-K          pages sharing the content words of an absent question but answering nothing
  mut-real-NNNNN         optional, real snapshots with numbers and names swapped (provenance real_mutated)

Structure and UI noise come from the invented-content captures in evals/corpus (real Safari captures),
so nodes, ancestor paths and boilerplate look like the real thing; only the content text changes.
The generator never emits any gold answer_text (invented gold, plus --also-gold files): it checks every
fixture's concatenated node text and repairs or drops offenders; the count is in the manifest.
"""
import argparse, copy, json, math, os, random, re, sys

CLOCK_MS = 1792238400000  # 2026-10-17T12:00:00Z, the eval clock
DAY = 86_400_000
norm = lambda s: " ".join(s.lower().split())

# ---------------------------------------------------------------------------------------------------
# vocabulary. Topics overlap with the gold set on purpose (same domains, different facts).
# ---------------------------------------------------------------------------------------------------
NAMES = ["Priya", "Mira", "Lokesh", "Dev", "Sam", "Noor", "Aditi", "Rohan", "Elena", "Tomas", "Hana", "Kofi", "Ines", "Marco", "Yuki",
         "Farah", "Jonas", "Leila", "Omar", "Sana", "Victor", "Zara", "Ibrahim", "Chloe", "Arjun", "Beatriz", "Felix", "Greta"]
SURNAMES = ["Raman", "Nair", "Whitfield", "Okafor", "Lindqvist", "Santos", "Tanaka", "Haddad", "Moreau", "Kapoor", "Brandt", "Costa"]
PLACES = ["Lisbon", "Porto", "Nairobi", "Kyoto", "Oslo", "Denver", "Pune", "Seville", "Hanoi", "Cusco", "Tallinn", "Accra", "Lyon", "Perth"]
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
ORGS = ["Harbor Print", "Northwind", "Orbit Bank", "Campus Library", "Meridian Air", "Corvina Housing", "Bright Roofing", "Atlas Fitness",
        "Greenleaf Supply", "Pioneer Freight", "Lumen Energy", "Cedar Credit Union"]

TOPICS = {
    "bread": {
        "title": ["Sourdough {adj} loaf", "Baking bread with a {adj} starter", "{adj} dough handling notes"],
        "domains": ["bakersnotebook", "crumbandcrust", "loafandlevain", "doughlab"],
        "adj": ["rustic", "overnight", "whole wheat", "rye", "seeded", "no-knead"],
        "sent": [
            "Mix the dough to about {n}% hydration and rest it for {m} minutes before folding.",
            "Bake in a preheated Dutch oven at {n} °C for {m} minutes with the lid on.",
            "The starter doubled in {m} hours at {n} °C, which is faster than last week.",
            "Score the loaf {m} mm deep so the crust opens along one clean seam.",
            "Let the final proof run {m} hours in the fridge; shorter proofs gave a tighter crumb.",
            "Use {n} g of starter for {m} g of flour if the kitchen is below 20 °C.",
            "A lid-off finish for {m} minutes browns the crust without drying the crumb.",
        ]},
    "money": {
        "title": ["Monthly budget planning", "Rent and savings plan", "Quarter budget review", "Paying down the card"],
        "domains": ["moneymap", "ledgerly", "budgetwise", "coinpath"],
        "adj": ["rent", "savings", "travel", "emergency", "tax", "insurance"],
        "sent": [
            "A common guideline is {n} percent of take-home pay for rent, which works out to ${m} a month.",
            "Put ${m} into the {adj} fund before the {n}th of each month.",
            "The credit card balance is ${m}; paying ${n} extra a month clears it in {n2} months.",
            "Decision recorded: keep the {adj} budget at ${m} per month until {mon}.",
            "Subscriptions total ${n} a month; cancelling two of them saves ${m} a year.",
            "{org} invoice number {m} is due by {n} {mon}.",
        ]},
    "travel": {
        "title": ["{place} long weekend itinerary", "Flights to {place}", "{place} trip notes", "Where to stay in {place}"],
        "domains": ["travelwise", "tripnotes", "flightfacts", "wanderdesk"],
        "adj": ["quiet", "central", "riverside", "budget", "boutique"],
        "sent": [
            "Flight {org2} {m} departs {n}:{n2} and lands at {n3}:{n4}; the return leaves at {n5}:{n6}.",
            "The {adj} hotel in {place} costs {m} euros a night and includes breakfast.",
            "Take the number {n} tram to the old town; it runs every {n2} minutes until {n3}:00.",
            "Booking reference {code} was confirmed on {n} {mon}.",
            "Plan {n} days in {place}, with one day trip to {place2} by train.",
            "Airport transfers take about {m} minutes; a taxi is around {n} euros.",
        ]},
    "home": {
        "title": ["Roof repair quote", "Kitchen renovation checklist", "Fixing a leaking tap", "Quote for window replacement"],
        "domains": ["homeprojects", "fixitfast", "buildright", "housecare"],
        "adj": ["flat", "pitched", "slate", "metal", "ceramic"],
        "sent": [
            "Total: €{m}.00. The quote is valid until {n} {mon} 2026.",
            "Level the base units to within {n} mm across the run before fixing the doors.",
            "Countertop lead time is {n} weeks for stone or {n2} weeks for laminate.",
            "The {adj} roof section needs {m} tiles replaced and {n} metres of flashing.",
            "Materials come to €{m} and labour to €{n2}; {org} can start on {n} {mon}.",
            "Allow {n} days for the sealant to cure before the first shower.",
        ]},
    "work": {
        "title": ["Standup notes", "Launch plan", "Sprint planning", "Design review"],
        "domains": ["teamnotes", "sprintdesk", "launchpad", "workroom"],
        "adj": ["beta", "design", "billing", "onboarding", "mobile"],
        "sent": [
            "{name}: The {adj} release goes out {mon} {n} at {n2} PM.",
            "{name}: Build is green again after the dependency bump to version {n}.{n2}.",
            "{name} ({n}:{n2} AM): Budget for the {adj} video is {m} euros.",
            "Standup moved to {n}:{n2} AM starting {mon} {n3}.",
            "Decision: the {adj} launch slips by {n} days; {name} will tell {org}.",
            "Error code {code} appears when the cart holds {n} items and a coupon.",
        ]},
    "code": {
        "title": ["cargo test output", "Fixing a borrow error", "Release build log", "Profiling the indexer"],
        "domains": ["devnotes", "rustbench", "buildlog", "codecorner"],
        "adj": ["config", "buffer", "index", "parser", "cache"],
        "sent": [
            "test result: FAILED. {m} passed; {n} failed; 0 ignored; finished in {n2}.{n3}s",
            "error[E{code2}]: borrow of moved value: `{adj}`",
            "Compiling {adj}-core v0.{n}.{n2} (/Users/dev/src/{adj})",
            "p95 latency dropped from {m} ms to {n} ms after caching the {adj} lookups.",
            "commit {hash} fixed the {adj} regression and added {n} tests.",
            "Memory peaked at {m} MB during the {adj} rebuild.",
        ]},
    "health": {
        "title": ["Macro targets for the cutting phase", "Marathon training plan", "Gym membership details", "Meal plan"],
        "domains": ["fitnessdaily", "runnersweekly", "nutritionhub", "lifthard"],
        "adj": ["easy", "tempo", "recovery", "rest-day", "heavy"],
        "sent": [
            "Sunday long run: {n} km at {adj} pace; Tuesday intervals are {m} x {n2} m.",
            "Protein {m} g | Fat {n} g | Carbs {n2} g for a {adj} day.",
            "Add {n} ml olive oil (~{m} kcal, {n2} g fat) to one of the meals.",
            "Your membership renews on {n} {mon} 2026 at {m} per month.",
            "Aim for {m} g protein and about {n} kcal; adjust by {n2} kcal on {adj} days.",
            "Sleep {n} hours before the {adj} session and drink {m} ml of water.",
        ]},
    "outdoors": {
        "title": ["Autumn vegetable garden plan", "Safari in Kenya", "Rope management for belayers", "Skydiving basics"],
        "domains": ["gardenpath", "travelwise", "climbhub", "physicsdaily"],
        "adj": ["radish", "garlic", "tomato", "kale", "lettuce"],
        "sent": [
            "Plant {adj} {n} cm apart and sow again after {m} days.",
            "The best months for a safari in Kenya are {mon} to {mon2}; park fees are ${m} a day.",
            "Leave about {n} m of slack in the rope between climber and belayer.",
            "Terminal velocity is about {n} m/s ({m} km/h) in a belly-to-earth position.",
            "Sow {adj} cloves on {n} {mon} and mulch with {n2} cm of straw.",
            "Tent pitches cost ${m} per night and the {adj} loop takes {n} hours.",
        ]},
    "bike": {
        "title": ["Rebuilding a rear wheel", "Tubeless sealant guide", "Chain wear check"],
        "domains": ["cyclingfix", "wheelworks", "bikebench"],
        "adj": ["rear", "front", "drive-side", "non-drive-side"],
        "sent": [
            "Target {adj} spoke tension is {m} kgf; true the rim to within {n} mm.",
            "Torque specification for the {adj} axle nut: {m} Nm ({n} lb-ft).",
            "Q: How long should the sealant cure before riding? A: Wait {n} hours before riding.",
            "Replace the chain when the checker reads {n}.{n2} percent stretch.",
        ]},
    "finance": {
        "title": ["Invoice {m}", "Bank statement notes", "Payment reminder"],
        "domains": ["billing", "paydesk", "invoicely"],
        "adj": ["overdue", "pending", "paid"],
        "sent": [
            "Invoice {m} is {adj} by {n} days; total due: €{m2}.00.",
            "Payment is due by {n} {mon} 2026 to {org}.",
            "Take-home pay is ${m} per month after tax and {n} percent pension.",
            "{org} wants payment before {n} {mon}; late fees are ${n2} per week.",
        ]},
    "hindi": {
        "title": ["दाल तड़का बनाने की विधि", "आसान रसोई टिप्स"],
        "domains": ["rasoi", "ghargharkirasoi"],
        "adj": [""],
        "sent": [
            "दाल को {n} मिनट पकाएं और {m} चम्मच घी में जीरा भूनें।",
            "मसाला तैयार होने पर {n} चम्मच नमक मिलाएं।",
            "पानी {m} मिली डालकर धीमी आंच पर पकाएं।",
        ]},
}
FILLER = [  # generic non-fact sentences for padding
    "Thanks for reading; more notes follow below.", "See the previous section for background.", "This is a short summary of what changed.",
    "Nothing else to report for now.", "Let me know if anything looks off.", "Details are listed in the next paragraph.",
    "We reviewed the options and kept the simplest one.", "The rest is routine and does not need action.",
]
UI_NOISE = ["Accept all cookies", "Subscribe to our newsletter", "Related articles", "Skip to content", "Sign in to continue", "Share this page"]


def fill(rng, topic, template, place=None):
    t = TOPICS[topic]
    d = {
        "n": rng.randint(2, 99), "n2": rng.randint(10, 59), "n3": rng.randint(1, 23), "n4": rng.randint(10, 59), "n5": rng.randint(1, 23),
        "n6": rng.randint(10, 59), "m": rng.randint(100, 9999), "m2": rng.randint(1000, 9999), "adj": rng.choice(t["adj"]),
        "mon": rng.choice(MONTHS), "mon2": rng.choice(MONTHS), "name": rng.choice(NAMES), "org": rng.choice(ORGS), "org2": rng.choice(["MR", "TP", "KQ", "LH"]),
        "place": place or rng.choice(PLACES), "place2": rng.choice(PLACES), "code": rng.choice(["CART", "QTY", "PAY", "SHIP"]) + "-" + str(rng.randint(100, 999)),
        "code2": rng.randint(100, 999) // 1 * 1, "hash": "".join(rng.choice("0123456789abcdef") for _ in range(7)),
    }
    return template.format(**d)


def paragraph(rng, topic, place=None):
    sents = [fill(rng, topic, rng.choice(TOPICS[topic]["sent"]), place) for _ in range(rng.randint(1, 4))]
    if rng.random() < 0.3:
        sents.append(rng.choice(FILLER))
    return " ".join(sents)


# ---------------------------------------------------------------------------------------------------
# mutation of existing text (hard distractors)
# ---------------------------------------------------------------------------------------------------
NUM = re.compile(r"\d[\d,\.]*")


def mutate_numbers(rng, text):
    def repl(m):
        s = m.group(0)
        core = s.rstrip(".,")
        tail = s[len(core):]
        digits = re.sub(r"\D", "", core)
        if not digits:
            return s
        new = str(max(1, int(digits) + rng.choice([-1, 1]) * rng.randint(1, max(2, int(digits) // 5 + 1))))
        if len(new) < len(digits):
            new = new.zfill(len(digits))
        if "," in core and len(new) > 3:
            new = f"{int(new):,}"
        return new + tail
    return NUM.sub(repl, text)


def mutate_names(rng, text, names):
    for n in names:
        if n in text:
            alt = rng.choice([x for x in NAMES if x != n])
            text = re.sub(rf"\b{re.escape(n)}\b", alt, text)
    return text


def mutate_words(rng, text):
    swaps = {"Monday": "Tuesday", "Tuesday": "Wednesday", "Wednesday": "Thursday", "Thursday": "Friday", "Friday": "Monday",
             "January": "March", "February": "April", "March": "May", "April": "June", "May": "July", "June": "August", "July": "September",
             "August": "October", "September": "November", "October": "December", "November": "January", "December": "February",
             "green": "red", "red": "amber", "increase": "decrease", "before": "after", "must": "should", "not": "also"}
    return re.sub(r"\b(" + "|".join(swaps) + r")\b", lambda m: swaps[m.group(1)], text)


# ---------------------------------------------------------------------------------------------------
# fixture plumbing
# ---------------------------------------------------------------------------------------------------
TEXT_ROLES = {"AXStaticText", "AXHeading", "AXTextArea"}


def is_content(node, noise):
    v = node.get("value") or ""
    if node["role"] not in TEXT_ROLES or len(v) < 25 or v in noise:
        return False
    path = " ".join((a.get("name") or "") + " " + a.get("role", "") for a in node.get("ancestor_path", [])).lower()
    return not any(w in path for w in ("sidebar", "chat history", "toolbar", "tab bar"))


def set_text(node, new):
    old = node.get("value") or ""
    node["value"] = new
    nm = node.get("name") or ""
    if nm and old and nm.endswith(old):
        node["name"] = nm[: len(nm) - len(old)] + new
    elif nm == old:
        node["name"] = new


def joined(fx):
    return norm(" ".join((n.get("value") or "") + " " + (n.get("name") or "") for n in fx["roots"]))


def leaks(fx, answers):
    text = joined(fx)
    return [a for a in answers if a in text]


def load_templates(corpus):
    out = []
    for f in sorted(os.listdir(corpus)):
        if not f.endswith(".json") or f.startswith("_") or f.startswith("nav-only"):
            continue
        stem = f[:-5]
        fx = json.load(open(os.path.join(corpus, f)))
        facts_path = os.path.join(os.path.dirname(corpus.rstrip("/")), "pages", stem + ".facts.json")
        noise = set(json.load(open(facts_path)).get("noise_strings") or []) if os.path.exists(facts_path) else set()
        kind = stem.split("-")[0]
        out.append({"stem": stem, "kind": kind, "fx": fx, "noise": noise})
    return out


KIND_WEIGHT = {"article": 40, "chatgpt": 20, "email": 10, "slack": 8, "notes": 6, "messages": 4, "terminal": 4, "xchat": 8}
KIND_TOPICS = {
    "article": ["bread", "home", "health", "outdoors", "money", "travel", "work", "bike", "hindi", "code"],
    "chatgpt": ["health", "money", "travel", "bike", "outdoors", "bread", "code", "work"],
    "email": ["finance", "home", "travel", "health", "work"],
    "slack": ["work", "code"], "notes": ["work", "money", "health", "home"], "messages": ["home", "money", "work"],
    "terminal": ["code"], "xchat": ["work", "finance", "money", "travel"],
}
DOMAIN_TLDS = ["example.org", "example.com", "example.net", "example.in"]


def target_nodes(rng):
    return max(3, min(160, int(rng.lognormvariate(math.log(22), 0.9))))


def clone_with_content(rng, tpl, topic, observed_ms, ident, n_par=None, place=None):
    fx = copy.deepcopy(tpl["fx"])
    noise = tpl["noise"]
    content = [i for i, n in enumerate(fx["roots"]) if is_content(n, noise)]
    want = n_par or target_nodes(rng)
    # grow or shrink the content area to the target paragraph count
    if content:
        proto_idx = content[-1]
        if want > len(content):
            extra = []
            for _ in range(want - len(content)):
                src = copy.deepcopy(fx["roots"][rng.choice(content)])
                extra.append(src)
            fx["roots"][proto_idx + 1:proto_idx + 1] = extra
        elif want < len(content):
            drop = set(rng.sample(content[1:], len(content) - want)) if len(content) > 1 else set()
            fx["roots"] = [n for i, n in enumerate(fx["roots"]) if i not in drop]
    for n in fx["roots"]:
        if is_content(n, noise):
            set_text(n, paragraph(rng, topic, place))
        elif n["role"] in TEXT_ROLES and re.search(r"\d", n.get("value") or "") and (n.get("value") or "") not in noise:
            set_text(n, mutate_numbers(rng, n["value"]))
    t = TOPICS[topic]
    title = fill(rng, topic, rng.choice(t["title"]), place)
    fx["title"] = title
    if fx.get("url"):
        domain = rng.choice(t["domains"]) + "." + rng.choice(DOMAIN_TLDS)
        slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "page"
        if "chatgpt.com" in fx["url"]:
            fx["url"] = "https://chatgpt.com/c/" + "".join(rng.choice("0123456789abcdef") for _ in range(8)) + "-" + slug[:12]
        elif "x.com" in fx["url"]:
            fx["url"] = "https://x.com/i/chat/" + str(rng.randint(1000000, 9999999)) + "-" + slug[:10]
        else:
            fx["url"] = f"https://{domain}/{slug}"
    for n in fx["roots"]:  # keep window-title ancestors consistent
        for a in n.get("ancestor_path", []):
            if a.get("role") == "AXWindow" and a.get("name"):
                a["name"] = title
    fx["observed_ms"] = observed_ms
    fx["also_observed_ms"] = []
    fx["provenance"] = "synthetic_distractor"
    fx["notes"] = f"generated by evals/scale/gen_distractors.py from template {tpl['stem']} ({ident})"
    fx.pop("captured_with", None)
    return fx


def when(rng, near=None):
    if near is not None:
        return near + rng.randint(-3 * 3600_000, 3 * 3600_000)
    if rng.random() < 0.8:
        return CLOCK_MS - rng.randint(30 * DAY, 90 * DAY)
    return CLOCK_MS - rng.randint(0, 29 * DAY)


def variant(rng, fx, kind, topic, tpl):
    v = copy.deepcopy(fx)
    noise = tpl["noise"]
    idxs = [i for i, n in enumerate(v["roots"]) if is_content(n, noise)]
    if kind == "a":  # re-captured: same page seen again later
        v["also_observed_ms"] = [fx["observed_ms"] + rng.randint(60_000, 6 * 3600_000)]
    elif kind == "b" and len(idxs) > 3:  # scrolled: the top scrolls off, new text appears at the bottom
        k = max(1, len(idxs) // 4)
        drop = set(idxs[:k])
        v["roots"] = [n for i, n in enumerate(v["roots"]) if i not in drop]
        last = max(i for i, n in enumerate(v["roots"]) if is_content(n, noise))
        for _ in range(k):
            src = copy.deepcopy(v["roots"][last])
            set_text(src, paragraph(rng, topic))
            v["roots"].insert(last + 1, src)
        v["observed_ms"] = fx["observed_ms"] + rng.randint(30_000, 3600_000)
    elif kind == "c" and idxs:  # edited: one line changes its numbers
        n = v["roots"][rng.choice(idxs)]
        set_text(n, mutate_numbers(rng, n["value"]))
        v["observed_ms"] = fx["observed_ms"] + rng.randint(3600_000, 2 * DAY)
    return v


def hard_clone(rng, src_fx, noise, ident):
    fx = copy.deepcopy(src_fx)
    names = set()
    for n in fx["roots"]:
        names.update(w for w in NAMES + SURNAMES if (n.get("value") or "").find(w) >= 0)
    for n in fx["roots"]:
        if is_content(n, noise) or (n["role"] in TEXT_ROLES and re.search(r"\d", n.get("value") or "")):
            v = n.get("value") or ""
            v = mutate_numbers(rng, v)
            v = mutate_names(rng, v, sorted(names))
            v = mutate_words(rng, v)
            set_text(n, v)
    fx["observed_ms"] = src_fx["observed_ms"] + rng.randint(-3 * 3600_000, 3 * 3600_000)
    fx["also_observed_ms"] = []
    fx["provenance"] = "synthetic_hard_distractor"
    fx["notes"] = f"mutated clone ({ident}): numbers, names, weekdays and months changed"
    fx.pop("captured_with", None)
    return fx


STOP = set("a an the of to in on for and or is are was were what which who whom how when where why do does did i my me we our you your it its this that with at by from as be been about into than then so if not no can could should would will have has had get got".split())


def content_words(q):
    return [w for w in re.findall(r"[A-Za-z0-9ऀ-ॿ\-]+", q) if w.lower() not in STOP and len(w) > 2]


def absent_page(rng, tpl, query, observed_ms, ident):
    words = content_words(query)
    fx = copy.deepcopy(tpl["fx"])
    noise = tpl["noise"]
    phrase = " ".join(words[:4]) or "notes"
    n_par = rng.randint(3, 10)
    content = [i for i, n in enumerate(fx["roots"]) if is_content(n, noise)]
    drop = set(content[n_par:])
    fx["roots"] = [n for i, n in enumerate(fx["roots"]) if i not in drop]
    for n in fx["roots"]:
        if is_content(n, noise):
            w = rng.sample(words, min(len(words), rng.randint(1, 3))) if words else ["notes"]
            set_text(n, f"Notes on {' '.join(w)}: we compared {rng.randint(2, 9)} options for {rng.choice(w)} and wrote down {rng.randint(2, 40)} observations, "
                        f"none of them final. {rng.choice(FILLER)}")
    fx["title"] = f"{phrase.title()} - notes"
    fx["observed_ms"] = observed_ms
    fx["also_observed_ms"] = []
    fx["provenance"] = "synthetic_hard_distractor"
    fx["notes"] = f"shares content words with an absent question ({ident}); answers nothing"
    fx.pop("captured_with", None)
    return fx


def mutate_real(rng, path, observed_ms):
    fx = json.load(open(path))
    names = set()
    for n in fx["roots"]:
        names.update(w for w in NAMES + SURNAMES if (n.get("value") or "").find(w) >= 0)
    for n in fx["roots"]:
        v = n.get("value") or ""
        if n["role"] in TEXT_ROLES and len(v) > 20:
            set_text(n, mutate_words(rng, mutate_names(rng, mutate_numbers(rng, v), sorted(names))))
    fx["provenance"] = "real_mutated"
    fx["observed_ms"] = observed_ms
    fx["also_observed_ms"] = []
    fx["notes"] = "real snapshot with numbers, names, weekdays and months swapped"
    return fx


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--corpus", default="evals/corpus")
    ap.add_argument("--gold", default="evals/gold/gold.jsonl")
    ap.add_argument("--also-gold", action="append", default=[], help="more gold files whose answers must never appear")
    ap.add_argument("--n", type=int, default=1000, help="number of topical pages (families add members on top)")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", required=True)
    ap.add_argument("--hard-per-q", type=int, default=3)
    ap.add_argument("--family-rate", type=float, default=0.25, help="share of topical pages that get near-duplicate variants")
    ap.add_argument("--mutate-real", help="directory of real fixtures to mutate (output stays private)")
    ap.add_argument("--mutate-n", type=int, default=0)
    ap.add_argument("--no-hard", action="store_true")
    a = ap.parse_args()
    rng = random.Random(a.seed)
    os.makedirs(a.out, exist_ok=True)
    for f in os.listdir(a.out):
        if f.endswith(".json"):
            os.remove(os.path.join(a.out, f))

    golds = [json.loads(l) for l in open(a.gold) if l.strip()]
    for extra in a.also_gold:
        golds += [json.loads(l) for l in open(extra) if l.strip()]
    answers = sorted({norm(r["answer_text"]) for g in golds for r in g["relevant"]})
    templates = load_templates(a.corpus)
    by_kind = {}
    for t in templates:
        by_kind.setdefault(t["kind"], []).append(t)
    kinds = [k for k in KIND_WEIGHT if k in by_kind]
    weights = [KIND_WEIGHT[k] for k in kinds]
    stats = {"seed": a.seed, "topical": 0, "family_members": 0, "hard_from_gold": 0, "hard_from_absent": 0, "mutated_real": 0,
             "leaks_repaired": 0, "leaks_dropped": 0, "by_kind": {}, "by_topic": {}, "bodies_chars": []}
    written = []

    def emit(ident, fx):
        bad = leaks(fx, answers)
        if bad:
            stats["leaks_repaired"] += 1
            for stage in (0, 1):
                for n in fx["roots"]:
                    hit = [b for b in bad if b in norm((n.get("value") or "") + " " + (n.get("name") or ""))]
                    if hit and n["role"] in TEXT_ROLES:
                        set_text(n, mutate_words(rng, mutate_numbers(rng, n["value"])) if stage == 0 else rng.choice(FILLER))
                bad = leaks(fx, answers)
                if not bad:
                    break
            if bad:
                stats["leaks_dropped"] += 1
                return False
        with open(os.path.join(a.out, ident + ".json"), "w") as f:
            json.dump(fx, f, ensure_ascii=False, separators=(",", ":"))
        written.append(ident)
        stats["bodies_chars"].append(sum(len(n.get("value") or "") for n in fx["roots"] if n["role"] in TEXT_ROLES))
        return True

    # ---- topical pages and near-duplicate families
    for i in range(a.n):
        kind = rng.choices(kinds, weights)[0]
        tpl = rng.choice(by_kind[kind])
        topic = rng.choice(KIND_TOPICS.get(kind, ["work"]))
        ident = f"syn-{i:06d}"
        fx = clone_with_content(rng, tpl, topic, when(rng), ident)
        if emit(ident, fx):
            stats["topical"] += 1
            stats["by_kind"][kind] = stats["by_kind"].get(kind, 0) + 1
            stats["by_topic"][topic] = stats["by_topic"].get(topic, 0) + 1
            if rng.random() < a.family_rate:
                for suffix in rng.sample("abc", rng.randint(1, 3)):
                    if emit(f"{ident}-{suffix}", variant(rng, fx, suffix, topic, tpl)):
                        stats["family_members"] += 1

    # ---- hard distractors per gold question
    if not a.no_hard:
        rng = random.Random(f"{a.seed}-hard")  # the hard set is identical at every N
        tpl_by_stem = {t["stem"]: t for t in templates}
        for g in golds:
            if g["relevant"]:
                src = {r["fixture"] for r in g["relevant"]}
                for fixture in sorted(src):
                    if fixture not in tpl_by_stem:
                        continue
                    t = tpl_by_stem[fixture]
                    for k in range(a.hard_per_q):
                        ident = f"hard-{g['id']}-{fixture[:14]}-{k}"
                        if emit(ident, hard_clone(rng, t["fx"], t["noise"], ident)):
                            stats["hard_from_gold"] += 1
            else:
                for k in range(max(1, a.hard_per_q - 1)):
                    t = rng.choice(by_kind[rng.choice(kinds)])
                    ident = f"hard-abs{g['id']}-{k}"
                    if emit(ident, absent_page(rng, t, g["query"], when(rng), ident)):
                        stats["hard_from_absent"] += 1

    # ---- optional: mutated real snapshots
    if a.mutate_real and a.mutate_n:
        rng = random.Random(f"{a.seed}-mut")
        files = sorted(f for f in os.listdir(a.mutate_real) if f.endswith(".json"))
        for i, f in enumerate(rng.sample(files, min(a.mutate_n, len(files)))):
            if emit(f"mut-real-{i:05d}", mutate_real(rng, os.path.join(a.mutate_real, f), when(rng))):
                stats["mutated_real"] += 1

    chars = sorted(stats.pop("bodies_chars"))
    stats["text_chars"] = {"n": len(chars), "p10": chars[len(chars) // 10] if chars else 0, "p50": chars[len(chars) // 2] if chars else 0,
                           "p90": chars[int(len(chars) * .9)] if chars else 0, "max": chars[-1] if chars else 0}
    stats["fixtures"] = len(written)
    stats["gold_answers_checked"] = len(answers)
    stats["verified_no_gold_answer_in_any_fixture"] = True
    json.dump(stats, open(os.path.join(a.out, "_manifest.json"), "w"), indent=1)
    print(json.dumps({k: v for k, v in stats.items() if k not in ("by_topic",)}, indent=1))


if __name__ == "__main__":
    main()
