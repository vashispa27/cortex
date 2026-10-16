"""Invented page content + planted facts. Every string is fictional.

Each entry: dict(page=Page, observed="ISO-8601Z", facts=[...], noise=[...],
                 searchable=True, logical={...}, tags=[...])
`facts` are exact strings that must survive cleaning. `noise` are UI strings that
must not appear in the cleaned body.
"""
from templates import (chatgpt_page, xchat_page, slack_page, article_page, email_page,
                       terminal_page, notes_page, newtab_page, messages_page)

SPECS = []


def add(page, observed, facts, noise=(), searchable=True, logical=None, tags=(), also_observed=()):
    SPECS.append(dict(page=page, observed=observed, facts=list(facts), noise=list(noise),
                      searchable=searchable, logical=logical or {}, tags=list(tags),
                      also_observed=list(also_observed)))


CHATGPT_NOISE = ["ChatGPT can make mistakes. Check important info.", "Rate response",
                 "Search chats", "Weekend hike packing list", "Cover letter feedback"]

# ------------------------------------------------------------------ ChatGPT

add(chatgpt_page(
    "chatgpt-nutrition-01", "Macro targets for cutting phase - ChatGPT",
    "Macro targets for cutting phase",
    [("user", "I'm 82 kg, lifting four days a week and cutting. Give me daily macro targets for 2,100 kcal."),
     ("assistant", [("thought", "Thought for 9 seconds"),
                    ("p", "Here are your daily targets for a 2,100 kcal cut at 82 kg:"),
                    ("ul", ["Protein: 165 g", "Carbs: 210 g", "Fat: 35 g"]),
                    ("p", "Protein is set near 2 g per kg of body weight to protect muscle while you lose fat. Keep fat above 30 g so your hormones stay healthy.")]),
     ("user", "I'm at 28 g of fat from food today. What can I add to reach my fat target?"),
     ("assistant", [("p", "You are 7 g short of the 35 g fat target. Add 10 ml olive oil (~80 kcal, 9 g fat) to your dinner salad and you will land at 37 g.")]),
     ("user", "What about carbs on rest days?"),
     ("assistant", [("p", "On rest days drop carbs to 170 g and keep protein at 165 g. The 40 g of carbs you remove is about 160 kcal, which keeps the deficit steady.")]),
     ("user", "How should I time my meals around training?"),
     ("assistant", [("p", "Eat a meal with about 40 g of protein and a moderate amount of carbohydrate two to three hours before lifting. Afterward, have another protein-rich meal within a couple of hours; the exact minute matters far less than hitting the daily total."),
                    ("p", "If you train early and cannot stomach a full meal, a banana and a small yogurt thirty minutes beforehand is enough. Keep caffeine to the first half of the day so it does not cut into your sleep."),
                    ("ul", ["Pre-workout: banana, yogurt, coffee", "Post-workout: eggs, rice, vegetables", "Evening: fish or tofu with a large salad"])]),
     ("user", "Any advice for staying consistent on weekends?"),
     ("assistant", [("p", "Plan one flexible meal per weekend rather than a whole free day. Weigh yourself at the same time each morning and judge progress by the weekly average, because daily weight swings of a kilogram are mostly water."),
                    ("p", "Review the trend every two weeks. If your average weight has not moved after fourteen days, trim about 100 kcal from carbohydrates rather than cutting protein.")])],
    url="https://chatgpt.com/c/6e2f1a90-nutrition", compact=True),
    "2026-10-16T09:30:00Z",
    ["Fat: 35 g", "Protein: 165 g", "Add 10 ml olive oil (~80 kcal, 9 g fat)", "drop carbs to 170 g"],
    CHATGPT_NOISE + ["Thought for 9 seconds"], tags=["chatgpt"])

add(chatgpt_page(
    "chatgpt-lisbon-trip-01", "Lisbon long weekend itinerary - ChatGPT",
    "Lisbon long weekend itinerary",
    [("user", "Plan a 3-day Lisbon trip for November. I land on Friday morning and I am staying in Alfama."),
     ("assistant", [("thought", "Thought for 14 seconds"),
                    ("p", "Day 1 (Friday): Land on flight MR 1347, which arrives at 10:25. Check in at Hotel Alfama Vista on Rua das Gaivotas, then walk up to the Portas do Sol viewpoint for sunset."),
                    ("p", "Day 2 (Saturday): Take the Sintra train from Rossio at 8:40 and book Pena Palace tickets for 11:00. Tickets cost 16 euros per adult."),
                    ("p", "Day 3 (Sunday): Brunch in Principe Real, then catch the 15:50 airport shuttle. Your return flight MR 1352 leaves at 18:15.")]),
     ("user", "Is tram 28 worth it?"),
     ("assistant", [("p", "Tram 28 is crowded after 10:00. Ride it before 9:00 or skip it and walk the Alfama hills instead.")]),
     ("user", "What should I eat? I like seafood but I am not an early dinner person."),
     ("assistant", [("p", "Most kitchens in the old town take orders until 22:00. Try grilled sea bream with boiled potatoes, clams with garlic and coriander, and a custard tart from a bakery for dessert."),
                    ("p", "Book dinner for 21:00 on Saturday; small restaurants fill quickly on weekends even in November. Lunch menus of the day are usually the cheapest way to eat well."),
                    ("ul", ["Saturday lunch: market stalls near the river", "Sunday brunch: Principe Real cafe", "Friday dinner: small tavern in Alfama"])]),
     ("user", "Do I need a transport card?"),
     ("assistant", [("p", "A rechargeable transit card makes the metro, buses and the Sintra line simple, and each journey is cheaper than a paper ticket. Load a modest amount; leftover balance stays on the card for next time."),
                    ("p", "Pack a light rain jacket and comfortable shoes with grip, because the cobbled streets turn slippery in the drizzle that is common in November.")])],
    app_id="com.apple.Safari", article_role="AXGroup",
    url="https://chatgpt.com/c/9b41c7d2-lisbon"),
    "2026-10-14T18:20:00Z",
    ["Land on flight MR 1347, which arrives at 10:25", "Hotel Alfama Vista",
     "Take the Sintra train from Rossio at 8:40", "Pena Palace tickets for 11:00",
     "return flight MR 1352 leaves at 18:15", "Ride it before 9:00"],
    CHATGPT_NOISE + ["Thought for 14 seconds"], tags=["chatgpt"])

# Long thread: deep fact in the middle, plus facts that straddle the 1,600-byte chunk boundary.
# The chunker closes a chunk at every "ChatGPT said:" marker, so a straddle needs one long
# assistant message. `_fit` pads the paragraph before the header so that the header line is the
# last unit that fits in the first 1,600 bytes and the value line starts the next chunk.
_FILLER = ("Take your time with this step and keep the work area clean, because small bits of grit on "
           "the threads or the seating faces are the usual reason a fastener never feels quite right. "
           "Work in good light, keep a rag nearby, and recheck each setting once more before moving on. ")


def _fit(paras, header, target=1594):
    """Pad paras[-1] so the byte offset just after `header` (with its newline) lands on target."""
    def cum(ps):
        return len("ChatGPT said:\n".encode()) + sum(len(p.encode()) + 1 for p in ps) + len(header.encode()) + 1
    ps = list(paras)
    words = _FILLER.split()
    i = 0
    while cum(ps) < target - 1:
        extra = " " + words[i % len(words)]
        if cum(ps) + len(extra.encode()) > target - 1:
            break
        ps[-1] += extra
        i += 1
    ps[-1] = ps[-1].rstrip(",;:") + "."
    return ps


_BIKE_A = [
    "Start by removing the tire, tube and rim strip, then clamp the hub in a truing stand so the axle spins freely. Check the rim for flat spots and dents before you lace anything.",
    "Sort the spokes into two groups. The drive-side spokes are shorter and pull from the right flange, while the non-drive-side spokes are longer. Mixing them up is the most common lacing mistake.",
    "Lace the first set of spokes loosely so each nipple has about four threads showing. Cross each spoke over three others and weave the last crossing under the neighbouring spoke for clearance.",
    "Add a drop of light oil to each spoke thread. This prevents the nipples from seizing and makes later adjustments much easier on a wheel that sees wet roads.",
]
_BIKE_B = [
    "Work around the wheel in quarter turns. Lateral true comes first, then radial true, then dish. Resist the urge to chase one wobble with a single big adjustment because it moves the neighbours too.",
    "Use a tensiometer at the end of each pass. Even tension matters more than hitting a number, and a spread of more than 15 percent between spokes is the usual cause of a wheel going out of true after the first ride.",
    "Stress relieve by squeezing pairs of spokes together with gloved hands, then re-check the true. You will hear small pings as the nipples settle, which is normal.",
    "Target drive-side spoke tension is 110 kgf for this rim, and the non-drive side will land near 70 kgf once the wheel is dished correctly. Do not exceed the rim manufacturer's limit.",
    "If a single spoke keeps losing tension, check the nipple seat for a burr and the spoke bed for a crack. Replacing one spoke is far cheaper than rebuilding the wheel after a failure on the road.",
]
_BIKE_C = [
    "Yes. Over-tightening can crush the bearings and under-tightening lets the cassette body wobble. Before you refit the wheel, clean the dropout faces and add a thin film of grease to the axle threads.",
    "Fit the thru axle through the frame and hub, thread it in by hand until it seats, and only then bring the torque wrench to the fastener. Pull smoothly instead of jerking the handle.",
    "Keep your hand near the head of the wrench, wipe off any excess grease so grit does not stick, and confirm the brake rotor sits centred between the pads on both sides of the caliper.",
    "Spin the wheel to check that nothing rubs, and confirm the quick release lever on the disc side does not point into the rotor before you ride away.",
]
_BIKE_C = _fit(_BIKE_C, "Torque specification for the rear axle nut:")
_BIKE_D = [
    "Tubeless works well on gravel. Use tape that is two millimetres wider than the rim channel and press it down firmly with a rag so no air can pass under it.",
    "Seat the tire with a floor pump that has a booster chamber or a compressor. If the bead refuses to seat, remove the valve core to let more air through for the first rush.",
    "Spin the wheel in all positions after inflating so the sealant coats the whole bead, and ride gently for the first few kilometres.",
]
_BIKE_D = _fit(_BIKE_D, "Q: How long should the sealant cure before riding?")
add(chatgpt_page(
    "chatgpt-bikewheel-long-01", "Rebuilding a rear wheel - ChatGPT", "Rebuilding a rear wheel",
    [("user", "I'm rebuilding the rear wheel on my gravel bike with a new rim and the old hub. Where do I even start?"),
     ("assistant", [("p", p) for p in _BIKE_A]),
     ("user", "Okay, lacing is done. How do I true it?"),
     ("assistant", [("thought", "Thought for 21 seconds")] + [("p", p) for p in _BIKE_B]),
     ("user", "Now I'm mounting it. Do I need a torque wrench for the axle?"),
     ("assistant", [("p", p) for p in _BIKE_C]
      + [("p", "Torque specification for the rear axle nut:"), ("p", "85 Nm (63 lb-ft)"),
         ("p", "Re-check the torque after your first ride, since the bearings seat slightly.")]),
     ("user", "I also want to run tubeless. Any sealant tips?"),
     ("assistant", [("p", p) for p in _BIKE_D]
      + [("p", "Q: How long should the sealant cure before riding?"),
         ("p", "A: Wait 24 hours before riding."),
         ("p", "Top up the sealant every four to six months and carry a tire plug kit for punctures that do not seal.")]),
     ("user", "Last thing: how often should I check the wheel afterwards?"),
     ("assistant", [("p", "Check the true and the spoke tension after the first ride, again after the first 100 km, and then at every service. A wheel that stays quiet and straight through the first month is usually stable for years."),
                    ("p", "Listen for ticking from the hub or spokes; most noises are dry nipples or a loose cassette lockring, both of which take only minutes to fix.")])],
    url="https://chatgpt.com/c/0d77ab3e-wheel", compact=True),
    "2026-10-15T16:00:00Z",
    ["Target drive-side spoke tension is 110 kgf", "Torque specification for the rear axle nut:",
     "85 Nm (63 lb-ft)", "Q: How long should the sealant cure before riding?",
     "A: Wait 24 hours before riding."],
    CHATGPT_NOISE + ["Thought for 21 seconds"], tags=["chatgpt", "long", "boundary"])

# Near-duplicate versions: same app + URL, a decision and amount changed.
_BUDGET_URL = "https://chatgpt.com/c/c3d81f46-budget"
_BUDGET_COMMON_U1 = "I take home $6,200 a month. Help me set a sensible rent cap."
_BUDGET_COMMON_A3 = "Utilities and internet usually add $180 to $240 a month, so keep that out of the rent figure."
for _ver, _cap, _decision, _when in (
        ("v1", "$1,850", "Decision recorded: renew the lease on the Maple Street apartment for 12 months.", "2026-10-10T20:05:00Z"),
        ("v2", "$2,050", "Decision recorded: move to the Corvina Street apartment and keep rent within the cap.", "2026-10-15T08:40:00Z")):
    add(chatgpt_page(
        "chatgpt-budget-%s" % _ver, "Monthly budget planning - ChatGPT", "Monthly budget planning",
        [("user", _BUDGET_COMMON_U1),
         ("assistant", [("p", "A common guideline is 30 percent of take-home pay, which would be $1,860 for you. Given your savings goals I recommend a monthly rent budget capped at %s per month." % _cap)]),
         ("user", "What else should I count besides rent?"),
         ("assistant", [("p", _BUDGET_COMMON_A3)]),
         ("user", "Okay. Let's lock it in."),
         ("assistant", [("p", _decision)]),
         ("user", "What should I do about an emergency fund?"),
         ("assistant", [("p", "Aim for three months of essential expenses in a separate savings account. Automate a transfer on payday so you never have to decide each month whether to save."),
                        ("p", "Start with a small automatic amount and raise it whenever your income rises. Keep the fund in an account that is easy to reach but not linked to your everyday card.")]),
         ("user", "And groceries?"),
         ("assistant", [("p", "A typical single-person grocery budget runs between $400 and $550 a month. Plan meals around what is on sale and buy staples in bulk when the price per unit is clearly lower."),
                        ("p", "Review your actual spending at the end of the month and adjust the next month's plan instead of aiming for perfection.")])],
        url=_BUDGET_URL),
        _when,
        ["monthly rent budget capped at %s per month" % _cap, _decision],
        CHATGPT_NOISE, tags=["chatgpt", "near_duplicate", "contradiction"])

# Same page before / after scrolling: overlapping content, different body.
_GARDEN_URL = "https://chatgpt.com/c/f7a2de09-garden"
_GARDEN = [
    ("user", "What should I plant in my raised beds this autumn? I'm in zone 8b."),
    ("assistant", [("p", "In zone 8b you can still plant spinach, kale and radishes through October. Sow radishes 3 cm apart and thin them to 5 cm once they sprout. Spinach prefers cool soil, so sow it in a lightly shaded corner and keep the bed evenly moist. Kale tolerates frost and gets sweeter after the first cold nights.")]),
    ("user", "And tomatoes for next spring?"),
    ("assistant", [("p", "Start tomato seedlings indoors in February and plant tomatoes 60 cm apart once the last frost has passed. Stake them at planting time. Choose a sunny bed with at least eight hours of direct light, and mix compost into the soil a few weeks beforehand so the roots find plenty of nutrients when they go in.")]),
    ("user", "How do I protect the beds over winter?"),
    ("assistant", [("p", "Cover bare soil with 5 cm of straw mulch so rain does not compact it. A layer of leaves works too, but straw is lighter and lets the soil breathe. Water the beds once before mulching so the moisture is locked in underneath.")]),
    ("user", "When do I plant garlic?"),
    ("assistant", [("p", "Sow garlic cloves on 24 October, pointed end up, 15 cm apart and 5 cm deep. Choose firm, plump bulbs from a seed supplier rather than the supermarket, because they are less likely to carry disease. Water them in once and then leave them alone until spring shoots appear.")]),
    ("user", "Any pests I should watch for?"),
    ("assistant", [("p", "Slugs love young kale. Sprinkle crushed eggshells around the stems and check the beds after rain.")]),
]
add(chatgpt_page("chatgpt-garden-top-01", "Autumn vegetable garden plan - ChatGPT",
                 "Autumn vegetable garden plan", _GARDEN[:6], url=_GARDEN_URL),
    "2026-10-13T10:00:00Z",
    ["Sow radishes 3 cm apart", "plant tomatoes 60 cm apart", "Cover bare soil with 5 cm of straw mulch"],
    CHATGPT_NOISE, tags=["chatgpt", "scroll"])
add(chatgpt_page("chatgpt-garden-scrolled-01", "Autumn vegetable garden plan - ChatGPT",
                 "Autumn vegetable garden plan", _GARDEN[2:], url=_GARDEN_URL, compact=True),
    "2026-10-13T10:06:00Z",
    ["plant tomatoes 60 cm apart", "Cover bare soil with 5 cm of straw mulch",
     "Sow garlic cloves on 24 October", "Sprinkle crushed eggshells around the stems"],
    CHATGPT_NOISE, tags=["chatgpt", "scroll"])

# ------------------------------------------------------------ Multi-speaker chat

_XCONVOS = [("Launch crew", "Mira: I'm out on Wednesday afternoon"), ("Weekend plans", "Sam: see you at 7"),
            ("Book club", "Noor: chapter nine was wild")]
add(xchat_page(
    "xchat-launch-plan-01", "Launch crew / Chat / X", "Launch crew", _XCONVOS,
    [("Lokesh", "10:42 AM", "Beta goes out Thursday at 4 PM."),
     ("Mira", "10:44 AM", "Budget for the launch video is 3,200 euros."),
     ("Lokesh", "10:47 AM", "Can we move the press embargo to 9 AM Friday?"),
     ("Mira", "10:51 AM", "Yes. I'll tell the agency."),
     ("Lokesh", "11:02 AM", "Also the new pricing page goes live with the beta."),
     ("Mira", "11:03 AM", "I'm out on Wednesday afternoon."),
     ("Lokesh", "11:10 AM", "No problem. Can you send the revised script to the agency before you leave?"),
     ("Mira", "11:12 AM", "Sure, I'll attach the storyboard frames as well so they can start on the animatic."),
     ("Lokesh", "11:20 AM", "Legal still needs to review the claims on the pricing page, so please keep the copy generic until they sign off."),
     ("Mira", "11:24 AM", "Understood. I'll mark the sections that need review in yellow."),
     ("Lokesh", "11:31 AM", "Great. Let's do a quick run-through with the whole crew on Wednesday morning."),
     ("Mira", "11:33 AM", "Works for me. I'll book the small meeting room.")],
    url="https://x.com/i/chat/1893042-launch"),
    "2026-10-16T14:05:00Z",
    ["Beta goes out Thursday at 4 PM.", "Budget for the launch video is 3,200 euros.",
     "move the press embargo to 9 AM Friday"],
    ["To view keyboard shortcuts, press question mark", "Weekend plans", "Book club",
     "Chapter nine was wild", "Start a new message"], tags=["xchat", "speaker"])

add(xchat_page(
    "xchat-design-priya-01", "Priya Raman / Chat / X", "Priya Raman", _XCONVOS,
    [("Priya Raman", "3:10 PM", "The logo kerning fix landed in commit a4f9c21."),
     ("You", "3:12 PM", "Great. Did the dark-mode favicon ship too?"),
     ("Priya Raman", "3:15 PM", "Not yet, the favicon ships Monday."),
     ("You", "3:16 PM", "Thanks.")],
    url="https://x.com/i/chat/2201177-design"),
    "2026-10-14T11:00:00Z",
    ["The logo kerning fix landed in commit a4f9c21.", "the favicon ships Monday."],
    ["To view keyboard shortcuts, press question mark", "Weekend plans", "Book club"],
    tags=["xchat", "speaker", "same_first_name"])

add(xchat_page(
    "xchat-finance-priya-01", "Priya Nair / Chat / X", "Priya Nair", _XCONVOS,
    [("Priya Nair", "11:30 AM", "Invoice 4471 is overdue by 12 days."),
     ("You", "11:32 AM", "Which vendor is it?"),
     ("Priya Nair", "11:35 AM", "Harbor Print. They want payment before 30 October.")],
    url="https://x.com/i/chat/2201260-finance"),
    "2026-10-13T15:30:00Z",
    ["Invoice 4471 is overdue by 12 days.", "Harbor Print. They want payment before 30 October."],
    ["To view keyboard shortcuts, press question mark", "Weekend plans", "Book club"],
    tags=["xchat", "speaker", "same_first_name"])

add(slack_page("slack-standup-mon-01", "# standup",
               [("--day--", "Monday, October 12", None),
                ("Lokesh Mehta", "9:12 AM", "Reminder: standup moved to 9:30 AM starting this week."),
                ("Priya Raman", "9:14 AM", "Works for me."),
                ("Dev Anand", "9:20 AM", "I will join from the Pune office."),
                ("Lokesh Mehta", "9:25 AM", "Please keep updates to the three usual questions: what you did, what you will do, and anything blocking you."),
                ("Priya Raman", "9:27 AM", "I will post the design review notes in the thread after lunch."),
                ("Dev Anand", "9:31 AM", "Build is green again after the dependency bump.")]),
    "2026-10-12T09:50:00Z",
    ["Reminder: standup moved to 9:30 AM starting this week."],
    ["# launch-crew", "Direct messages", "Message # standup"],
    tags=["slack", "contradiction"])

add(slack_page("slack-standup-thu-01", "# standup",
               [("--day--", "Thursday, October 15", None),
                ("Lokesh Mehta", "8:55 AM", "Update: standup is now 10:15 AM because of the vendor call."),
                ("Priya Raman", "8:58 AM", "Ok, 10:15 AM it is."),
                ("Dev Anand", "9:01 AM", "Same call link as before."),
                ("Lokesh Mehta", "9:05 AM", "The vendor wants to walk through the integration checklist, so please have your estimates ready."),
                ("Priya Raman", "9:07 AM", "I will bring the updated mockups for the settings screen."),
                ("Dev Anand", "9:12 AM", "I will share the performance numbers from last night's load test.")]),
    "2026-10-15T09:40:00Z",
    ["Update: standup is now 10:15 AM because of the vendor call."],
    ["# launch-crew", "Direct messages", "Message # standup"],
    tags=["slack", "contradiction"])

# ------------------------------------------------------------------- Articles

_BAKER_FOOT = ["© 2026 Baker's Notebook. All rights reserved.", ("Privacy",), ("Terms",),
               ("Subscribe to the newsletter",)]
_BAKER_NAV = ["Recipes", "Techniques", "Equipment", "Newsletter", "About"]
_BAKER_PRE = ["We use cookies to improve your experience.", "Baker's Notebook"] + _BAKER_NAV + [
    "The Long Cold Ferment", "By Anika Rao · 9 October 2026 · 7 min read"]
_BAKER_BLOCKS_1 = [
    ("p", "A slow, cold ferment is the simplest way to build flavor in a sourdough loaf without adding more starter. It trades your attention for time."),
    ("p", "Most of the work happens while you are asleep or at your desk. You mix the dough in the evening, let it rise slowly at room temperature, and then park it in the refrigerator so the flavor keeps developing without the dough over-proofing."),
    ("h", "The schedule"),
    ("ul", ["Mix flour, water and 20 percent starter at 78% hydration.",
            "Bulk ferment for 14 hours at 21 °C.",
            "Shape, then retard in the refrigerator for 12 hours at 4 °C."]),
    ("p", "If your kitchen runs warmer, shorten the bulk rather than raising the starter percentage. A warm kitchen can finish the same job in half the time, so watch the dough rather than the clock."),
    ("p", "Use a clear container so you can see the bubbles forming along the sides. The dough is ready when it has grown by about half and the surface looks domed and slightly glossy."),
]


def _fit_article(blocks, heading, target=1598, lo=1480):
    """Append whole sentences to the last paragraph so `heading` is the last line that fits in
    1,600 bytes (the next paragraph is ~140 bytes, so it then opens the second chunk)."""
    lines = list(_BAKER_PRE)
    for kind, val in blocks:
        lines.extend(val if kind == "ul" else [val])
    base = sum(len(l.encode()) + 1 for l in lines) + len(heading.encode()) + 1
    sentences = [
        " Trust the dough more than the schedule and adjust the timing to your own kitchen.",
        " Different flours drink water at different rates, so treat the hydration as a starting point.",
        " Write down the room temperature each time; it explains most surprises.",
        " A cooler kitchen simply means a longer rise, not a worse loaf.",
        " Keep the starter at a steady feeding routine so the timings stay repeatable.",
        " If the dough looks slack after the first hour, add one extra set of stretch and folds.",
        " Cold dough scores more cleanly, so slash the loaf straight from the refrigerator.",
        " Resist the urge to rush the final proof; a slightly under-proofed loaf is better than a collapsed one.",
    ]
    pad = ""
    for sentence in sentences:
        if base + len(pad.encode()) + len(sentence.encode()) <= target:
            pad += sentence
    assert base + len(pad.encode()) >= lo, (base, len(pad.encode()))
    kind, val = blocks[-1]
    return blocks[:-1] + [(kind, val + pad)]


_BAKER_BLOCKS_1 = _fit_article(_BAKER_BLOCKS_1, "Baking")
_BAKER_BLOCKS_2 = [
    ("h", "Baking"),
    ("p", "Bake in a preheated Dutch oven at 245 °C for 20 minutes lid on, then 22 minutes lid off. Let the loaf cool for an hour before slicing."),
    ("h", "Why the cold works"),
    ("p", "Cold fermentation slows yeast activity more than it slows the bacteria that make acid, so the dough develops tang and aroma without over-proofing. The longer the dough sits, the more the enzymes break down starch into sugars that brown beautifully in the oven."),
    ("p", "A dough that has chilled overnight is also firmer and easier to shape. If the surface feels sticky when you pull it from the refrigerator, dust the top lightly with rice flour before turning it out."),
    ("h", "Troubleshooting"),
    ("ul", ["Flat loaf: the dough was probably over-proofed before it went into the cold.",
            "Dense crumb: extend the stretch and fold sequence during the first two hours.",
            "Pale crust: bake the second stage a few minutes longer until it is deep brown."]),
]
add(article_page(
    "article-sourdough-longferment-01", "Baker's Notebook",
    "The Long Cold Ferment - Baker's Notebook",
    "https://bakersnotebook.example.org/posts/long-cold-ferment",
    _BAKER_NAV,
    "The Long Cold Ferment", "By Anika Rao · 9 October 2026 · 7 min read",
    _BAKER_BLOCKS_1 + _BAKER_BLOCKS_2,
    _BAKER_FOOT, compact=True),
    "2026-10-11T08:00:00Z",
    ["Bulk ferment for 14 hours at 21 °C.", "78% hydration", "245 °C for 20 minutes lid on"],
    ["We use cookies to improve your experience.", "Accept all cookies", "Manage preferences",
     "Subscribe to the newsletter", "© 2026 Baker's Notebook. All rights reserved.",
     "Techniques", "Equipment"], tags=["article", "distractor", "boundary"])

add(article_page(
    "article-sourdough-weekday-02", "Crumb & Crust",
    "A Weekday Sourdough in 6 Hours - Crumb & Crust",
    "https://crumbandcrust.example.com/weekday-loaf",
    ["Home", "Bread", "Pastry", "Shop"],
    "A Weekday Sourdough in 6 Hours", "By Dale Okafor · 2 October 2026 · 5 min read",
    [("p", "You do not need a long cold ferment to get a good sourdough loaf. A warm, fast schedule fits around a working day."),
     ("h", "The schedule"),
     ("ul", ["Mix flour, water and 30 percent starter at 68% hydration.",
             "Bulk ferment for 6 hours at 27 °C.",
             "Shape and proof on the counter for 90 minutes."]),
     ("h", "Baking"),
     ("p", "Bake in a preheated Dutch oven at 230 °C for 25 minutes lid on, then 15 minutes lid off."),
     ("h", "Make it fit your day"),
     ("p", "Feed your starter the night before and mix the dough as soon as you get up. By the time you are back from work the dough is ready to shape, and the loaf is out of the oven before dinner."),
     ("p", "If the kitchen is cold, put the dough in the oven with only the light on. A steady warm spot keeps the schedule predictable from one loaf to the next."),
     ("ul", ["Use a clear container so you can watch the bubbles.", "Mark the starting level with a rubber band.", "Cover with a damp cloth, not a tight lid."])],
    ["© 2026 Crumb & Crust Media.", ("Advertise",), ("Contact",)]),
    "2026-10-09T17:30:00Z",
    ["Bulk ferment for 6 hours at 27 °C.", "68% hydration", "230 °C for 25 minutes lid on"],
    ["We use cookies to improve your experience.", "Accept all cookies", "Manage preferences",
     "© 2026 Crumb & Crust Media.", "Advertise", "Shop"], tags=["article", "distractor"])

_HI_PARAS = [
    ("p", "दाल तड़का भारतीय घरों की सबसे लोकप्रिय दालों में से एक है। इसे चावल या रोटी के साथ परोसा जाता है और यह बनाने में बहुत आसान है।"),
    ("h", "दाल उबालना"),
    ("p", "अरहर की दाल को दो बार धोकर कुकर में डालें, तीन कप पानी और आधा चम्मच हल्दी मिलाएँ। दाल को 25 मिनट तक उबालें, या कुकर की चार सीटी आने तक पकाएँ।"),
    ("p", "उबालने के बाद दाल को चम्मच से हल्का मसल लें ताकि वह गाढ़ी और मुलायम हो जाए। यदि दाल बहुत गाढ़ी लगे तो थोड़ा गरम पानी मिला दें।"),
    ("h", "तड़का लगाना"),
    ("ul", ["एक छोटी कड़ाही में 2 चम्मच घी गरम करें।",
            "आधा चम्मच जीरा और 4 लहसुन की कलियाँ डालें।",
            "सूखी लाल मिर्च और एक कटा हुआ टमाटर डालकर दो मिनट भूनें।",
            "ऊपर से तड़का दाल में डालें और 5 मिनट पकाएँ।"]),
    ("p", "तड़का डालते समय आँच तेज रखें ताकि मसालों की खुशबू अच्छी तरह दाल में मिल जाए। तड़का डालने के बाद बर्तन को तुरंत ढक दें, इससे दाल में धुएँ जैसी सोंधी महक आती है।"),
    ("h", "परोसने का तरीका"),
    ("p", "परोसने से पहले ताज़ा हरा धनिया और नींबू का रस डालें। गरम चावल, पापड़ और सलाद के साथ परोसें। बची हुई दाल को फ्रिज में दो दिन तक रखा जा सकता है।"),
    ("p", "यदि आप दाल को और स्वादिष्ट बनाना चाहते हैं तो अंत में एक चम्मच देसी घी ऊपर से डालें। बच्चों के लिए मिर्च कम रखें और थोड़ा सा गुड़ मिला सकते हैं।"),
]
add(article_page(
    "article-hindi-dal-01", "रसोई", "दाल तड़का बनाने की आसान विधि - रसोई",
    "https://rasoi.example.in/recipes/dal-tadka",
    ["व्यंजन", "सब्ज़ियाँ", "मिठाई", "हमारे बारे में"],
    "दाल तड़का बनाने की आसान विधि", "लेखिका: मीना जोशी · 8 अक्टूबर 2026", _HI_PARAS,
    ["© 2026 रसोई। सर्वाधिकार सुरक्षित।", ("गोपनीयता",), ("संपर्क करें",)],
    lang="hi", cookie_text="हम कुकीज़ का उपयोग करते हैं।",
    cookie_buttons=("सभी स्वीकार करें", "प्राथमिकताएँ"), compact=True),
    "2026-10-12T07:30:00Z",
    ["दाल को 25 मिनट तक उबालें", "एक छोटी कड़ाही में 2 चम्मच घी गरम करें।", "आधा चम्मच जीरा"],
    ["हम कुकीज़ का उपयोग करते हैं।", "सभी स्वीकार करें", "© 2026 रसोई। सर्वाधिकार सुरक्षित।", "संपर्क करें"],
    tags=["article", "non_english"])

add(article_page(
    "article-edge-testplan-01", "QA Handbook", "Checkout Test Plan - Edge Cases - QA Handbook",
    "https://qa.example.org/plans/checkout-test-plan",
    ["Plans", "Checklists", "Tooling", "Contributing"],
    "Checkout test plan: edge cases", "Maintained by the payments QA group · updated 16 October 2026",
    [("p", "This plan covers the checkout flow from cart review to payment confirmation. Each case lists the expected error code."),
     ("h", "Cart cases"),
     ("ul", ["An edge case in this plan: a cart with 0 items and a coupon applied must show error CART-204.",
             "Edge case: a quantity of 10,000 units must be rejected with error QTY-413.",
             "A cart containing only a gift card skips the shipping step."]),
     ("h", "Browser matrix"),
     ("p", "Run the suite on Chrome 130, Safari 19 and Edge 130 before every release."),
     ("h", "Payment cases"),
     ("ul", ["A card declined by the issuer returns the shopper to the payment step with error PAY-102.",
             "A timeout from the payment provider retries once after three seconds and then shows error PAY-408.",
             "A currency mismatch between the cart and the card is blocked before the authorization request."]),
     ("h", "Reporting"),
     ("p", "File defects in the payments board with the case number from this plan, the browser version and a screen recording. Link the build number so the fix can be verified against the same artifact.")],
    ["© 2026 QA Handbook contributors.", ("Edit this page",)], cookie=False),
    "2026-10-16T10:15:00Z",
    ["a cart with 0 items and a coupon applied must show error CART-204",
     "a quantity of 10,000 units must be rejected with error QTY-413",
     "Run the suite on Chrome 130, Safari 19 and Edge 130"],
    ["Edit this page", "Contributing", "© 2026 QA Handbook contributors."], tags=["article", "filter_trap"])

add(article_page(
    "article-terminal-velocity-01", "Physics Daily", "What is terminal velocity? - Physics Daily",
    "https://physicsdaily.example.org/skydiving/terminal-velocity",
    ["Mechanics", "Optics", "Quantum", "Quizzes"],
    "What is terminal velocity?", "By Ines Duarte · 4 October 2026 · 6 min read",
    [("p", "Terminal velocity is the constant speed a falling object reaches when air resistance balances its weight. The object stops accelerating at that point."),
     ("h", "Skydivers"),
     ("p", "A belly-down skydiver reaches a terminal velocity of about 55 m/s (200 km/h). Pulling into a head-down position can raise that to roughly 90 m/s."),
     ("p", "A small steel ball has a much higher terminal velocity than a feather because its weight is large compared with the drag it experiences."),
     ("h", "Why shape matters"),
     ("p", "Drag depends on the cross-sectional area facing the air and on a drag coefficient that captures how streamlined the body is. A flat, spread-out body presents a large area and falls slowly; a narrow, pointed body falls much faster."),
     ("p", "Air density also changes the answer. In thinner air at high altitude the same body falls faster, which is why a jump from very high up begins with extreme speeds before the atmosphere thickens."),
     ("ul", ["Parachute open: a few metres per second", "Cat in a curled posture: slower than most small animals expect", "Raindrop: roughly 9 m/s depending on size"])],
    ["© 2026 Physics Daily.", ("Newsletter",), ("Advertise",)]),
    "2026-10-09T12:00:00Z",
    ["terminal velocity of about 55 m/s (200 km/h)", "roughly 90 m/s"],
    ["We use cookies to improve your experience.", "Accept all cookies", "© 2026 Physics Daily.",
     "Quizzes", "Advertise"], tags=["article", "filter_trap"])

# ---------------------------------------------------------------------- Email

_OTHER_MAIL = [("Harbor Print Billing", "Invoice 4471", "Please find invoice 4471 attached."),
               ("Campus Library", "Your hold is ready", "The book you requested is waiting at the desk."),
               ("Orbit Bank", "Monthly statement", "Your October statement is available online.")]
add(email_page(
    "email-invoice-4471-01", "Invoice 4471 - Harbor Print",
    "Harbor Print Billing <billing@harborprint.example.com>", "You", "13 October 2026 at 8:42 AM",
    ["Hello, please find invoice 4471 for the October print run.",
     "Total due: €2,380.00.",
     "Payment is due by 30 October 2026. Late payments incur a 2% monthly fee.",
     "Bank transfer reference: HP-4471-2026.",
     "If you have already paid, please disregard this reminder and send the remittance advice to the address above so we can reconcile it.",
     "For questions about quantities or paper stock, reply to this email and our account team will respond within two business days.",
     "This email was sent because you are a customer of Harbor Print. Unsubscribe from billing reminders."],
    _OTHER_MAIL),
    "2026-10-13T09:00:00Z",
    ["Total due: €2,380.00.", "Payment is due by 30 October 2026.", "Bank transfer reference: HP-4471-2026."],
    ["Archive", "Reply All", "Mailboxes", "Your hold is ready", "Monthly statement"],
    tags=["email", "seen_again"], also_observed=["2026-10-16T09:00:00Z"])

add(email_page(
    "email-flight-confirmation-01", "Your booking confirmation - MR 1347",
    "Meridian Air Reservations <noreply@meridianair.example.com>", "You", "14 October 2026 at 9:03 AM",
    ["Thank you for booking with Meridian Air.",
     "Booking reference: QK7M2P.",
     "Outbound: Friday 20 November 2026, flight MR 1347 departs 07:55 and arrives 10:25.",
     "Return: Sunday 22 November 2026, flight MR 1352 departs 18:15.",
     "Baggage: one cabin bag up to 8 kg is included.",
     "Check-in opens 24 hours before departure and closes 60 minutes before departure. Please arrive at the airport at least two hours before your flight.",
     "Seat selection is free at check-in. Changes to your booking are possible up to 48 hours before departure for a small fee.",
     "Manage your booking online at any time before check-in closes."],
    _OTHER_MAIL),
    "2026-10-14T09:10:00Z",
    ["Booking reference: QK7M2P.", "flight MR 1347 departs 07:55 and arrives 10:25",
     "Baggage: one cabin bag up to 8 kg is included."],
    ["Archive", "Reply All", "Mailboxes", "Your hold is ready", "Monthly statement"],
    tags=["email", "multi_snapshot"])

# ------------------------------------------------------------------- Terminal

_TERM = """Last login: Fri Oct 16 16:02:11 on ttys003
dev@orbit-mbp invoice-svc % cargo test
   Compiling invoice-svc v0.4.2 (/Users/dev/invoice-svc)
error[E0382]: borrow of moved value: `config`
  --> src/billing.rs:88:21
   |
84 |     let config = load_config()?;
85 |     let client = Client::new(config);
   |                                ------ value moved here
88 |     println!("{}", config.region);
   |                    ^^^^^^^^^^^^^ value borrowed here after move
error: could not compile `invoice-svc` (lib test) due to 1 previous error
dev@orbit-mbp invoice-svc % cargo test -- --nocapture
   Compiling invoice-svc v0.4.2 (/Users/dev/invoice-svc)
    Finished test [unoptimized + debuginfo] target(s) in 4.12s
     Running unittests src/lib.rs
running 43 tests
test billing::tests::rounds_half_up ... FAILED
test ledger::tests::negative_balance ... FAILED
test result: FAILED. 41 passed; 2 failed; 0 ignored; 0 measured
failures:
    billing::tests::rounds_half_up
    ledger::tests::negative_balance
dev@orbit-mbp invoice-svc % git stash
Saved working directory and index state WIP on main: 3fa91c2 bump serde
dev@orbit-mbp invoice-svc % """
add(terminal_page("terminal-cargo-test-01", "Terminal - cargo test - 100x30", _TERM),
    "2026-10-16T16:20:00Z",
    ["error[E0382]: borrow of moved value: `config`", "41 passed; 2 failed", "billing::tests::rounds_half_up"],
    [], tags=["terminal"])

# ------------------------------------------------------------------ Messages

add(messages_page(
    "messages-landlord-01", "Dolores Whitfield",
    [("Dolores Whitfield", "Hi, your deposit..."), ("Sam", "see you at 7"), ("Noor", "chapter nine was wild")],
    ["Hi, your deposit of $1,200 will be returned by 5 November.",
     "Thanks. Please send it to the same account.",
     "Will do. Keys are due back on 31 October."]),
    "2026-10-15T13:30:00Z",
    ["deposit of $1,200 will be returned by 5 November", "Keys are due back on 31 October."],
    ["iMessage", "Weekend plans", "Send"], tags=["messages", "filter_trap"])

# ---------------------------------------------------------------------- Notes

_Q4 = """Q4 planning notes

Goals
- Ship v2 onboarding by 20 November
- Cut the support backlog below 40 tickets
- Hire one more backend engineer by 15 December

Risks
- Design review slips past 30 October
- Vendor contract renewal on 1 December

Open questions
- Who owns the migration runbook?
"""
_NOTES_OTHERS = [("Groceries and errands", "Today"), ("Q4 planning notes", "Yesterday"),
                 ("Book list", "Last week")]
add(notes_page("notes-q4-plan-01", "Q4 planning notes", _Q4, "Work", _NOTES_OTHERS),
    "2026-10-16T08:00:00Z",
    ["Ship v2 onboarding by 20 November", "Cut the support backlog below 40 tickets",
     "Design review slips past 30 October"],
    ["Recently Deleted", "iCloud", "Book list", "New Note"], tags=["notes"])

_GROC = """Groceries and errands

Groceries
- oat milk, 2 L
- eggs, 12
- spinach
- basmati rice, 5 kg

Errands
- pick up dry cleaning before 6 PM
- return library books
"""
add(notes_page("notes-groceries-01", "Groceries and errands", _GROC, "Personal", _NOTES_OTHERS),
    "2026-10-17T08:15:00Z",
    ["oat milk, 2 L", "basmati rice, 5 kg", "pick up dry cleaning before 6 PM"],
    ["Recently Deleted", "iCloud", "Book list", "New Note"], tags=["notes", "today"])

# ------------------------------------------------------------ Navigation only

add(newtab_page("nav-only-newtab-01"),
    "2026-10-16T22:00:00Z", [],
    ["Gmail", "Calendar", "Customize Chrome", "Most visited"], searchable=False, tags=["navigation_only"])


# ================================================================== Fix 0 additions
# Hand-authored (provenance hand_authored) until the user runs evals/CAPTURE.md for them.

def _simulate_chunks(lines, target=1600):
    """Mirror of cleaner::chunks for a single-message body: returns [(start, end)] byte spans."""
    units, pos = [], 0
    for line in lines:
        n = len(line.encode()) + 1
        units.append((pos, pos + n))
        pos += n
    chunks, start = [], 0
    for u_start, nxt in units:
        if u_start > start and nxt - start > target:
            chunks.append((start, u_start))
            start = u_start
    chunks.append((start, pos))
    return chunks


# ---- macros table: the answer chunk does not contain the query word "macros"
add(chatgpt_page(
    "chatgpt-macros-table-01", "Daily macros plan - ChatGPT", "Daily macros plan",
    [("user", "Can you set up my daily macros? I weigh 74 kg and eat about 2,000 kcal a day."),
     ("assistant", [("p", "Sure. I will set your macros from 2 g of protein per kilogram of body weight, about 35 g of fat, and the rest as carbohydrate. Tell me when you want the table.")]),
     ("user", "Great, show me the table."),
     ("assistant", [("p", "Protein 137 g | Fat 35 g | Carbs 185 g")])],
    url="https://chatgpt.com/c/a41d77c0-macros"),
    "2026-10-16T19:10:00Z",
    ["Protein 137 g | Fat 35 g | Carbs 185 g"], CHATGPT_NOISE, tags=["chatgpt", "macros_table"])

# ---- roofing quote, revised: same title and app, the amount and validity change
for _ver, _total, _valid, _when in (
        ("v1", "Total: €4,800.00. This quote is valid until 31 October 2026.", None, "2026-10-08T10:00:00Z"),
        ("v2", "Revised total: €5,350.00 after the additional flashing work. This revised quote is valid until 15 November 2026.", None, "2026-10-12T10:00:00Z")):
    add(email_page(
        "email-quote-roofing-%s" % _ver, "Roof repair quote 2209 - Alder & Finch",
        "Alder & Finch Roofing <quotes@alderfinch.example.com>", "You",
        "8 October 2026 at 9:41 AM" if _ver == "v1" else "12 October 2026 at 9:12 AM",
        ["Dear customer, thank you for inviting us to inspect your roof.",
         "Quote 2209 covers replacing 38 damaged tiles, repairing the ridge and sealing the chimney flashing.",
         _total,
         "To accept, reply to this email or call our office on weekday mornings."],
        _OTHER_MAIL),
        _when,
        [_total.split(". ")[0] + "."],
        ["Archive", "Reply All", "Mailboxes", "Your hold is ready", "Monthly statement"],
        tags=["email", "near_duplicate"])

# ---- September pages for "last month"
add(article_page(
    "article-marathon-training-01", "Runner's Weekly", "A 16-Week Marathon Plan - Runner's Weekly",
    "https://runnersweekly.example.org/plans/marathon-16-week",
    ["Plans", "Gear", "Nutrition", "Races"],
    "A 16-Week Marathon Plan", "By Gita Menon · 15 September 2026 · 8 min read",
    [("p", "This plan builds from 30 km a week to a 60 km peak over sixteen weeks, with one rest day and one cross-training day each week."),
     ("h", "The weekly shape"),
     ("ul", ["Tuesday: intervals on a track or flat road.", "Thursday: tempo run of 8 to 12 km.",
             "Sunday long run: 28 km at easy pace in peak weeks."]),
     ("p", "Taper starts three weeks before race day. Cut the weekly distance by about 20 percent each week and keep the intensity of the Thursday tempo."),
     ("p", "Practice your race-day breakfast on every long run so nothing is new on the morning.")],
    ["© 2026 Runner's Weekly.", ("Advertise",), ("Contact",)]),
    "2026-09-18T07:00:00Z",
    ["Sunday long run: 28 km at easy pace", "Taper starts three weeks before race day"],
    ["We use cookies to improve your experience.", "Accept all cookies", "© 2026 Runner's Weekly.", "Advertise"],
    tags=["article", "september"])

add(email_page(
    "email-gym-membership-01", "Your membership renewal - Northside Gym",
    "Northside Gym <hello@northsidegym.example.com>", "You", "25 September 2026 at 8:15 AM",
    ["Hi, this is a reminder from Northside Gym.",
     "Your membership renews on 14 October 2026 at €39.90 per month.",
     "To pause or cancel, visit the front desk at least seven days before the renewal date.",
     "Thank you for training with us."],
    _OTHER_MAIL),
    "2026-09-25T09:00:00Z",
    ["Your membership renews on 14 October 2026 at €39.90 per month."],
    ["Archive", "Reply All", "Mailboxes", "Your hold is ready", "Monthly statement"],
    tags=["email", "september"])

# ---- ordinary-word pages: the title or body uses an app word as plain English
_SMALL_FOOT = lambda site: ["© 2026 %s." % site, ("About",), ("Contact",)]


def _small_article(stem, site, title, url, nav, headline, byline, blocks, observed, facts, tags, app="com.apple.Safari"):
    add(article_page(stem, site, title, url, nav, headline, byline, blocks, _SMALL_FOOT(site), app_id=app),
        observed, facts,
        ["We use cookies to improve your experience.", "Accept all cookies", "© 2026 %s." % site],
        tags=["article", "filter_trap"] + tags)


_small_article(
    "article-climbing-slack-01", "Climb Hub", "Rope Management for Beginners - Climb Hub",
    "https://climbhub.example.org/skills/rope-management", ["Skills", "Gear", "Gyms", "Forum"],
    "Rope management for beginners", "By Tomas Alvarez · 6 October 2026 · 5 min read",
    [("p", "A tidy rope keeps both partners safe. Flake the rope on a tarp before every pitch so it feeds without tangles."),
     ("h", "Slack"),
     ("p", "When belaying a leader, leave about 1 m of slack in the rope between climber and belayer so a clip never gets pulled tight. Take in slack as soon as the climber stops moving."),
     ("p", "A belayer who stands too far from the wall adds slack to the system and lengthens any fall.")],
    "2026-10-10T11:00:00Z", ["leave about 1 m of slack in the rope between climber and belayer"], [])
_small_article(
    "article-chrome-plating-01", "Finishing Today", "How Chrome Plating Works - Finishing Today",
    "https://finishingtoday.example.com/processes/chrome-plating", ["Processes", "Coatings", "Safety", "Suppliers"],
    "How chrome plating works", "By Ravi Shetty · 1 October 2026 · 6 min read",
    [("p", "Decorative chrome plating is a thin layer of chromium over a nickel base. The shine comes from the nickel, not the chromium."),
     ("p", "Chrome plating needs a 25 micron nickel layer before the chromium is applied, and the part must be degreased and activated first."),
     ("p", "Hexavalent chromium baths are hazardous; work only with fume extraction and the protective equipment required locally.")],
    "2026-10-09T14:30:00Z", ["Chrome plating needs a 25 micron nickel layer before the chromium is applied"], [])
_small_article(
    "article-safari-kenya-01", "Travelwise", "Planning a Kenya Safari - Travelwise",
    "https://travelwise.example.org/kenya/safari", ["Africa", "Asia", "Europe", "Tips"],
    "Planning a Kenya safari", "By Wanjiru Kamau · 29 September 2026 · 7 min read",
    [("p", "Kenya offers some of the best game viewing on the continent, from the Maasai Mara to Amboseli."),
     ("p", "The best months for a safari in Kenya are July to October, when the wildebeest cross the Mara River and the grass is short."),
     ("p", "Park fees are $70 per person per day in most reserves, with higher rates in the Mara during peak season.")],
    "2026-10-05T09:00:00Z", ["The best months for a safari in Kenya are July to October"], [])
_small_article(
    "article-airport-terminal-01", "Flight Facts", "Lisbon Airport Guide - Flight Facts",
    "https://flightfacts.example.org/lisbon/airport", ["Airports", "Airlines", "Lounges", "Parking"],
    "Lisbon airport guide", "By Flight Facts staff · updated 12 October 2026",
    [("p", "Lisbon airport has two passenger buildings and a short walkway between them."),
     ("p", "Meridian Air departures use Terminal 2. Check-in desks open three hours before departure and close 60 minutes before."),
     ("p", "The metro station is a five-minute walk from arrivals and runs every ten minutes until the early morning.")],
    "2026-10-12T16:45:00Z", ["Meridian Air departures use Terminal 2"], [])
_small_article(
    "article-speaker-notes-01", "Slide Craft", "Writing Speaker Notes - Slide Craft",
    "https://slidecraft.example.org/guide/speaker-notes", ["Guides", "Templates", "Examples", "Blog"],
    "Writing speaker notes", "By Hana Ito · 3 October 2026 · 4 min read",
    [("p", "Speaker notes are a prompt for you, not a script to read aloud. Write the point of the slide, one example and the transition."),
     ("p", "Keep speaker notes under 120 words per slide so you can scan them in a glance while presenting."),
     ("p", "Rehearse once with the notes hidden to check you can carry the talk without them.")],
    "2026-10-07T18:20:00Z", ["Keep speaker notes under 120 words per slide"], [])
_small_article(
    "article-error-messages-01", "UX Writing", "Writing Good Error Messages - UX Writing",
    "https://uxwriting.example.org/patterns/error-messages", ["Patterns", "Voice", "Checklists", "Podcast"],
    "Writing good error messages", "By Chidi Okoro · 8 October 2026 · 5 min read",
    [("p", "An error message should say what happened, why, and what the person can do next, in plain language."),
     ("p", "Error messages should be under 80 characters and say how to fix the problem. Avoid codes without a sentence beside them."),
     ("p", "Place the message next to the field that caused it, and keep the person's input in place.")],
    "2026-10-08T10:30:00Z", ["Error messages should be under 80 characters and say how to fix the problem."], [])

# ---- long article with two label/value straddles (tuned so each boundary falls between label and value)
_REN_SITE = "Home Projects"
_REN_NAV = ["Kitchens", "Bathrooms", "Budgets", "Tools"]
_REN_PRE = ["We use cookies to improve your experience.", _REN_SITE] + _REN_NAV + [
    "Planning a kitchen renovation", "By Elena Petrov · 12 October 2026 · 9 min read"]
_REN_SENT = [
    " Leave a contingency of about ten percent for surprises behind the walls.",
    " Take photographs of every wall before demolition so the services can be located later.",
    " Order long-lead items first and confirm delivery dates in writing.",
    " Keep a single folder for receipts, warranties and the electrician's certificate.",
    " Measure twice, then ask the installer to measure once more before anything is cut.",
    " Protect the floors with hardboard rather than thin sheeting, because tools get dropped.",
    " Agree the daily working hours with the neighbours in advance.",
    " Check the water shut-off valve works before the plumber arrives.",
]


_REN_MID = [
    "Once the carcasses are in, the worktop is templated. Measure after the cabinets are fixed, never before, because even a small shift in a base unit changes the overhang.",
    "Plan the splashback at the same time as the worktop. Tiles, glass and upstands each need a different gap at the wall, and the supplier will ask for the finished thickness.",
    "Appliance cut-outs must be confirmed against the manufacturer's drawings, not the brochure. An integrated oven needs ventilation behind the housing, and a hob needs clearance below for the cables.",
    "Schedule the electrician for first fix before the plasterer and for second fix after the painter. Sockets set too early are the most common cause of chipped paint and repeated call-outs.",
]


def _ren_blocks(pad1, pad2):
    return [
        ("p", "A kitchen renovation is mostly planning. The order of trades matters more than the choice of tiles, and a good schedule saves weeks." + pad1),
        ("h", "Cabinet install checklist:"),
        ("ul", ["Level the base units to within 2 mm across the run.",
                "Fix the wall units to studs, not only to plasterboard.",
                "Leave a 3 mm gap at the wall for scribing.",
                "Fit the plinth last so it can be adjusted."]),
    ] + [("p", t) for t in _REN_MID[:-1]] + [
        ("p", _REN_MID[-1] + pad2),
        ("p", "Countertop lead time:"),
        ("p", "6 weeks for stone or 2 weeks for laminate."),
        ("p", "Order the sink and tap at the same time so the cut-outs match."),
    ]


def _ren_lines(blocks):
    lines = list(_REN_PRE)
    for kind, val in blocks:
        lines.extend(val if kind == "ul" else [val])
    return lines


def _cut_lines(blocks):
    lines = _ren_lines(blocks)
    ends, pos = {}, 0
    for l in lines:
        pos += len(l.encode()) + 1
        ends[pos] = l
    return [ends.get(e) for (_, e) in _simulate_chunks(lines)[:-1]]


_REN_WORDS = ("keep the site tidy and label every box so the right parts reach the right room on the "
              "right day without anyone opening them twice").split()


def _fill(make_blocks, which, want):
    """Append words to one pad until the `which`-th cut lands after the wanted line."""
    pad, i = "", 0
    while i < 400:
        blocks = make_blocks(pad)
        cuts = _cut_lines(blocks)
        if len(cuts) > which and cuts[which] == want:
            return pad
        trial = pad + " " + _REN_WORDS[i % len(_REN_WORDS)]
        # stop growing once the label has moved past the cut (cut came earlier than wanted)
        pad, i = trial, i + 1
    raise AssertionError("could not tune the renovation page")


def _tune_renovation():
    pad1 = _fill(lambda p: _ren_blocks(p, ""), 0, "Cabinet install checklist:")
    pad2 = _fill(lambda p: _ren_blocks(pad1, p), 1, "Countertop lead time:")
    return _ren_blocks(pad1, pad2)


_REN_BLOCKS = _tune_renovation()
add(article_page(
    "article-kitchen-reno-01", _REN_SITE, "Planning a Kitchen Renovation - Home Projects",
    "https://homeprojects.example.org/kitchens/renovation-planning", _REN_NAV,
    "Planning a kitchen renovation", "By Elena Petrov · 12 October 2026 · 9 min read",
    _REN_BLOCKS, ["© 2026 Home Projects.", ("About",), ("Contact",)], compact=True),
    "2026-10-13T14:00:00Z",
    ["Cabinet install checklist:", "Level the base units to within 2 mm across the run.",
     "Countertop lead time:", "6 weeks for stone or 2 weeks for laminate."],
    ["We use cookies to improve your experience.", "Accept all cookies", "© 2026 Home Projects.", "Bathrooms"],
    tags=["article", "long", "boundary"])
