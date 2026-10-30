"""Package individually authored examples; never synthesize or template user messages.

Row fields are literal messages and labels. Helpers only construct context, expand
explicit timing annotations, and serialize records. Run with Python 3.10+.
"""
import calendar
import json
import random
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ROWS = []
TZ = 'Asia/Kolkata'

def timing(spec, now):
    p = spec.split()
    if p[0] == '+':
        return {'type': 'once', 'local_at': (now + timedelta(minutes=int(p[1]))).isoformat(timespec='minutes')}
    if p[0] in ('tomorrow', 'today'):
        d = now + timedelta(days=p[0] == 'tomorrow')
        return {'type': 'once', 'local_at': f'{d:%Y-%m-%d}T{p[1]}'}
    if p[0] == 'weekday':
        h, m = map(int, p[2].split(':'))
        d = now.replace(hour=h, minute=m) + timedelta(days=(int(p[1])-now.isoweekday()) % 7)
        if d <= now:
            d += timedelta(days=7)
        return {'type': 'once', 'local_at': d.isoformat(timespec='minutes')}
    if p[0] == 'date':
        day, clock = int(p[1]), p[2]
        year, month = now.year, now.month
        while True:
            if day <= calendar.monthrange(year, month)[1]:
                d = datetime.fromisoformat(f'{year:04}-{month:02}-{day:02}T{clock}')
                if d > now:
                    return {'type': 'once', 'local_at': d.isoformat(timespec='minutes')}
            month += 1
            if month == 13:
                year, month = year + 1, 1
    if p[0] == 'daily':
        return {'type': 'daily', 'time': p[1], **({'weekdays': list(map(int, p[2].split(',')))} if len(p)>2 else {})}
    if p[0] == 'monthly':
        return {'type': 'monthly', 'day': int(p[1]), 'time': p[2]}
    if p[0] == 'interval':
        result = {'type': 'interval', 'every_minutes': int(p[1])}
        if len(p)>2:
            result.update(start_local=f'{now:%Y-%m-%d}T{p[2]}', window_start=p[2], window_end=p[3])
            if len(p)>4:
                result['weekdays'] = list(map(int,p[4].split(',')))
        else:
            result['start_local'] = (now+timedelta(minutes=int(p[1]))).isoformat(timespec='minutes')
        return result
    raise ValueError(spec)

BACKGROUND = [
    ('Refill bird feeder', 'daily 07:15'), ('Rotate backup drive', 'daily 20:45 7'),
    ('Order coffee beans', 'monthly 17 10:00'), ('Check balcony seedlings', 'daily 18:15'),
    ('Clean desk fan', 'daily 11:00 6'), ('Water orchid', 'daily 08:15 2,5'),
    ('Review library loans', 'monthly 23 16:00'), ('Rest eyes', 'interval 60 09:00 18:00'),
]

def schedule(title, spec, now, ident='s-target', status='active'):
    return {'id': ident, 'title': title, 'status': status, 'timing': timing(spec, now), 'timezone': TZ, 'next': None}

def add(split, kind, scenario, block, mode=None):
    for line in block.strip().splitlines():
        if not line.strip():
            continue
        fields = [f.strip() for f in line.split('|')]
        idx = len(ROWS)
        # Independent clocks, including month ends, leap-year February and all weekdays.
        dates = ['2026-11-03','2026-11-30','2026-12-31','2027-01-01','2027-02-28','2027-03-31','2027-04-30','2027-05-17','2027-06-06','2027-07-24','2027-08-19','2028-02-29','2026-10-30','2027-09-12']
        hours = ['00:13','06:42','10:17','13:56','16:08','19:23','23:48']
        now = datetime.fromisoformat(dates[idx % len(dates)]+'T'+hours[(idx//len(dates)+idx)%len(hours)])
        message = fields[0]
        # Explicit today examples need a clock preceding their stated appointment.
        if any(f.startswith('today ') for f in fields[1:]):
            now = now.replace(hour=0, minute=13)
        schedules = [schedule(t,s,now,f's-bg-{j}', 'paused' if (idx+j)%5==0 else 'active') for j,(t,s) in enumerate(random.Random(idx).sample(BACKGROUND,idx%9))]
        situation = dict(now=now.isoformat(timespec='minutes')+'+05:30', weekday=now.strftime('%A'), timezone=TZ,
                         schedules=schedules, facts=random.Random(idx+3000).sample([{'subject':name,'attribute':attr} for name,attr in [('Leena','company'),('Tariq','email'),('Bianca','birthday'),('Nolan','phone'),('Esme','address'),('Dario','role'),('Pia','anniversary'),('Chloe','company')]],idx%6), recent_turns=[], pending_draft=None)
        if kind in ('new_reminder_once','new_reminder_repeating'):
            expected = dict(action='create_reminder', message=fields[1], timing=timing(fields[2],now))
        elif kind=='new_task':
            expected = dict(action='create_task', prompt=fields[1], timing=timing(fields[2],now), requires_live_sources=fields[3]=='live')
        elif kind=='manage_reminder':
            title, op, detail = fields[1:4]
            oldspec = fields[4] if len(fields)>4 else 'daily 09:20'
            schedules[:] = schedules[:6] + [schedule(title,oldspec,now,status='paused' if op=='resume_schedule' else 'active')]
            expected = dict(action=op, schedule_id='s-target')
            if op=='snooze_schedule': expected['minutes']=int(detail)
            elif op=='update_schedule':
                if detail.startswith('text:'): expected['message']=detail[5:]
                elif detail.startswith('title:'): expected['title']=detail[6:]
                else: expected['timing']=timing(detail,now)
        elif kind=='list_reminders':
            expected = {'action':'list_schedules'}
        elif kind=='save_fact':
            subject, attribute, value = fields[1:4]
            update = len(fields)>4 and fields[4]=='update'
            if update: situation['facts'].append(dict(subject=subject,attribute=attribute))
            expected = dict(action='update_fact' if update else 'remember_fact', subject=subject, attribute=attribute, value=value)
        elif kind=='plain_question':
            expected = {'action':'answer'}
            if len(fields)>1:
                situation['recent_turns'] = [{'role':'user','content':fields[1]}, {'role':'assistant','content':fields[2]}]
        elif kind=='follow_up':
            reason = mode
            expected = dict(action='clarify', question=fields[1])
            if reason=='time':
                expected['message']=fields[2]
                if len(fields)>3: expected['timing']={'type':fields[3], **({'weekdays':[1,2,3,4,5]} if len(fields)>4 and fields[4]=='weekdays' else {})}
            elif reason=='ampm': expected['message']=fields[2]
            elif reason=='subject': expected['timing']=timing(fields[2],now)
            elif reason=='multiple':
                status='paused' if 'resume' in message.lower() or 'back on' in message.lower() else 'active'
                schedules[:]=schedules[:6]+[schedule(fields[2],'daily 07:00',now,'s-choice-a',status),schedule(fields[3],'daily 19:00',now,'s-choice-b',status)]
            elif reason=='none':
                pass
            elif reason=='reference': expected['timing']=timing(fields[2],now)
            else: raise ValueError(reason)
        elif kind=='answer_follow_up':
            # Each row supplies the original request, the actual assistant question, and literal reply.
            original, question, content, spec = fields[1:5]
            row_mode = mode
            # A mixed incomplete-reply block may also contain complete replies. A timing annotation marks
            # them; the reply being the reminder text means the draft already had the time.
            if mode == 'still' and spec.split()[0] in ('+', 'today', 'tomorrow', 'weekday', 'date', 'daily', 'monthly', 'interval'):
                row_mode = 'subject' if message.rstrip('.!') == content else None
            situation['pending_draft']={'message': content, 'user_text':original}
            situation['recent_turns']=[{'role':'user','content':original},{'role':'assistant','content':question}]
            if row_mode=='subject':
                situation['pending_draft']={'timing':timing(spec,now),'user_text':original}
            if row_mode=='still':
                expected={'action':'clarify','question':spec,'message':content}
                if message=='Every weekday.': expected['timing']={'type':'daily','weekdays':[1,2,3,4,5]}
            else:
                expected={'action':'create_reminder','message':content,'timing':timing(spec,now)}
        elif kind=='context_reminder':
            raise ValueError('Use contextual()')
        else: raise ValueError(kind)
        ROWS.append(dict(id=f'r-{idx+1:04}',kind=kind,scenario=scenario,situation=situation,message=message,expected=expected,_split=split))

def contextual(split,scenario,block):
    start=len(ROWS)
    lines=block.strip().splitlines()
    for line in lines:
        message, content, spec, prior = [f.strip() for f in line.split('|')]
        add(split,'new_reminder_once',scenario,f'{message}|{content}|{spec}')
        ROWS[-1]['situation']['recent_turns']=[{'role':'user','content':prior},{'role':'assistant','content':'Got it.'}]

# User messages below are individually written, with explicit labels.
add('train','new_reminder_once','kitchen-countdown', '''
The dough needs another 35 minutes. Remind me to fold it then.|Fold the dough|+ 35
ping me in twenty mins about the rice|Check the rice|+ 20
Set a timer reminder for checking the lentils in half an hour.|Check the lentils|+ 30
Could you nudge me to drain the pasta twelve minutes from now?|Drain the pasta|+ 12
in 90 minutes remind me that the yoghurt should go in the fridge|Put the yoghurt in the fridge|+ 90
I put tea in to steep; remind me to strain it after 4 minutes.|Strain the tea|+ 4
Give me a reminder in an hour to switch off the slow cooker.|Switch off the slow cooker|+ 60
need to flip the tray in 18 mins, remind me pls|Flip the tray|+ 18
Remind me about the sourdough starter after six hours.|Check the sourdough starter|+ 360
A reminder to pack the cooled biscuits, 50 minutes from now.|Pack the cooled biscuits|+ 50
Can I get a nudge in 8 mins to turn the pancakes?|Turn the pancakes|+ 8
I'll forget the freezer again. Remind me to shut it in 2 minutes.|Shut the freezer|+ 2
please remind me in a quarter hour to check the roasting peanuts|Check the roasting peanuts|+ 15
Schedule a reminder for 75 minutes from now: take the stock off the heat.|Take the stock off the heat|+ 75
remind me after 25 mins to rinse the soaked beans|Rinse the soaked beans|+ 25
In three hours, remind me to transfer the ice cream to a box.|Transfer the ice cream to a box|+ 180
nudge me about covering the batter in 7 minutes|Cover the batter|+ 7
Please put a reminder 40 minutes out to check the potatoes.|Check the potatoes|+ 40
Remind me to take the butter out in 10 mins.|Take the butter out|+ 10
alert me in 55 minutes about bottling the lemonade|Bottle the lemonade|+ 55
''')
add('train','new_reminder_once','office-next-day', '''
Tomorrow at 8:40am, remind me to bring the visitor badges.|Bring the visitor badges|tomorrow 08:40
need a reminder tmrw 2pm to sign the procurement form|Sign the procurement form|tomorrow 14:00
Please schedule a nudge for the contract review at 11am tomorrow.|Review the contract|tomorrow 11:00
Make sure I get reminded to upload the budget at 4:15pm tomorrow.|Upload the budget|tomorrow 16:15
2moro @ 9:20am remind me about the equipment handover|Equipment handover|tomorrow 09:20
I need to collect the office keys. Remind me tomorrow at noon.|Collect the office keys|tomorrow 12:00
Set a reminder for tomorrow evening at 6:30 to send the demo link.|Send the demo link|tomorrow 18:30
Tomorrow morning, 7:45, please remind me to print the agenda.|Print the agenda|tomorrow 07:45
pls remind me to approve the expense claim tomorrow 10am|Approve the expense claim|tomorrow 10:00
Create a reminder to check the QA notes tomorrow at 3:05pm.|Check the QA notes|tomorrow 15:05
I'd like a reminder tomorrow at 5pm for the release checklist.|Review the release checklist|tomorrow 17:00
Tomorrow 13:30: remind me to book the conference room.|Book the conference room|tomorrow 13:30
Put in a reminder for the security induction tomorrow at 8am.|Security induction|tomorrow 08:00
remind me tmrw at 4:50pm to return the test handset|Return the test handset|tomorrow 16:50
Can you remind me tomorrow at 10:25am to reply to the vendor quote?|Reply to the vendor quote|tomorrow 10:25
The draft needs a final read. Remind me at 9pm tomorrow.|Read the draft|tomorrow 21:00
Please nudge me tomorrow at 06:30 to charge the presentation clicker.|Charge the presentation clicker|tomorrow 06:30
set reminder: tomorrow 12:45pm, check the shipment manifest|Check the shipment manifest|tomorrow 12:45
Remind me about the intern orientation tomorrow at 9:10am.|Intern orientation|tomorrow 09:10
I want a reminder to export the audit log tomorrow at 7pm.|Export the audit log|tomorrow 19:00
''')
add('train','new_reminder_once','family-weekday-errands', '''
On Friday at 6pm remind me to pick up Grandma's glasses.|Pick up Grandma's glasses|weekday 5 18:00
Tuesday 11am, please remind me about my sister's parcel.|Collect my sister's parcel|weekday 2 11:00
Could you set a reminder for Sunday at 4:30pm to visit Uncle Dev?|Visit Uncle Dev|weekday 7 16:30
remind me wed 8am to take dad's prescription along|Take dad's prescription along|weekday 3 08:00
I need a nudge on Saturday morning at 9 to buy the birthday candles.|Buy the birthday candles|weekday 6 09:00
Please remind me to scan the family photos on Monday at 7pm.|Scan the family photos|weekday 1 19:00
Thursday at 12:15pm works for collecting the cake; remind me then.|Collect the cake|weekday 4 12:15
reminder for friday 10:30am: call the home nurse|Call the home nurse|weekday 5 10:30
Set one for Sunday 8am to take the picnic chairs.|Take the picnic chairs|weekday 7 08:00
nudge me saturday at 5:45pm about the tailoring pickup|Collect the tailoring|weekday 6 17:45
Put a reminder on Tuesday at 6:20pm to ask Mira about her exam.|Ask Mira about her exam|weekday 2 18:20
Remind me Monday at noon to post the anniversary card.|Post the anniversary card|weekday 1 12:00
Can you remind me on Wednesday at 9:15pm to send the reunion pictures?|Send the reunion pictures|weekday 3 21:15
thursday 7:10am remind me to pack the spare hearing aid batteries|Pack the spare hearing aid batteries|weekday 4 07:10
I should reserve a table for the cousins. Remind me Friday at 2pm.|Reserve a table for the cousins|weekday 5 14:00
Create a reminder for Saturday at 3:40pm about buying school labels.|Buy school labels|weekday 6 15:40
Sunday evening at 8, remind me to check on Nani.|Check on Nani|weekday 7 20:00
pls remind me to get the suitcase from my brother on monday 8:30am|Get the suitcase from my brother|weekday 1 08:30
On Tuesday at 4pm I need a reminder to collect the repaired watch.|Collect the repaired watch|weekday 2 16:00
Schedule the reminder to arrange the family cab for Wednesday at 6am.|Arrange the family cab|weekday 3 06:00
''')
add('train','new_reminder_once','dated-household-admin', '''
Remind me on the 5th at 10am to read the electricity meter.|Read the electricity meter|date 5 10:00
On the 12th, 3pm, set a reminder to renew the parking sticker.|Renew the parking sticker|date 12 15:00
need a reminder on the 27th at 8pm for checking the gas bill|Check the gas bill|date 27 20:00
Please remind me to send the maintenance receipt on the 2nd at 9:30am.|Send the maintenance receipt|date 2 09:30
Set up a one-off reminder for the 19th at noon to call the plumber.|Call the plumber|date 19 12:00
The 8th at 4:45pm: remind me to check the repair estimate.|Check the repair estimate|date 8 16:45
remind me on the 30th at 7am to photograph the water meter|Photograph the water meter|date 30 07:00
I'd like a reminder on the 16th at 6pm to book pest control.|Book pest control|date 16 18:00
Can you nudge me on the 21st at 11:20am to return the spare router?|Return the spare router|date 21 11:20
Put a reminder for the 9th at 2:10pm about the filter delivery.|Check the filter delivery|date 9 14:10
reminder on the 3rd 8:15am to email the association|Email the association|date 3 08:15
Remind me to confirm the carpet cleaning on the 25th at 5pm.|Confirm the carpet cleaning|date 25 17:00
I need to check the insurance papers on the 14th. Remind me at 10:40am.|Check the insurance papers|date 14 10:40
Set a nudge on the 31st at 7:30pm for filing the receipts.|File the receipts|date 31 19:30
on the 6th at 9pm remind me to order the curtain hooks|Order the curtain hooks|date 6 21:00
Please remind me about the locksmith on the 22nd at 1pm.|Call the locksmith|date 22 13:00
Create a reminder for the 18th at 6:50am to put the bins out.|Put the bins out|date 18 06:50
Nudge me to check the lift service notice on the 11th at 11am.|Check the lift service notice|date 11 11:00
remind me on the 24th at 4pm to collect the deposit receipt|Collect the deposit receipt|date 24 16:00
On the 7th at 8:35pm remind me to test the smoke alarm.|Test the smoke alarm|date 7 20:35
''')
add('train','new_reminder_once','evening-personal-projects', '''
Tonight at 9:30 remind me to glue the model wings.|Glue the model wings|today 21:30
please remind me at 8pm tonight to upload my sketch|Upload my sketch|today 20:00
Set a reminder for 10:15 tonight to cover the clay.|Cover the clay|today 22:15
I want to tune the ukulele tonight; remind me at 7pm.|Tune the ukulele|today 19:00
tonight 11pm remind me to save the video project|Save the video project|today 23:00
Could you nudge me at 6:45 this evening to test the LED strip?|Test the LED strip|today 18:45
Remind me this afternoon at 3 to pick the photo prints.|Pick the photo prints|today 15:00
at 2:30pm today remind me to label the seed envelopes|Label the seed envelopes|today 14:30
Give me a reminder tonight at 8:20 to write the opening scene.|Write the opening scene|today 20:20
Please set a reminder at 5:10pm today for cleaning the camera lens.|Clean the camera lens|today 17:10
Tonight, 10pm, remind me to back up the music tracks.|Back up the music tracks|today 22:00
need a nudge today at noon to collect the art paper|Collect the art paper|today 12:00
Remind me at 4:35 this afternoon to varnish the shelf.|Varnish the shelf|today 16:35
I'd like a reminder this evening at 7:25 to finish the crossword.|Finish the crossword|today 19:25
Put a reminder in for 9:45pm tonight: charge the drone.|Charge the drone|today 21:45
remind me today 11:30am to buy the guitar strings|Buy the guitar strings|today 11:30
This evening at 6, please remind me to stitch the tote handles.|Stitch the tote handles|today 18:00
I need reminding at 8:55pm tonight to record the voice sample.|Record the voice sample|today 20:55
Schedule a reminder today at 1:40pm for checking the resin mould.|Check the resin mould|today 13:40
pls nudge me at 10:50 tonight to close the telescope case|Close the telescope case|today 22:50
''')
add('train','new_reminder_once','delayed-study-actions', '''
In 2 hours and 15 minutes, remind me to review the flashcards.|Review the flashcards|+ 135
I've got a practice paper running. Remind me to stop in 80 minutes.|Stop the practice paper|+ 80
remind me after 3 and a half hours to download the lecture slides|Download the lecture slides|+ 210
Could I have a reminder 24 hours from now to revisit this proof?|Revisit this proof|+ 1440
Remind me to return to the essay in 110 mins.|Return to the essay|+ 110
A nudge in 5 hours would help me send the study group notes.|Send the study group notes|+ 300
Please remind me in 95 minutes to check my practice answers.|Check my practice answers|+ 95
Need a reminder to upload the lab worksheet after 150 minutes.|Upload the lab worksheet|+ 150
in 48 hours remind me to check the scholarship portal|Check the scholarship portal|+ 2880
I should have a break in 22 minutes; remind me.|Have a break|+ 22
Set a reminder 6 hours from now to reserve the library room.|Reserve the library room|+ 360
Remind me about registering for the seminar in 36 hours.|Register for the seminar|+ 2160
pls remind me in an hour and ten minutes to switch subjects|Switch subjects|+ 70
Put in a reminder for 200 minutes from now to scan the marked pages.|Scan the marked pages|+ 200
Nudge me in 28 minutes to check the citation list.|Check the citation list|+ 28
Remind me after 4 hours to send the tutor my questions.|Send the tutor my questions|+ 240
I need a reminder in 65 minutes for the listening exercise.|Do the listening exercise|+ 65
three days from now remind me to check the admission result|Check the admission result|+ 4320
Could you remind me in 100 minutes to submit the quiz?|Submit the quiz|+ 100
Make a reminder for 16 minutes from now to open the vocabulary notebook.|Open the vocabulary notebook|+ 16
''')
contextual('train','refer-back-to-work-artifact','''
Remind me to send this tomorrow at 11am.|Send the revised onboarding checklist|tomorrow 11:00|I finished the revised onboarding checklist.
Nudge me about that in 40 minutes.|Review the supplier comparison|+ 40|I need to review the supplier comparison.
Set a reminder for this on Friday at 2pm.|Approve the poster proof|weekday 5 14:00|The printer needs me to approve the poster proof.
please remind me to finish it tonight at 8|Finish the accessibility review|today 20:00|I started the accessibility review but haven't finished it.
Tomorrow at 10am remind me about the thing we just discussed.|Send the recruitment scorecard|tomorrow 10:00|The only thing left is to send the recruitment scorecard.
In 30 minutes, remind me to check that.|Check the staging import|+ 30|The staging import is running and needs a check.
''')
add('test','new_reminder_once','travel-departure-preparation','''
Before I forget: set a reminder to download the boarding pass 70 minutes from now.|Download the boarding pass|+ 70
Airport pickup reminder please, tomorrow 04:45.|Airport pickup|tomorrow 04:45
I leave on Saturday. Remind me at 6:15am that day to pack the charger.|Pack the charger|weekday 6 06:15
Could a reminder pop up on the 15th at 1pm for my seat selection?|Select my seat|date 15 13:00
tomorrow evening 7:40 would be good for a reminder to weigh the bag|Weigh the bag|tomorrow 19:40
Add a reminder: collect the rail tickets, Wednesday 12:30pm.|Collect the rail tickets|weekday 3 12:30
Please nudge me about printing the hotel voucher after 85 minutes.|Print the hotel voucher|+ 85
Tonight's 8:10pm reminder should say pack earplugs.|Pack earplugs|today 20:10
For taxi confirmation, create a nudge scheduled for the 26th, 3:30pm.|Confirm the taxi|date 26 15:30
remind me 4 hours from now about reserving the luggage locker|Reserve the luggage locker|+ 240
Make a reminder for Monday morning at 5:20 to fill the travel flask.|Fill the travel flask|weekday 1 05:20
Tomorrow at 12:05pm I need a reminder saying exchange the torn suitcase tag.|Exchange the torn suitcase tag|tomorrow 12:05
Please put check the train platform on my reminders for Friday 7:50am.|Check the train platform|weekday 5 07:50
Give me a nudge about activating the travel SIM in 125 minutes.|Activate the travel SIM|+ 125
early check-in needs confirming, can i have a nudge for the 4th, 6:10pm|Confirm early check-in|date 4 18:10
Have a reminder ready for 9:05pm tonight to freeze the ice packs.|Freeze the ice packs|today 21:05
''')
add('test','new_reminder_once','medical-appointment-logistics','''
Could you put collect the scan films in my reminders, Thursday at 4:20pm?|Collect the scan films|weekday 4 16:20
Need to be reminded about the fasting instructions tomorrow 6:15am.|Read the fasting instructions|tomorrow 06:15
In 32 minutes I'd like a reminder to phone the diagnostic centre.|Phone the diagnostic centre|+ 32
Book a reminder for 11:45am on the 13th: check the appointment slip.|Check the appointment slip|date 13 11:45
tomorrow @ 5:35pm reminder to bring the previous x-rays pls|Bring the previous x-rays|tomorrow 17:35
I must ask the clinic for a receipt. Please remind me in 105 minutes.|Ask the clinic for a receipt|+ 105
A Sunday 9:40am reminder to pack the referral letter, please.|Pack the referral letter|weekday 7 09:40
Put a nudge at 7:55 tonight for uploading the test report.|Upload the test report|today 19:55
At 10:10am on the 20th I want reminding to arrange a lift to the clinic.|Arrange a lift to the clinic|date 20 10:10
Remind me once, 2.5 hours from now, about confirming the eye test.|Confirm the eye test|+ 150
Tuesday afternoon at 2:45, remind me that the lab closes early.|The lab closes early|weekday 2 14:45
can you remind me about booking physio tomorrow 8:50am|Book physio|tomorrow 08:50
Please set aside a reminder for the 29th at 9:25am to check my referral status.|Check my referral status|date 29 09:25
Need a ping after 14 minutes so I remember to pick up the lab envelope.|Pick up the lab envelope|+ 14
For tonight, add a 10:35pm reminder to lay out the hospital documents.|Lay out the hospital documents|today 22:35
Make Thursday 6:05am a reminder to take the appointment card.|Take the appointment card|weekday 4 06:05
''')
add('test','new_reminder_once','community-volunteer-logistics','''
Add a Saturday 10:20am reminder about collecting the donation boxes.|Collect the donation boxes|weekday 6 10:20
Please remind me that I need to send the volunteer roster in 52 minutes.|Send the volunteer roster|+ 52
Tomorrow 3:25pm is when I want the reminder to call the shelter.|Call the shelter|tomorrow 15:25
A reminder on the 10th at 8:45am would help me bring the event banner.|Bring the event banner|date 10 08:45
nudge for delivering the food packets at 6:35 tonight please|Deliver the food packets|today 18:35
I have to test the hall microphone. Set a reminder 170 minutes from now.|Test the hall microphone|+ 170
The raffle books need counting; add that as a Monday 11:15am reminder.|Count the raffle books|weekday 1 11:15
Can you add pick up the litter grabbers as a reminder for tomorrow 7:35am?|Pick up the litter grabbers|tomorrow 07:35
Give me a reminder on the 28th at 5:15pm about confirming the hall booking.|Confirm the hall booking|date 28 17:15
In 26 mins I should be reminded to send the cleanup location.|Send the cleanup location|+ 26
Donated book sorting needs its own reminder: Sunday, 4:55pm.|Sort the donated books|weekday 7 16:55
Tomorrow morning at 9:05 please remind me the volunteer badges need printing.|Print the volunteer badges|tomorrow 09:05
I need a ping tonight at 9:15 for charging the portable speaker.|Charge the portable speaker|today 21:15
Please make the 23rd at 12:40pm a reminder to check the permit.|Check the permit|date 23 12:40
Can I have the reminder for packing gloves in 185 minutes?|Pack gloves|+ 185
Set my reminder to send the attendance sheet for Wednesday at 8:25pm.|Send the attendance sheet|weekday 3 20:25
''')
contextual('test','refer-back-to-personal-purchase','''
Can you remind me to buy those in 50 minutes?|Buy replacement shoelaces|+ 50|My running shoes need replacement shoelaces.
Tomorrow at 4pm, give me a reminder to return it.|Return the cracked plant pot|tomorrow 16:00|The plant pot I bought arrived cracked.
Put a reminder about that purchase on Saturday at 11am.|Order the bike bell|weekday 6 11:00|I decided to order the bike bell.
For tonight at 7:30, add a reminder to measure that.|Measure the bookshelf gap|today 19:30|I need to measure the bookshelf gap before buying the cabinet.
I'd like a nudge to collect them tomorrow at noon.|Collect the repaired boots|tomorrow 12:00|The cobbler says my repaired boots are ready.
In 15 mins prompt me to compare the two.|Compare the two desk lamps|+ 15|I've narrowed my shopping down to two desk lamps.
''')
add('train','new_reminder_repeating','daily-home-maintenance','''
Every evening at 8:15, remind me to latch the balcony door.|Latch the balcony door|daily 20:15
I'd like a 6:50am reminder each day to refill the dog bowl.|Refill the dog bowl|daily 06:50
set up a daily nudge at noon to open the windows|Open the windows|daily 12:00
Please remind me at 9:40pm every day to unplug the iron.|Unplug the iron|daily 21:40
Make checking the freezer seal a daily reminder for 7am.|Check the freezer seal|daily 07:00
remind me each afternoon at 4:20 to air the spare room|Air the spare room|daily 16:20
At 10pm every night I need a reminder to lock the side gate.|Lock the side gate|daily 22:00
Can you give me a recurring 8:35am reminder to turn the compost?|Turn the compost|daily 08:35
Daily reminder please: wipe the kitchen counter at 9:15pm.|Wipe the kitchen counter|daily 21:15
I keep forgetting the fish food. Remind me every morning at 7:25.|Feed the fish|daily 07:25
''')
add('train','new_reminder_repeating','workweek-startup-checks','''
Mon to Fri at 8:55am, remind me to open the support dashboard.|Open the support dashboard|daily 08:55 1,2,3,4,5
Please set a weekday reminder to review overnight alerts at 9:10am.|Review overnight alerts|daily 09:10 1,2,3,4,5
nudge me every working day at 5:40pm to update the handoff notes|Update the handoff notes|daily 17:40 1,2,3,4,5
I'd like a reminder at 10:30am each weekday to log my focus goal.|Log my focus goal|daily 10:30 1,2,3,4,5
Every weekday afternoon at 3, remind me to check the review queue.|Check the review queue|daily 15:00 1,2,3,4,5
Make submitting my hours a 6:05pm reminder Monday through Friday.|Submit my hours|daily 18:05 1,2,3,4,5
pls remind me at 12:10pm on weekdays to mark my lunch break|Mark my lunch break|daily 12:10 1,2,3,4,5
Set a 7:45am weekday reminder about carrying my access badge.|Carry my access badge|daily 07:45 1,2,3,4,5
I need to empty the build queue every weekday; remind me at 4:25pm.|Empty the build queue|daily 16:25 1,2,3,4,5
Every Monday to Friday at 11:50am, nudge me to save the test results.|Save the test results|daily 11:50 1,2,3,4,5
''')
add('train','new_reminder_repeating','weekly-fitness-routine','''
On Mondays and Thursdays at 6:10am remind me to pack swimming goggles.|Pack swimming goggles|daily 06:10 1,4
Set a weekly Saturday 7:20am reminder for cleaning the cycle chain.|Clean the cycle chain|daily 07:20 6
remind me each wednesday at 6:45pm to roll out the yoga mat|Roll out the yoga mat|daily 18:45 3
Please remind me every Tuesday and Friday at 5pm to pack my gym towel.|Pack my gym towel|daily 17:00 2,5
Sundays at 8:30am should have a reminder to check tyre pressure.|Check tyre pressure|daily 08:30 7
I'd like a stretching reminder at 9pm on Monday, Wednesday and Friday.|Stretch|daily 21:00 1,3,5
every weekend at 6:40am remind me to put sunscreen in my running bag|Put sunscreen in my running bag|daily 06:40 6,7
Put a reminder every Thursday at noon to book the badminton court.|Book the badminton court|daily 12:00 4
Remind me on Tuesdays at 8:10pm to wash my training shoes.|Wash my training shoes|daily 20:10 2
Can you set up a Sunday 4:15pm reminder to prepare the hiking pack?|Prepare the hiking pack|daily 16:15 7
''')
add('train','new_reminder_repeating','monthly-finance-housekeeping','''
On the last day of each month at 8pm remind me to archive bank statements.|Archive bank statements|monthly -1 20:00
Make a monthly reminder for the 4th at 9:15am to check the broadband payment.|Check the broadband payment|monthly 4 09:15
remind me every month on the 18th at 6pm to review subscriptions|Review subscriptions|monthly 18 18:00
I'd like a reminder on each month's 10th at noon to file donation receipts.|File donation receipts|monthly 10 12:00
The final day of the month, 7:30pm: remind me to reconcile the joint account.|Reconcile the joint account|monthly -1 19:30
Set a reminder for every 22nd at 10am to download the loan statement.|Download the loan statement|monthly 22 10:00
Please nudge me on the 7th of every month at 5:20pm about the storage bill.|Check the storage bill|monthly 7 17:20
each month on the 15th at 8:45am remind me to check the card statement|Check the card statement|monthly 15 08:45
Remind me at 9pm on the last day of every month to total the cash expenses.|Total the cash expenses|monthly -1 21:00
A monthly reminder for the 28th at 11:35am to check my savings transfer, please.|Check my savings transfer|monthly 28 11:35
''')
add('train','new_reminder_repeating','unwindowed-posture-breaks','''
Remind me to relax my shoulders every 45 minutes.|Relax my shoulders|interval 45
I want a nudge to stand up once every three hours.|Stand up|interval 180
repeat a reminder every 90 mins to rest my wrists|Rest my wrists|interval 90
Set up reminders to look away from the screen every twenty minutes.|Look away from the screen|interval 20
Can you remind me every hour to straighten my back?|Straighten my back|interval 60
Every two and a half hours, nudge me to walk a little.|Walk a little|interval 150
please keep reminding me to unclench my jaw every 30 minutes|Unclench my jaw|interval 30
I need a reminder at 75 minute intervals to change my sitting position.|Change my sitting position|interval 75
Set an ongoing reminder to blink slowly every quarter hour.|Blink slowly|interval 15
Make a repeating nudge for neck stretches every 4 hours.|Do neck stretches|interval 240
''')
add('train','new_reminder_repeating','windowed-craft-checks','''
Every 30 minutes between 10am and 6pm, remind me to check the print bed.|Check the print bed|interval 30 10:00 18:00
Please remind me to stir the dye every hour from 9am to 1pm.|Stir the dye|interval 60 09:00 13:00
from 2pm until 8pm remind me every 45 mins to check the glue|Check the glue|interval 45 14:00 20:00
I need a reminder every two hours to rotate the drying rack, between 8am and 8pm.|Rotate the drying rack|interval 120 08:00 20:00
Set half-hourly reminders from 11am to 5pm to check the kiln display.|Check the kiln display|interval 30 11:00 17:00
At 90 minute intervals between 7am and 7pm, remind me to mist the clay.|Mist the clay|interval 90 07:00 19:00
every weekday 10am to 4pm remind me every 20 minutes to inspect the engraver|Inspect the engraver|interval 20 10:00 16:00 1,2,3,4,5
Can you nudge me to turn the fabric every 3 hours from 6am to 9pm?|Turn the fabric|interval 180 06:00 21:00
Repeat a reminder to check the resin every 15 minutes between noon and 3pm.|Check the resin|interval 15 12:00 15:00
Every 75 minutes during 09:30 to 17:30, remind me to clear the sawdust.|Clear the sawdust|interval 75 09:30 17:30
''')
add('train','new_reminder_repeating','weekly-learning-practice','''
Every Friday at 7:35pm remind me to review my language notebook.|Review my language notebook|daily 19:35 5
Mondays, Wednesdays and Saturdays at 8am, remind me to practise scales.|Practise scales|daily 08:00 1,3,6
pls set a weekly nudge sunday 11:10am to organise course notes|Organise course notes|daily 11:10 7
Remind me each Tuesday at 6:25pm to download the coding exercise.|Download the coding exercise|daily 18:25 2
I need a 9:45pm reminder on Thursdays to revise the anatomy cards.|Revise the anatomy cards|daily 21:45 4
Make a weekend reminder at 3:15pm to solve a chess puzzle.|Solve a chess puzzle|daily 15:15 6,7
On every Monday and Friday, remind me at noon to practise dictation.|Practise dictation|daily 12:00 1,5
A Wednesday morning 7:50 reminder for reading the journal, please.|Read the journal|daily 07:50 3
Remind me at 5:55pm every Saturday to practise the new drum pattern.|Practise the new drum pattern|daily 17:55 6
every tuesday and thursday at 8:40pm remind me to mark the workbook|Mark the workbook|daily 20:40 2,4
''')
add('test','new_reminder_repeating','pet-care-calendar','''
Add a repeating 6:35am nudge for taking the puppy outside.|Take the puppy outside|daily 06:35
My aquarium light needs switching off nightly. Put in a 9:25pm reminder.|Switch off the aquarium light|daily 21:25
Cat brushing needs a weekly nudge, Wednesdays 7:15pm please.|Brush the cat|daily 19:15 3
Checking the rabbit's hay needs a reminder each morning at 8am.|Check the rabbit's hay|daily 08:00
pet food stock check reminder for each month's 6th at 11am please|Check pet food stock|monthly 6 11:00
I'd like the final evening of every month at 6:40pm to remind me to weigh the dog.|Weigh the dog|monthly -1 18:40
Have Cortex remind me to refresh the water bowl at two-hour intervals.|Refresh the water bowl|interval 120
A reminder to check the foster kitten every 40 minutes, only 8am through 10pm.|Check the foster kitten|interval 40 08:00 22:00
Could I get a Saturday-and-Sunday 10:05am reminder to clean the bird tray?|Clean the bird tray|daily 10:05 6,7
Repeat the filter-rinse reminder every Friday morning at 8:20.|Rinse the aquarium filter|daily 08:20 5
''')
add('test','new_reminder_repeating','garden-recurrence','''
Put checking the rain gauge on a daily reminder at 7:05am.|Check the rain gauge|daily 07:05
For each Monday and Saturday at 5:30pm, add a reminder to turn the pots.|Turn the pots|daily 17:30 1,6
I'd like the 13th of each month at 9am reserved for a reminder to inspect the drip lines.|Inspect the drip lines|monthly 13 09:00
At month end every month, give me a 4:10pm nudge to photograph the garden.|Photograph the garden|monthly -1 16:10
Repeat checking the propagator at intervals of 50 minutes.|Check the propagator|interval 50
Between 6am and noon every 90 minutes, I want reminding to mist the cuttings.|Mist the cuttings|interval 90 06:00 12:00
A daily evening nudge at 6:55 to bring in the seedlings, please.|Bring in the seedlings|daily 18:55
weekdays 8:25am add a reminder for opening the greenhouse vent|Open the greenhouse vent|daily 08:25 1,2,3,4,5
Arrange a Sunday 3:50pm reminder every week to clean the pruning shears.|Clean the pruning shears|daily 15:50 7
Have a reminder come up every four hours to check the hydroponic pump.|Check the hydroponic pump|interval 240
''')
add('test','new_reminder_repeating','household-inventory-cycle','''
Set recurring notifications for checking the first-aid box on the 16th monthly at 10:15am.|Check the first-aid box|monthly 16 10:15
I'd like reminders about washing the lunchbox each weekday at 8:50pm.|Wash the lunchbox|daily 20:50 1,2,3,4,5
Put charging the torch on a repeating Sunday reminder, 5:05pm.|Charge the torch|daily 17:05 7
Each month's closing day at noon, prompt me to check the pantry dates.|Check the pantry dates|monthly -1 12:00
A nudge to swap the drying towels every 3 hours between 9am and 9pm.|Swap the drying towels|interval 180 09:00 21:00
Set up a repeating reminder for emptying the dehumidifier at 150-minute intervals.|Empty the dehumidifier|interval 150
tuesdays and thursdays 7:40am add reminders about taking recycling downstairs|Take recycling downstairs|daily 07:40 2,4
For every 25 minutes from 10am until 2pm, have a reminder to check the defrost tray.|Check the defrost tray|interval 25 10:00 14:00
Could you schedule checking the spare bulbs every month on the 9th at 6:15pm?|Check the spare bulbs|monthly 9 18:15
Remind me to put the milk bottles outside nightly at 10:20pm.|Put the milk bottles outside|daily 22:20
''')
add('train','new_task','fresh-industry-briefings','''
Every morning at 7:30am, write me a short roundup of semiconductor news.|Write a short roundup of semiconductor news|daily 07:30|live
Give me the latest cybersecurity headlines at 8:15am on weekdays.|Summarise the latest cybersecurity headlines|daily 08:15 1,2,3,4,5|live
each friday 5pm put together a digest of new climate research|Put together a digest of new climate research|daily 17:00 5|live
I'd like a daily 6:45am summary of overnight space industry developments.|Summarise overnight space industry developments|daily 06:45|live
At noon every Monday, prepare a briefing on recent battery technology news.|Prepare a briefing on recent battery technology news|daily 12:00 1|live
Write up today's major open-source releases every evening at 7pm.|Write up today's major open-source releases|daily 19:00|live
schedule a quick logistics industry news digest for tuesdays 9am|Write a quick logistics industry news digest|daily 09:00 2|live
Every Saturday at 10:30am, give me a summary of new accessibility standards news.|Summarise new accessibility standards news|daily 10:30 6|live
Can you generate a daily 8pm briefing on current electric vehicle announcements?|Generate a briefing on current electric vehicle announcements|daily 20:00|live
I want a roundup of this week's robotics news each Sunday at 6pm.|Write a roundup of this week's robotics news|daily 18:00 7|live
Produce an update on current ocean conservation news every Wednesday at 8am.|Produce an update on current ocean conservation news|daily 08:00 3|live
Every 1st at 9am, compile the latest urban transport announcements for me.|Compile the latest urban transport announcements|monthly 1 09:00|live
weekday mornings 7:10am generate a summary of current developer tooling news|Summarise current developer tooling news|daily 07:10 1,2,3,4,5|live
Write a brief on recent satellite launches every Thursday at 4pm.|Write a brief on recent satellite launches|daily 16:00 4|live
''')
add('train','new_task','personal-memory-recaps','''
At 6:30pm each Friday, summarise the decisions from my meetings that week.|Summarise the decisions from my meetings that week|daily 18:30 5|local
Every night at 9:10pm write a recap of what I worked on today.|Write a recap of what I worked on today|daily 21:10|local
Give me a weekly digest of articles I saved, Sunday 11am.|Write a digest of articles I saved that week|daily 11:00 7|local
pls prepare a summary of my unresolved review comments every weekday 5:15pm|Summarise my unresolved review comments|daily 17:15 1,2,3,4,5|local
Every Monday at 8:20am, draft a list of my open follow-ups from last week.|Draft a list of my open follow-ups from last week|daily 08:20 1|local
Generate a summary of my design feedback each Wednesday at 7pm.|Summarise my design feedback|daily 19:00 3|local
I want you to write a recap of my study notes daily at 10pm.|Write a recap of my study notes|daily 22:00|local
At noon on the last day of every month, summarise my completed project milestones.|Summarise my completed project milestones|monthly -1 12:00|local
every tuesday at 6pm pull together the questions i left unanswered in chat|Summarise the questions I left unanswered in chat|daily 18:00 2|local
Please generate a Friday 4:45pm digest of the documents I edited this week.|Write a digest of the documents I edited that week|daily 16:45 5|local
Each morning at 9:05, write a brief from yesterday's customer call notes.|Write a brief from yesterday's customer call notes|daily 09:05|local
Prepare a Sunday 8:40pm recap of my language practice notes every week.|Write a recap of my language practice notes|daily 20:40 7|local
Daily at 5:50pm, compile my saved troubleshooting tips into a short recap.|Compile my saved troubleshooting tips into a short recap|daily 17:50|local
On the 3rd of every month at 10am, write a summary of my book notes.|Write a summary of my book notes|monthly 3 10:00|local
''')
add('test','new_task','local-events-discovery','''
Have a digest of upcoming Bengaluru art exhibitions written for me each Thursday at noon.|Write a digest of upcoming Bengaluru art exhibitions|daily 12:00 4|live
Saturday 9am every week: generate a guide to this weekend's local theatre listings.|Generate a guide to this weekend's local theatre listings|daily 09:00 6|live
I'd like you to compile current community cycling events on Mondays at 7pm.|Compile current community cycling events|daily 19:00 1|live
Write me tomorrow's Pune weather outlook every night at 8:30pm.|Write tomorrow's Pune weather outlook|daily 20:30|live
Each month's 2nd at 11am, prepare a roundup of new museum exhibitions in Mumbai.|Prepare a roundup of new museum exhibitions in Mumbai|monthly 2 11:00|live
Could a fresh digest of nearby science talks be generated on Wednesdays at 6:15pm?|Generate a fresh digest of nearby science talks|daily 18:15 3|live
''')
add('test','new_task','personal-creative-reviews','''
Make me a written review of the fiction drafts I opened, every Sunday 5pm.|Write a review of the fiction drafts I opened that week|daily 17:00 7|local
Arrange for a summary of my photography feedback to be written at 8pm each Friday.|Summarise my photography feedback|daily 20:00 5|local
At 7:20pm daily I'd like you to generate a recap of the recipes I looked at.|Generate a recap of the recipes I looked at|daily 19:20|local
Every month's final day at 4pm, compose a digest of my woodworking notes.|Compose a digest of my woodworking notes|monthly -1 16:00|local
Have Cortex draft a recap of my saved travel ideas on Saturdays at 2:30pm.|Draft a recap of my saved travel ideas|daily 14:30 6|local
On Tuesdays at 9:30pm, produce a short review of my recent music practice notes.|Produce a short review of my recent music practice notes|daily 21:30 2|local
''')
add('train','manage_reminder','pause-work-admin','''
Pause the weekly metrics reminder for me.|Review weekly metrics|pause_schedule|-
I don't need the timesheet nudge running right now; pause it.|Submit timesheet|pause_schedule|-
pls pause my badge check reminder|Check access badge|pause_schedule|-
Temporarily pause the invoice upload reminder.|Upload invoices|pause_schedule|-
Put the stand-down notes reminder on pause.|Read stand-down notes|pause_schedule|-
Can you pause the desk booking reminder?|Book office desk|pause_schedule|-
The sprint review prep reminder can be paused.|Prepare sprint review|pause_schedule|-
pause the nudge about archiving logs|Archive logs|pause_schedule|-
Please pause my vendor follow-up reminder.|Follow up with vendor|pause_schedule|-
I'd like to pause the equipment inventory reminder.|Check equipment inventory|pause_schedule|-
Stop the travel claim reminder temporarily by pausing it.|File travel claim|pause_schedule|-
Could you put my mailbox cleanup reminder on pause?|Clean mailbox|pause_schedule|-
Pause notifications for the purchase order reminder.|Approve purchase orders|pause_schedule|-
my weekly backlog grooming reminder needs pausing please|Groom backlog|pause_schedule|-
''')
add('train','manage_reminder','resume-household-chores','''
Resume my reminder to change the bedsheets.|Change bedsheets|resume_schedule|-
Turn the fridge cleaning reminder back on.|Clean fridge|resume_schedule|-
unpause the nudge to wash the bath mats|Wash bath mats|resume_schedule|-
Please resume the reminder about sorting the mail.|Sort mail|resume_schedule|-
I'd like the shoe cleaning reminder active again.|Clean shoes|resume_schedule|-
Reactivate the reminder to wipe the window tracks.|Wipe window tracks|resume_schedule|-
Can you start my cupboard tidy reminder again?|Tidy cupboard|resume_schedule|-
Resume the dishwasher filter reminder now.|Clean dishwasher filter|resume_schedule|-
bring back the reminder to refill the soap dispenser|Refill soap dispenser|resume_schedule|-
Switch my towel wash reminder back on please.|Wash towels|resume_schedule|-
The oven cleaning nudge should resume.|Clean oven|resume_schedule|-
Please unpause the reminder about checking the spare keys.|Check spare keys|resume_schedule|-
Make the entryway sweep reminder active once more.|Sweep entryway|resume_schedule|-
resume my reminder for cleaning the extractor mesh|Clean extractor mesh|resume_schedule|-
''')
add('train','manage_reminder','cancel-shopping-obligations','''
Cancel the reminder to buy printer ink.|Buy printer ink|cancel_schedule|-
Delete my curtain shopping reminder, I've ordered them.|Buy curtains|cancel_schedule|-
remove the reminder about picking up envelopes|Pick up envelopes|cancel_schedule|-
I already bought the umbrella. Cancel that reminder.|Buy umbrella|cancel_schedule|-
Please get rid of the reminder to order storage tubs.|Order storage tubs|cancel_schedule|-
Can you cancel the reminder for buying the extension lead?|Buy extension lead|cancel_schedule|-
The reminder to collect the fruit basket can be deleted.|Collect fruit basket|cancel_schedule|-
Don't need the desk lamp shopping reminder anymore; cancel it.|Buy desk lamp|cancel_schedule|-
pls delete the nudge to get packing tape|Buy packing tape|cancel_schedule|-
Cancel my reminder about collecting the new spectacles.|Collect spectacles|cancel_schedule|-
Remove the reminder to buy the replacement mouse.|Buy replacement mouse|cancel_schedule|-
I'd like to cancel the wall clock purchase reminder.|Buy wall clock|cancel_schedule|-
Erase the reminder for collecting the shoe rack.|Collect shoe rack|cancel_schedule|-
Bought the travel pillow already, delete its reminder.|Buy travel pillow|cancel_schedule|-
''')
add('train','manage_reminder','snooze-personal-routines','''
Snooze my breathing exercise reminder for 15 minutes.|Breathing exercise|snooze_schedule|15
Give the walk reminder another half hour.|Take a walk|snooze_schedule|30
delay the reminder to journal by 45 mins|Write journal|snooze_schedule|45
Snooze the piano practice nudge for an hour.|Practise piano|snooze_schedule|60
Can you snooze the meditation reminder for 20 minutes?|Meditate|snooze_schedule|20
Push the evening reading reminder back by ten minutes.|Evening reading|snooze_schedule|10
Snooze the reminder to stretch my calves for 25 minutes.|Stretch calves|snooze_schedule|25
not ready for the sketching reminder, snooze it for 90 mins|Sketch|snooze_schedule|90
Please delay my flossing reminder by five minutes.|Floss|snooze_schedule|5
Snooze the reminder to practise handwriting for 40 minutes.|Practise handwriting|snooze_schedule|40
The balance exercise nudge needs a two-hour snooze.|Balance exercises|snooze_schedule|120
Can I snooze the reminder to read poetry for 35 minutes?|Read poetry|snooze_schedule|35
Snooze my guitar warm-up reminder for a quarter hour.|Guitar warm-up|snooze_schedule|15
pls hold off the bedtime checklist reminder for 50 minutes|Bedtime checklist|snooze_schedule|50
''')
add('train','manage_reminder','retime-daily-care','''
Move the face wash reminder to 9:35pm.|Wash face|update_schedule|daily 21:35|daily 20:00
Change the plant misting reminder to 7:10am each day.|Mist plants|update_schedule|daily 07:10|daily 08:00
My vitamin reminder should be at 8:25am instead.|Take vitamins|update_schedule|daily 08:25|daily 09:00
please make the hearing aid charging reminder 10:40pm|Charge hearing aids|update_schedule|daily 22:40|daily 21:00
Retiming request: put the dog walk reminder at 6:20am.|Walk dog|update_schedule|daily 06:20|daily 07:00
Can you shift the lunch packing nudge to 7:55am?|Pack lunch|update_schedule|daily 07:55|daily 08:15
Set the daily contact lens reminder to 9:50pm.|Remove contact lenses|update_schedule|daily 21:50|daily 22:00
change my morning weigh-in reminder to 6:45am pls|Morning weigh-in|update_schedule|daily 06:45|daily 07:15
I'd like the reminder to wash my bottle at 8:05pm now.|Wash bottle|update_schedule|daily 20:05|daily 19:00
Make the evening skincare nudge happen at 10:10pm.|Evening skincare|update_schedule|daily 22:10|daily 21:30
Move my daily reading glasses cleaning reminder to noon.|Clean reading glasses|update_schedule|daily 12:00|daily 08:30
The cushion airing reminder needs to be at 10:15am.|Air cushions|update_schedule|daily 10:15|daily 09:45
Can we change the lunch walk reminder to 1:20pm?|Lunch walk|update_schedule|daily 13:20|daily 12:30
put the daily nail care reminder at 8:40pm instead|Nail care|update_schedule|daily 20:40|daily 19:15
''')
add('train','manage_reminder','revise-reminder-wording','''
Change the packing reminder text to Pack charger and adapter.|Pack charger|update_schedule|text:Pack charger and adapter
My pool reminder should say Bring cap and goggles.|Bring goggles|update_schedule|text:Bring cap and goggles
update the parcel reminder message to Collect parcel from reception|Collect parcel|update_schedule|text:Collect parcel from reception
Please rewrite the reminder about the vet as Ask the vet about the new food.|Vet visit|update_schedule|text:Ask the vet about the new food
Set the reminder's title to Review lease renewal; it's currently called Housing paperwork.|Housing paperwork|update_schedule|title:Review lease renewal
The train reminder should read Check platform and coach number.|Check train|update_schedule|text:Check platform and coach number
Can you change the laundry reminder to say Wash on a cold cycle?|Do laundry|update_schedule|text:Wash on a cold cycle
rename the pottery reminder to Pick up fired bowls|Pottery|update_schedule|title:Pick up fired bowls
Replace the bill reminder message with Pay through the bank app.|Pay utility bill|update_schedule|text:Pay through the bank app
Please make the meeting prep reminder say Read the revised agenda.|Meeting prep|update_schedule|text:Read the revised agenda
Change the garden reminder text to Check soil before watering.|Water garden|update_schedule|text:Check soil before watering
I'd like the birthday reminder renamed Buy Lena's birthday flowers.|Birthday errand|update_schedule|title:Buy Lena's birthday flowers
edit the book return reminder to say Return both library books|Return book|update_schedule|text:Return both library books
Update my camera reminder message to Pack the spare battery.|Pack camera|update_schedule|text:Pack the spare battery
''')
add('train','manage_reminder','change-recurrence-calendar','''
Move the council fee reminder to the 9th each month, same time.|Pay council fee|update_schedule|monthly 9 10:00|monthly 3 10:00
The meal planning reminder should happen on Thursdays instead of Sundays.|Plan meals|update_schedule|daily 17:00 4|daily 17:00 7
Make the car wash reminder Saturday and Sunday at 8am.|Wash car|update_schedule|daily 08:00 6,7|daily 08:00 6
Change the dry cleaning pickup reminder to Friday at 6pm each week.|Pick up dry cleaning|update_schedule|daily 18:00 5|daily 18:00 3
pls move the monthly locker payment reminder to the last day|Pay locker fee|update_schedule|monthly -1 09:30|monthly 25 09:30
Switch the weekly photo backup reminder to Tuesdays, keeping 9pm.|Back up photos|update_schedule|daily 21:00 2|daily 21:00 7
My hourly desk stretch reminder should repeat every 90 minutes now.|Desk stretch|update_schedule|interval 90|interval 60
Change the monthly magazine renewal reminder to the 21st at noon.|Renew magazine|update_schedule|monthly 21 12:00|monthly 12 12:00
Run the recycling reminder on Mondays and Wednesdays instead, still 7am.|Sort recycling|update_schedule|daily 07:00 1,3|daily 07:00 2,4
Update the document filing reminder to every weekday at 5pm.|File documents|update_schedule|daily 17:00 1,2,3,4,5|daily 17:00 5
The reminder to clean my brushes should be daily at 8:30pm now.|Clean brushes|update_schedule|daily 20:30|daily 20:30 7
Change the pantry stock reminder to the 2nd of every month.|Check pantry stock|update_schedule|monthly 2 11:00|monthly 18 11:00
Move the shoe polishing reminder from Saturday to Monday at 7:15pm.|Polish shoes|update_schedule|daily 19:15 1|daily 19:15 6
make the monthly air filter reminder the last day at 4pm|Check air filter|update_schedule|monthly -1 16:00|monthly 15 16:00
''')
add('test','manage_reminder','transport-reminder-controls','''
Please suspend my tyre rotation reminder by pausing it.|Rotate tyres|pause_schedule|-
I want the parking renewal nudge paused for now.|Renew parking permit|pause_schedule|-
Could the bus pass reminder be turned back on?|Renew bus pass|resume_schedule|-
Bring the bike service reminder out of pause.|Service bike|resume_schedule|-
Remove my reminder about collecting the rental scooter.|Collect rental scooter|cancel_schedule|-
The car inspection is done; delete that reminder.|Car inspection|cancel_schedule|-
Let the fuel stop reminder wait another 55 minutes.|Fuel stop|snooze_schedule|55
Postpone the reminder to inflate the tyres by 80 minutes.|Inflate tyres|snooze_schedule|80
Set a 12-minute snooze on the taxi booking reminder.|Book taxi|snooze_schedule|12
Please make my daily traffic check reminder happen at 7:35am.|Check traffic|update_schedule|daily 07:35|daily 08:00
Switch the commuter card reminder from the 5th to the 8th monthly.|Top up commuter card|update_schedule|monthly 8 18:00|monthly 5 18:00
The reminder labelled Helmet needs the text Bring helmet and gloves.|Helmet|update_schedule|text:Bring helmet and gloves
Could the weekly chain oiling reminder move to Wednesday, still 6pm?|Oil chain|update_schedule|daily 18:00 3|daily 18:00 6
Replace the title Car stuff with Book annual service.|Car stuff|update_schedule|title:Book annual service
''')
add('test','manage_reminder','craft-studio-reminder-controls','''
I'd like to put the yarn inventory reminder on hold; pause it.|Check yarn inventory|pause_schedule|-
Keep the glaze order reminder paused starting now.|Order glaze|pause_schedule|-
Activate my paused reminder for oiling the sewing machine.|Oil sewing machine|resume_schedule|-
Please restart the wood treatment reminder I had paused.|Treat wood|resume_schedule|-
Can the reminder to collect the canvas be removed?|Collect canvas|cancel_schedule|-
I'm done framing the print, cancel the framing reminder.|Frame print|cancel_schedule|-
A 65-minute snooze for the paint mixing reminder please.|Mix paint|snooze_schedule|65
Hold the felt cutting nudge for another 18 minutes.|Cut felt|snooze_schedule|18
Put the clay wedging reminder off for an hour and a half.|Wedge clay|snooze_schedule|90
For my daily bobbin check reminder, use 3:45pm going forward.|Check bobbins|update_schedule|daily 15:45|daily 14:00
Have the weekly easel cleaning nudge on Monday at 10am instead.|Clean easel|update_schedule|daily 10:00 1|daily 10:00 5
I'd rather the studio rent reminder fall on the 12th every month.|Pay studio rent|update_schedule|monthly 12 09:00|monthly 1 09:00
Use Count screws before assembly as the workbench reminder's message.|Workbench check|update_schedule|text:Count screws before assembly
The reminder called Ceramic pickup should now be titled Collect the blue mugs.|Ceramic pickup|update_schedule|title:Collect the blue mugs
''')
add('test','manage_reminder','club-administration-controls','''
Put the chess club roster reminder into a paused state.|Update chess club roster|pause_schedule|-
I need the club dues reminder paused please.|Collect club dues|pause_schedule|-
Enable the book club invite reminder again.|Send book club invites|resume_schedule|-
Undo the pause on my walking group reminder.|Confirm walking group|resume_schedule|-
Delete the reminder for submitting the choir registration.|Submit choir registration|cancel_schedule|-
Please remove the nudge about ordering debate trophies.|Order debate trophies|cancel_schedule|-
The rehearsal room reminder can wait 22 minutes; snooze it.|Book rehearsal room|snooze_schedule|22
I'd like an extra 70 minutes before the tournament form reminder.|Submit tournament form|snooze_schedule|70
Snooze the club newsletter nudge by 100 minutes.|Send club newsletter|snooze_schedule|100
Move my daily membership email check to 11:25am.|Check membership emails|update_schedule|daily 11:25|daily 10:00
Change collecting the hall key to Thursdays at 5:10pm each week.|Collect hall key|update_schedule|daily 17:10 4|daily 17:10 2
Have the monthly club ledger reminder on the month's last day at 7pm.|Update club ledger|update_schedule|monthly -1 19:00|monthly 20 19:00
Edit the event reminder so it says Bring sign-in sheets and pens.|Club event prep|update_schedule|text:Bring sign-in sheets and pens
I'd like Club refreshments renamed Order tea for the reading circle.|Club refreshments|update_schedule|title:Order tea for the reading circle
''')
add('train','list_reminders','inventory-reminder-requests','''
List every reminder I've got set up.
Can you pull up my active reminders?
Show the reminders due tomorrow please.
what's on my reminder list for this week
I'd like to see all my paused reminders.
Bring up the full list of scheduled nudges.
Please list my reminders for Friday.
Can I see the reminders I set for the weekend?
show me all the reminders that are still enabled
Display my repeating reminders.
I want a list of tomorrow morning's reminders.
Could you show everything on my reminder schedule?
List the reminders that are currently on pause.
What are all my scheduled reminders?
pls list the reminders i have this month
Show me the daily reminders in my list.
Pull up my reminder list for today.
Let me see the reminders due this evening.
Please display the one-off reminders I've set.
Which reminders are active? Give me the list.
I'd like the complete inventory of my reminders.
''')
add('test','list_reminders','reminder-list-browsing','''
Open my list of upcoming reminder alerts.
Could I browse the reminders scheduled for next Tuesday?
I'd like all the weekly reminders laid out.
Please bring up reminders falling in the next seven days.
Give me an overview listing my scheduled reminders.
where's my list of reminder entries, show it please
Can you display just the paused entries from my reminders?
Let me look through the reminders planned for Sunday.
Fetch my reminder schedule as a list.
''')
add('train','save_fact','professional-contact-directory','''
Save this contact detail: Kavya's email is kavya.rao@example.com.|Kavya|email|kavya.rao@example.com
Owen's work phone is +1 202-555-0143.|Owen|phone|+1 202-555-0143
remember that Farah works at Cedar Labs|Farah|company|Cedar Labs
My email address is nisha.work@example.org.|self|email|nisha.work@example.org
Please remember Mateo's role is Operations Lead.|Mateo|role|Operations Lead
Anika's office address is 42 Elm Avenue, Pune.|Anika|address|42 Elm Avenue, Pune
Leo's company is now Northstar Studio. Update that.|Leo|company|Northstar Studio|update
actually Helena's email is helena.new@example.net|Helena|email|helena.new@example.net|update
Keep this: Arjun's phone is +91 90000 12345.|Arjun|phone|+91 90000 12345
My role has changed to Research Designer; update my saved role.|self|role|Research Designer|update
''')
add('train','save_fact','family-dates-and-addresses','''
My mother's birthday is 8 September.|mother|birthday|8 September
Remember that Dad's address is 17 Willow Lane, Jaipur.|Dad|address|17 Willow Lane, Jaipur
Saira's anniversary is 22 January, please save it.|Saira|anniversary|22 January
my brother's email is neil.family@example.com|brother|email|neil.family@example.com
Please save my birthday as 6 April.|self|birthday|6 April
Our wedding anniversary is 19 November.|self|anniversary|19 November
Update Grandma's phone to +91 90000 23456.|Grandma|phone|+91 90000 23456|update
The address you have for my sister is old; hers is now 6 Lake Road, Kochi.|sister|address|6 Lake Road, Kochi|update
Keep in mind Uncle Harish's birthday is 30 June.|Uncle Harish|birthday|30 June
save my aunt's email: aunt.lila@example.org|aunt|email|aunt.lila@example.org
''')
add('train','save_fact','colleague-role-corrections','''
Update Sofia's role to Staff Engineer.|Sofia|role|Staff Engineer|update
Ravi works at Blue Harbor now; please update his company.|Ravi|company|Blue Harbor|update
Megan's email has changed to megan.ops@example.com.|Megan|email|megan.ops@example.com|update
remember Thomas's title is Finance Manager|Thomas|role|Finance Manager
My company is Juniper Works.|self|company|Juniper Works
Save Haruto's role as Product Analyst.|Haruto|role|Product Analyst
Please note that Salma's company is Riverbend Systems.|Salma|company|Riverbend Systems
We have the wrong role for Daniel. It's now Design Director.|Daniel|role|Design Director|update
elise's company is Maple Robotics, update it pls|Elise|company|Maple Robotics|update
Remember Ingrid's email is ingrid.team@example.org.|Ingrid|email|ingrid.team@example.org
''')
add('train','save_fact','home-contact-details','''
My home address is Flat 8, 25 Garden Street, Chennai.|self|address|Flat 8, 25 Garden Street, Chennai
Save the address for Rohan: 11 Park View, Indore.|Rohan|address|11 Park View, Indore
The number for Meera is +91 90000 34567; remember it.|Meera|phone|+91 90000 34567
remember my phone is +91 90000 45678|self|phone|+91 90000 45678
Tessa's email is tessa.home@example.net.|Tessa|email|tessa.home@example.net
Update my address to 3 Palm Court, Mysuru.|self|address|3 Palm Court, Mysuru|update
My landlord's phone is +91 90000 56789.|landlord|phone|+91 90000 56789
Please remember Imran's address is 9 Hill Road, Nashik.|Imran|address|9 Hill Road, Nashik
Actually the number for Bea is +44 7700 900123.|Bea|phone|+44 7700 900123|update
save Colin's email as colin.mail@example.com|Colin|email|colin.mail@example.com
''')
add('train','save_fact','friends-celebration-details','''
Dina's birthday falls on 17 August. Remember that.|Dina|birthday|17 August
Please keep 4 February as Jasper's birthday.|Jasper|birthday|4 February
Save Amara's anniversary: 12 December.|Amara|anniversary|12 December
ben's birthday is 29 May|Ben|birthday|29 May
I got Noor's birthday wrong; update it to 23 October.|Noor|birthday|23 October|update
Remember that Zoe and Max's anniversary is 7 July.|Zoe and Max|anniversary|7 July
Ethan's birthday is 15 March.|Ethan|birthday|15 March
Please change Lucia's saved anniversary to 28 April.|Lucia|anniversary|28 April|update
Nikhil's birthday is 2 November, save that for me.|Nikhil|birthday|2 November
Maya's anniversary is actually 31 January.|Maya|anniversary|31 January|update
''')
add('train','save_fact','new-professional-network','''
Keep a note that Petra's company is Moss Architecture.|Petra|company|Moss Architecture
My work email is samira.design@example.com.|self|email|samira.design@example.com
Please save Youssef's phone: +20 100 555 0123.|Youssef|phone|+20 100 555 0123
jules is the Community Manager, remember their role|Jules|role|Community Manager
Aditi's address is Studio 12, 40 Ash Road, Hyderabad.|Aditi|address|Studio 12, 40 Ash Road, Hyderabad
Remember Jun's company is Clearwave Media.|Jun|company|Clearwave Media
I changed jobs; my company is now Orchard Analytics.|self|company|Orchard Analytics|update
Save this email for Naomi: naomi.research@example.org.|Naomi|email|naomi.research@example.org
Victor's role should be updated to Partnerships Lead.|Victor|role|Partnerships Lead|update
Please remember Oscar's birthday is 9 February.|Oscar|birthday|9 February
''')
add('train','save_fact','contact-corrections','''
Correct Asha's saved phone to +91 90000 67890.|Asha|phone|+91 90000 67890|update
My email should now be robin.personal@example.net.|self|email|robin.personal@example.net|update
Change the address for George to 24 Bridge Street, Bath.|George|address|24 Bridge Street, Bath|update
lucas has moved, save his new address as 5 Fern Close, Leeds|Lucas|address|5 Fern Close, Leeds|update
Please update Ritu's company to Copper Kite.|Ritu|company|Copper Kite|update
The birthday on record for Felix needs correcting to 18 June.|Felix|birthday|18 June|update
Sana's current role is Clinical Researcher, update it.|Sana|role|Clinical Researcher|update
remember my anniversary is 16 September|self|anniversary|16 September
I'd like to save Molly's phone as +44 7700 900456.|Molly|phone|+44 7700 900456
Arlo's email is arlo.contact@example.org; keep it.|Arlo|email|arlo.contact@example.org
''')
add('test','save_fact','neighbour-directory','''
For the address book, keep Vera at 31 Birch Crescent, Lucknow.|Vera|address|31 Birch Crescent, Lucknow
Could you store Malcolm's contact number, +44 7700 900789?|Malcolm|phone|+44 7700 900789
The email to remember for Isha is isha.neighbour@example.com.|Isha|email|isha.neighbour@example.com
Put Elliot's birthday down as 21 May.|Elliot|birthday|21 May
I have a new address for Priam: 16 Coral Lane, Surat. Replace the saved one.|Priam|address|16 Coral Lane, Surat|update
For future reference, Rosa's anniversary is 3 August.|Rosa|anniversary|3 August
It turns out Hugo's number changed. Use +33 6 00 00 12 34 in memory.|Hugo|phone|+33 6 00 00 12 34|update
Store Laila's employer as Glass Finch Design.|Laila|company|Glass Finch Design
Our neighbour Celine's role is Librarian; save that.|Celine|role|Librarian
The corrected email for Yusuf is yusuf.new@example.net, please keep that instead.|Yusuf|email|yusuf.new@example.net|update
''')
add('test','save_fact','volunteer-team-details','''
Add a fact for Esther: her role is Volunteer Coordinator.|Esther|role|Volunteer Coordinator
I want you to keep Karim's email, karim.volunteer@example.org.|Karim|email|karim.volunteer@example.org
For reference, Faye works at Willow Foundation.|Faye|company|Willow Foundation
Record Anton's birthday as 26 December.|Anton|birthday|26 December
Replace Gita's contact number in memory with +91 90000 78901.|Gita|phone|+91 90000 78901|update
I've confirmed Oona's address: 28 Rose Terrace, Madurai. Please save it.|Oona|address|28 Rose Terrace, Madurai
Could you retain the fact that Bruno's anniversary is 11 February?|Bruno|anniversary|11 February
The company stored for Nessa needs replacing with Harbour Collective.|Nessa|company|Harbour Collective|update
Keep Pavel's updated title, Programme Director.|Pavel|role|Programme Director|update
Correct the birthday you saved for Wren; it is 24 July.|Wren|birthday|24 July|update
''')
add('test','save_fact','personal-profile-records','''
Store 20 October as my birthday.|self|birthday|20 October
My personal email for your records: ellis.home@example.com.|self|email|ellis.home@example.com
I've moved house. Replace my stored address with 14 Cedar Walk, Ahmedabad.|self|address|14 Cedar Walk, Ahmedabad|update
Keep my job title as Learning Designer.|self|role|Learning Designer
The company field for me needs to say Silver Fern Health now.|self|company|Silver Fern Health|update
For future use my contact number is +91 90000 89012.|self|phone|+91 90000 89012
Could you record 5 June as my wedding anniversary?|self|anniversary|5 June
I'd like my saved email replaced by devon.primary@example.org.|self|email|devon.primary@example.org|update
Make a permanent note of my home address, 7 Orchard Rise, Bhopal.|self|address|7 Orchard Rise, Bhopal
My birthday entry needs a correction: 13 January.|self|birthday|13 January|update
''')
add('train','follow_up','missing-time-life-admin','''
Remind me to renew the library membership.|When should I remind you?|Renew the library membership
I need a reminder to send my cousin the photos.|What date and time should I use?|Send my cousin the photos
pls set a reminder to order the replacement cable|When should I remind you?|Order the replacement cable
Can you remind me to book the window cleaner?|When would you like the reminder?|Book the window cleaner
Make a reminder for getting the camera repaired.|When should I remind you?|Get the camera repaired
Every weekday remind me to empty my downloads folder.|What time on weekdays should I remind you?|Empty my downloads folder|daily|weekdays
Set up a daily reminder to check my lunch bag.|What time each day?|Check my lunch bag|daily
remind me to get the door hinge fixed|When should I remind you?|Get the door hinge fixed
I'd like a reminder to call the courier depot.|What date and time should I use?|Call the courier depot
Please remind me about transferring the old recordings.|When would you like the reminder?|Transfer the old recordings
Add a reminder to pay the class fee.|When should I remind you?|Pay the class fee
Put buying a bike pump on my reminders.|When should I remind you?|Buy a bike pump
I keep forgetting to request the transcript; set a reminder.|When should I remind you?|Request the transcript
need a daily reminder to bring the reusable cup|What time each day should I remind you?|Bring the reusable cup|daily
Can you make a weekday reminder about checking the noticeboard?|What time on weekdays?|Check the noticeboard|daily|weekdays
Remind me to finish the storage cupboard labels.|When should I remind you?|Finish the storage cupboard labels
Please schedule a reminder for collecting the membership card.|When would you like that reminder?|Collect the membership card
Nudge me to message my old mentor.|When should I nudge you?|Message my old mentor
Make sure I get a reminder about the shoe repair pickup.|When should I remind you?|Collect the shoe repair
''',mode='time')
add('train','follow_up','bare-clock-work-plans','''
Remind me at 4 to review the layout.|Is that 4am or 4pm?|Review the layout
Tomorrow at 7, remind me to test the backup.|Is that 7am or 7pm?|Test the backup
please remind me to email the illustrator at 6|Is that 6am or 6pm?|Email the illustrator
Set a reminder for Wednesday at 11 to check the server invoice.|Is that 11am or 11pm?|Check the server invoice
I need a reminder at 8:30 to send the mockups.|Is that 8:30am or 8:30pm?|Send the mockups
remind me friday at 5 to approve the proof|Is that 5am or 5pm?|Approve the proof
Tomorrow at 3:15, nudge me to review the wireframes.|Is that 3:15am or 3:15pm?|Review the wireframes
Can you remind me to call the supplier at 9?|Is that 9am or 9pm?|Call the supplier
At 2 tomorrow remind me to check the registration count.|Is that 2am or 2pm?|Check the registration count
Need a reminder to print the handouts at 10.|Is that 10am or 10pm?|Print the handouts
Set the reminder to send the revised quote for 1:30.|Is that 1:30am or 1:30pm?|Send the revised quote
remind me at 12 to archive the old branch|Is that 12am or 12pm?|Archive the old branch
Tuesday at 4:45, remind me to publish the notes.|Is that 4:45am or 4:45pm?|Publish the notes
Please remind me at 6:20 tomorrow to collect the test board.|Is that 6:20am or 6:20pm?|Collect the test board
I'd like a reminder at 7:10 for returning the projector.|Is that 7:10am or 7:10pm?|Return the projector
Can I get a reminder on Thursday at 5:30 to check the venue?|Is that 5:30am or 5:30pm?|Check the venue
Put a reminder at 9:40 to upload the transcripts.|Is that 9:40am or 9:40pm?|Upload the transcripts
remind me at 8 tomorrow about signing the draft|Is that 8am or 8pm?|Sign the draft
A reminder for checking the version tags at 11:15, please.|Is that 11:15am or 11:15pm?|Check the version tags
''',mode='ampm')
add('train','follow_up','empty-reminder-content','''
Remind me tomorrow at 8:10am.|What should I remind you about?|tomorrow 08:10
Can you set something for Friday at 6:40pm?|What should the reminder say?|weekday 5 18:40
please add a reminder in 35 mins|What should I remind you about?|+ 35
I need a reminder every day at noon.|What should I remind you about each day?|daily 12:00
Set a reminder for the 11th at 9am.|What should I remind you about?|date 11 09:00
Tomorrow evening, 7:20, remind me please.|What should I remind you about?|tomorrow 19:20
Put a reminder in for Saturday at 10:45am.|What should the reminder say?|weekday 6 10:45
reminder needed in two hours|What should I remind you about?|+ 120
I'd like a weekday reminder at 4:15pm.|What should I remind you about on weekdays?|daily 16:15 1,2,3,4,5
Can you remind me tonight at 9:05?|What should I remind you about?|today 21:05
Add a reminder on the last day of each month at 5pm.|What should the reminder say?|monthly -1 17:00
Please set up a reminder for Wednesday at 8:55am.|What should I remind you about?|weekday 3 08:55
Make a reminder for an hour from now.|What should I remind you about?|+ 60
remind me on the 17th at 2pm pls|What should I remind you about?|date 17 14:00
I want a reminder every Sunday at 11:30am.|What should the weekly reminder say?|daily 11:30 7
Tomorrow 6:25am, set a nudge.|What should I remind you about?|tomorrow 06:25
A reminder every three hours, please.|What should I remind you about?|interval 180
Can you remind me on Monday at 3:35pm?|What should I remind you about?|weekday 1 15:35
pls schedule a reminder for tonight 10:20|What should the reminder say?|today 22:20
''',mode='subject')
add('train','follow_up','ambiguous-reminder-selection','''
Pause my reading reminder.|Which one: Read fiction or Read research papers?|Read fiction|Read research papers
Delete the reminder about calling home.|Which one: Call parents or Call brother?|Call parents|Call brother
snooze my exercise reminder for 20 mins|Which one: Morning workout or Evening workout?|Morning workout|Evening workout
Move the invoice reminder to 10am.|Which one: Send client invoice or Pay supplier invoice?|Send client invoice|Pay supplier invoice
Resume the reminder for checking plants.|Which one: Check indoor plants or Check balcony plants?|Check indoor plants|Check balcony plants
Cancel the medication pickup reminder.|Which one: Collect Dad's prescription or Collect Mum's prescription?|Collect Dad's prescription|Collect Mum's prescription
Please pause the backup reminder.|Which one: Back up laptop or Back up photo drive?|Back up laptop|Back up photo drive
Change the bill payment reminder to Friday at 2pm.|Which one: Pay electricity bill or Pay gas bill?|Pay electricity bill|Pay gas bill
get rid of my practice reminder|Which one: Piano practice or French practice?|Piano practice|French practice
Snooze the dog reminder for half an hour.|Which one: Feed dog or Walk dog?|Feed dog|Walk dog
I'd like to pause the reminder about checking email.|Which one: Check work email or Check personal email?|Check work email|Check personal email
Can you resume the book return reminder?|Which one: Return city library books or Return college library books?|Return city library books|Return college library books
Move the meeting prep reminder to tomorrow at 8am.|Which one: Prepare design meeting or Prepare sales meeting?|Prepare design meeting|Prepare sales meeting
Cancel the shopping reminder.|Which one: Buy groceries or Buy stationery?|Buy groceries|Buy stationery
pause the reminder for cleaning filters pls|Which one: Clean vacuum filter or Clean air purifier filter?|Clean vacuum filter|Clean air purifier filter
Update the car reminder to 7pm.|Which one: Wash car or Check car oil?|Wash car|Check car oil
Remove my parcel reminder.|Which one: Collect parcel from locker or Collect parcel from reception?|Collect parcel from locker|Collect parcel from reception
Snooze the laundry nudge for 15 minutes.|Which one: Hang laundry or Fold laundry?|Hang laundry|Fold laundry
Resume my reminder to charge batteries.|Which one: Charge camera battery or Charge drill battery?|Charge camera battery|Charge drill battery
''',mode='multiple')
add('train','follow_up','missing-existing-reminder','''
Cancel my dental cleaning reminder.|Which existing reminder did you mean?
Pause the swimming lesson reminder.|Which reminder should I pause?
snooze the laptop repair reminder for 25 mins|Which existing reminder should I snooze?
Move the reminder about picking up the violin to tomorrow at 5pm.|Which existing reminder did you mean?
Resume the passport collection reminder.|Which reminder should I resume?
Delete my optician reminder.|Which existing reminder should I delete?
Please change the tennis lesson reminder to Saturday 9am.|Which existing reminder did you mean?
Can you pause the reminder for the accountant call?|Which reminder should I pause?
Cancel the notice about collecting my curtains.|Which existing reminder did you mean?
Update my freezer delivery reminder to noon tomorrow.|Which existing reminder should I change?
put the driving lesson reminder on pause|Which existing reminder did you mean?
Snooze the reminder to visit the registrar for 10 minutes.|Which existing reminder should I snooze?
Remove the reminder to renew the fishing licence.|Which existing reminder did you mean?
I want to resume my photography class reminder.|Which existing reminder should I resume?
Cancel the reminder about collecting the bike frame.|Which reminder did you mean?
Please move the visa interview reminder to Thursday 10am.|Which existing reminder should I change?
Pause the reminder to check my storage unit.|Which existing reminder did you mean?
resume my reminder to ring the estate agent|Which existing reminder should I resume?
''',mode='none')
add('train','follow_up','unresolved-demonstrative','''
Remind me about this tomorrow at 9:30am.|What does this refer to?|tomorrow 09:30
In 45 minutes, remind me to finish that.|What should I remind you to finish?|+ 45
please remind me to send it tonight at 8:40|What should I remind you to send?|today 20:40
Set a reminder for that thing on Friday at 4pm.|What should I remind you about?|weekday 5 16:00
Remind me to take care of this at noon tomorrow.|What should I remind you to take care of?|tomorrow 12:00
Nudge me about it in an hour.|What should I remind you about?|+ 60
Could you remind me to check this on Monday at 10am?|What should I remind you to check?|weekday 1 10:00
Put a reminder for doing that tomorrow at 6pm.|What should I remind you to do?|tomorrow 18:00
remind me to reply to them in 20 minutes|Who should I remind you to reply to?|+ 20
On the 8th at 11am, remind me about the thing.|What should I remind you about?|date 8 11:00
I'd like a reminder to bring that on Sunday at 7am.|What should I remind you to bring?|weekday 7 07:00
Please remind me tonight at 9 to fix this.|What should I remind you to fix?|today 21:00
Tomorrow 2pm, remind me to collect those.|What should I remind you to collect?|tomorrow 14:00
set a reminder about it for tuesday at 5pm|What should I remind you about?|weekday 2 17:00
In half an hour remind me to look at that again.|What should I remind you to look at?|+ 30
I need a nudge about this on the 14th at 8am.|What should I remind you about?|date 14 08:00
Remind me to order another one tomorrow at 3pm.|What should I remind you to order?|tomorrow 15:00
Please schedule a reminder to finish this tonight at 10.|What should I remind you to finish?|today 22:00
''',mode='reference')
add('test','follow_up','missing-time-shopping-preparation','''
Add buy a new raincoat to my reminders.|When should I remind you?|Buy a new raincoat
I'd like reminding about comparing mattress sizes.|When would you like the reminder?|Compare mattress sizes
Could a reminder help me remember to return the headphones? Set one.|When should I remind you?|Return the headphones
remember to nudge me about the printer cartridge order|When should I nudge you?|Order the printer cartridge
Put a recurring daily reminder in for carrying my shopping bags.|What time each day?|Carry my shopping bags|daily
Make an ongoing weekday nudge for checking the grocery list.|What time on weekdays should I remind you?|Check the grocery list|daily|weekdays
I ought to collect the replacement spectacles; create a reminder for it.|When should I remind you?|Collect the replacement spectacles
Have a reminder ready for buying the new kettle.|When would you like that reminder?|Buy the new kettle
''',mode='time')
add('test','follow_up','bare-clock-travel-plans','''
A reminder for packing my passport tomorrow at 6, please.|Is that 6am or 6pm?|Pack my passport
At 4:10 on Saturday I want reminding to check in.|Is that 4:10am or 4:10pm?|Check in
Can you put booking the ferry in my reminders for 8?|Is that 8am or 8pm?|Book the ferry
The reminder for downloading offline maps should be at 9:15 tomorrow.|Is that 9:15am or 9:15pm?|Download offline maps
Give me a nudge to confirm the airport transfer on Friday at 3.|Is that 3am or 3pm?|Confirm the airport transfer
make a reminder about getting travel adapters at 11 on monday|Is that 11am or 11pm?|Get travel adapters
I'd like 7:45 to be the reminder for collecting the travel bag.|Is that 7:45am or 7:45pm?|Collect the travel bag
For asking about baggage allowance, can I get a nudge at 2:20?|Is that 2:20am or 2:20pm?|Ask about baggage allowance
''',mode='ampm')
add('test','follow_up','time-only-notification-requests','''
A 7:35am reminder tomorrow, please.|What should the reminder say?|tomorrow 07:35
Can I have a nudge 55 minutes from now?|What should I remind you about?|+ 55
For each Monday 8:45pm, add a reminder.|What should the weekly reminder say?|daily 20:45 1
Make the 26th at 12:20pm a reminder for me.|What should I remind you about?|date 26 12:20
Would you put in a nightly 10:45pm reminder?|What should I remind you about each night?|daily 22:45
I'd like something in my reminders for Thursday at 3:10pm.|What should I remind you about?|weekday 4 15:10
Schedule me a reminder at 25-minute intervals.|What should the repeating reminder say?|interval 25
need a notification reminder tonight 6:55pm|What should I remind you about?|today 18:55
''',mode='subject')
add('test','follow_up','ambiguous-club-nudges','''
Could you disable the club payment reminder by pausing it?|Which one: Pay chess club fee or Pay sailing club fee?|Pay chess club fee|Pay sailing club fee
I want the session booking reminder deleted.|Which one: Book practice session or Book coaching session?|Book practice session|Book coaching session
Let my team reminder wait 30 minutes.|Which one: Confirm junior team or Confirm senior team?|Confirm junior team|Confirm senior team
The rehearsal reminder needs moving to Friday 7pm.|Which one: Choir rehearsal or Theatre rehearsal?|Choir rehearsal|Theatre rehearsal
Turn the event ticket reminder back on.|Which one: Buy concert tickets or Buy match tickets?|Buy concert tickets|Buy match tickets
Could my lesson reminder happen at 10am instead?|Which one: Dance lesson or Drawing lesson?|Dance lesson|Drawing lesson
get the tournament reminder out of my list|Which one: Chess tournament or Tennis tournament?|Chess tournament|Tennis tournament
Put the newsletter reminder on hold, pause it.|Which one: Write club newsletter or Send club newsletter?|Write club newsletter|Send club newsletter
''',mode='multiple')
add('test','follow_up','unknown-service-reminder','''
Remove the reminder for the boiler inspection from my list.|Which existing reminder should I remove?
Could the upholstery cleaning reminder be paused?|Which existing reminder did you mean?
I need a 40-minute snooze for the chimney sweep reminder.|Which existing reminder should I snooze?
Change the reminder for collecting the repaired vacuum to Thursday noon.|Which existing reminder should I change?
Bring back my paused reminder about testing the intercom.|Which existing reminder did you mean?
Cancel whichever reminder I set for the roof survey.|Which existing reminder should I cancel?
I'd like the washing machine installation reminder to say Bring the receipt.|Which existing reminder did you mean?
Please shift my water tank cleaning reminder to tomorrow at 11am.|Which existing reminder should I change?
''',mode='none')
add('test','follow_up','unidentified-object-actions','''
Tomorrow at 11:15am, prompt me to bring the other one.|What should I remind you to bring?|tomorrow 11:15
Make a reminder to forward this on Saturday 3pm.|What should I remind you to forward?|weekday 6 15:00
I'd like a nudge about sorting those out in 75 minutes.|What should I remind you to sort out?|+ 75
Add get it replaced as a reminder for tonight at 8:25.|What should I remind you to replace?|today 20:25
can i have a reminder to sign that on the 19th at 9am|What should I remind you to sign?|date 19 09:00
Give me a Sunday 6:30pm reminder to ask her about it.|Who and what should the reminder refer to?|weekday 7 18:30
Set a reminder to take these back tomorrow at 4:20pm.|What should I remind you to take back?|tomorrow 16:20
In 42 minutes I'd like to be reminded to try that again.|What should I remind you to try?|+ 42
''',mode='reference')
add('train','answer_follow_up','complete-family-reminder-time','''
Tomorrow at 6:45pm please.|Remind me to send Aunt Mina the recipe.|When should I remind you?|Send Aunt Mina the recipe|tomorrow 18:45
Friday at 10am.|Set a reminder to collect my nephew's uniform.|When should I remind you?|Collect my nephew's uniform|weekday 5 10:00
in 35 mins pls|Remind me to call my brother back.|When should I remind you?|Call my brother back|+ 35
Let's do Sunday at noon.|I need a reminder to print the family photo.|When should I remind you?|Print the family photo|weekday 7 12:00
At 8:20pm tomorrow would work.|Remind me to ask Dad about the warranty.|When should I remind you?|Ask Dad about the warranty|tomorrow 20:20
The 12th at 9:15am.|Remind me to send the birthday parcel.|When should I remind you?|Send the birthday parcel|date 12 09:15
Tonight 7:40.|Put a reminder in for checking Mum's train.|When should I remind you?|Check Mum's train|today 19:40
After two hours.|Remind me to reply to the family group.|When should I remind you?|Reply to the family group|+ 120
Tuesday, 5:30pm please.|Remind me to collect my cousin's keys.|When should I remind you?|Collect my cousin's keys|weekday 2 17:30
Tomorrow morning at 8:05.|Set a reminder to ask Uncle Jay about lunch.|When should I remind you?|Ask Uncle Jay about lunch|tomorrow 08:05
make it saturday 11:45am|I need a reminder to return the baby carrier.|When should I remind you?|Return the baby carrier|weekday 6 11:45
In an hour and a half.|Remind me to send Gran the invitation.|When should I remind you?|Send Gran the invitation|+ 90
Monday evening at 6:10.|Create a reminder to ask my sister for the address.|When should I remind you?|Ask my sister for the address|weekday 1 18:10
On the 24th, 2pm.|Remind me to book the family lunch.|When should I remind you?|Book the family lunch|date 24 14:00
''')
add('train','answer_follow_up','disambiguate-office-hour','''
4pm, thanks.|Remind me tomorrow at 4 to check the print run.|Is that 4am or 4pm?|Check the print run|tomorrow 16:00
I mean 8 in the morning.|Remind me tomorrow at 8 to take the office keys.|Is that 8am or 8pm?|Take the office keys|tomorrow 08:00
7:30pm.|Remind me Friday at 7:30 to send the revision.|Is that 7:30am or 7:30pm?|Send the revision|weekday 5 19:30
The afternoon one, 3pm.|Remind me tomorrow at 3 to confirm the quote.|Is that 3am or 3pm?|Confirm the quote|tomorrow 15:00
10am please.|Set a reminder on Monday at 10 to upload the slides.|Is that 10am or 10pm?|Upload the slides|weekday 1 10:00
6 in the evening.|Remind me tomorrow at 6 to finish the notes.|Is that 6am or 6pm?|Finish the notes|tomorrow 18:00
morning, 9:15am|Remind me Tuesday at 9:15 to check the test devices.|Is that 9:15am or 9:15pm?|Check the test devices|weekday 2 09:15
Make that 11pm.|Remind me tomorrow at 11 to stop the export.|Is that 11am or 11pm?|Stop the export|tomorrow 23:00
At 5:20 in the afternoon.|Remind me Thursday at 5:20 to email the organiser.|Is that 5:20am or 5:20pm?|Email the organiser|weekday 4 17:20
It's 1pm.|Remind me tomorrow at 1 to review the ticket.|Is that 1am or 1pm?|Review the ticket|tomorrow 13:00
2:45pm is right.|Remind me Wednesday at 2:45 to log the experiment.|Is that 2:45am or 2:45pm?|Log the experiment|weekday 3 14:45
12 noon.|Remind me tomorrow at 12 to hand over the samples.|Is that 12am or 12pm?|Hand over the samples|tomorrow 12:00
8:40 in the evening please.|Remind me Saturday at 8:40 to save the raw footage.|Is that 8:40am or 8:40pm?|Save the raw footage|weekday 6 20:40
6:10am, early start.|Remind me tomorrow at 6:10 to charge the demo unit.|Is that 6:10am or 6:10pm?|Charge the demo unit|tomorrow 06:10
''')
add('train','answer_follow_up','supply-household-reminder-content','''
Collect the spare house key.|Remind me tomorrow at 11am.|What should I remind you about?|Collect the spare house key|tomorrow 11:00
to rinse the water filter|Set a reminder for Friday at 5pm.|What should the reminder say?|Rinse the water filter|weekday 5 17:00
Pay the cleaner.|Remind me in 40 minutes.|What should I remind you about?|Pay the cleaner|+ 40
It should say bring the folding chairs.|Make a reminder for Saturday at 8am.|What should the reminder say?|Bring the folding chairs|weekday 6 08:00
Check the freezer temperature.|Remind me tomorrow at 7:15am.|What should I remind you about?|Check the freezer temperature|tomorrow 07:15
buy the door mat pls|Remind me tonight at 8pm.|What should I remind you about?|Buy the door mat|today 20:00
Send the meter reading.|I need a reminder on the 6th at 10am.|What should the reminder say?|Send the meter reading|date 6 10:00
Remind me to put the bins out.|Remind me every Monday at 7am.|What should I remind you about?|Put the bins out|daily 07:00 1
Empty the lint trap.|Add a reminder tomorrow at noon.|What should I remind you about?|Empty the lint trap|tomorrow 12:00
To collect the new curtains.|Set a reminder for Tuesday 4pm.|What should the reminder say?|Collect the new curtains|weekday 2 16:00
wipe the dining table|I want a reminder every day at 9pm.|What should the reminder say?|Wipe the dining table|daily 21:00
Bring in the parcel from the porch.|Remind me in 25 minutes.|What should I remind you about?|Bring in the parcel from the porch|+ 25
Book the annual boiler service.|Remind me on the 18th at 11:30am.|What should I remind you about?|Book the annual boiler service|date 18 11:30
Rotate the mattress.|Set a reminder for Sunday at 3pm.|What should the reminder say?|Rotate the mattress|weekday 7 15:00
''',mode='subject')
add('train','answer_follow_up','incomplete-time-reply','''
Tomorrow.|Remind me to arrange the balcony repair.|When should I remind you?|Arrange the balcony repair|What time tomorrow should I remind you?
At 6.|Remind me to collect the framed certificate.|When should I remind you?|Collect the framed certificate|Is that 6am or 6pm?
In the evening.|Remind me to ring the language tutor.|When should I remind you?|Ring the language tutor|What evening date and time should I use?
Friday would be good.|Remind me to book the swimming lane.|When should I remind you?|Book the swimming lane|What time on Friday?
probably next week|Remind me to sort the old cables.|When should I remind you?|Sort the old cables|Which day and time next week?
Every weekday.|Remind me to clear the desktop screenshots.|When should I remind you?|Clear the desktop screenshots|What time on weekdays?
8:30.|Remind me to reserve the badminton court.|When should I remind you?|Reserve the badminton court|Is that 8:30am or 8:30pm?
''',mode='still')
add('test','answer_follow_up','finish-volunteer-schedule','''
Could we use Thursday at 12:10pm?|Remind me to contact the donation centre.|When would you like that reminder?|Contact the donation centre|weekday 4 12:10
Give it another 50 minutes from now.|I need a reminder to send the cleanup map.|When should I remind you?|Send the cleanup map|+ 50
Tomorrow, 9:35 in the morning sounds right.|Remind me to count the spare gloves.|When should I remind you?|Count the spare gloves|tomorrow 09:35
The 21st at 4:25pm works.|Remind me to confirm the first-aid volunteer.|When should I remind you?|Confirm the first-aid volunteer|date 21 16:25
Sunday afternoon at 2:20, please.|Set a reminder to collect the event aprons.|When should I remind you?|Collect the event aprons|weekday 7 14:20
90 minutes after now please.|I need reminding to sort the donation receipts.|When should I remind you?|Sort the donation receipts|+ 90
''')
add('test','answer_follow_up','resolve-clinic-hour','''
The 7 at night.|Remind me tomorrow at 7 to collect the lab report.|Is that 7am or 7pm?|Collect the lab report|tomorrow 19:00
Use 10:30 in the morning.|Remind me on Friday at 10:30 to confirm the scan.|Is that 10:30am or 10:30pm?|Confirm the scan|weekday 5 10:30
Afternoon please, 2:15.|Remind me tomorrow at 2:15 to print the referral.|Is that 2:15am or 2:15pm?|Print the referral|tomorrow 14:15
Early one, 5am.|Remind me Saturday at 5 to pack the clinic bag.|Is that 5am or 5pm?|Pack the clinic bag|weekday 6 05:00
I meant 11:40am for that.|Remind me tomorrow at 11:40 to phone the receptionist.|Is that 11:40am or 11:40pm?|Phone the receptionist|tomorrow 11:40
Make it the evening 6:50.|Remind me Wednesday at 6:50 to check the appointment email.|Is that 6:50am or 6:50pm?|Check the appointment email|weekday 3 18:50
''')
add('test','answer_follow_up','name-travel-reminder-subject','''
It's for downloading the city map.|Can I have a reminder tomorrow at 6:40pm?|What should the reminder say?|Download the city map|tomorrow 18:40
Packing the spare socks.|Put in a Friday 8:25am reminder.|What should I remind you about?|Pack the spare socks|weekday 5 08:25
The message is confirm the return ferry.|I'd like a reminder in 55 minutes.|What should the reminder say?|Confirm the return ferry|+ 55
I need to buy the luggage strap.|Remind me tonight at 7:10.|What should I remind you about?|Buy the luggage strap|today 19:10
Use Check the hotel address.|Make a reminder for the 14th at 9:50am.|What should the reminder say?|Check the hotel address|date 14 09:50
Refilling the travel bottle is what it's for.|Set a Sunday 5:45pm reminder.|What should I remind you about?|Refill the travel bottle|weekday 7 17:45
''',mode='subject')
add('test','answer_follow_up','unfinished-shopping-time','''
Sometime Saturday.|Add a reminder to compare the vacuum sizes.|When should I remind you?|Compare the vacuum sizes|What time on Saturday should I remind you?
I'd say at 9.|Remind me to collect the replacement kettle.|When should I remind you?|Collect the replacement kettle|Is that 9am or 9pm?
Next month sometime.|I need a reminder to order a winter coat.|When should I remind you?|Order a winter coat|What date and time next month?
''',mode='still')
add('train','plain_question','retrieve-work-conversations','''
what did aileen say about the onboarding flow?
find the thread where we discussed the api quota.
who raised the concern about the deployment window?
where did vikram put the revised sitemap
what was the decision on the export format?
pull up the conversation about customer retention.
did lotte mention why the import failed?
which channel had the screenshots of the navigation bug?
what did i tell the designer about the empty state?
find the message with the link to the prototype
who offered to review the database proposal?
can you recall the discussion around search latency?
what was the deadline mentioned in the security review?
where did we leave the conversation about dark mode?
what did emilio want changed in the settings page?
who sent me that spreadsheet about headcount
find the notes from the call about vendor access.
what objections came up about the new naming scheme?
did we agree to keep the csv download?
what did the qa team say about the flaky test?
show me the discussion where we settled on the icon size.
''')
add('train','plain_question','recall-reading-and-research','''
find the article i read about actor systems.
what was that paper on compact language models called?
where did i see the comparison of sqlite and duckdb
which blog explained retry backoff with a diagram?
what did i read about the memory allocator yesterday?
can you find the guide to accessible colour palettes?
i saw an essay about writing better error messages; where was it?
who wrote the post about software archaeology?
pull up the research i saved on solar desalination.
what was the main point of the article about deep work
did i bookmark anything about service blueprints?
where is the page on bicycle gear ratios i opened?
find my notes on the book about urban trees.
which talk covered observability for background jobs?
what was the recommendation in the piece about screen glare?
can you recall that tutorial for sourdough scoring?
i read a comparison of induction cookers. find it.
what's the title of the essay on public libraries
where did i see the list of native flowering plants?
what did the interview with the furniture maker say about joinery?
find the article that explained how e-ink refreshes work.
''')
add('train','plain_question','inspect-reminder-history','''
when is the next reminder about the broadband bill?
did i set anything for tomorrow afternoon?
what time did i choose for the monthly filing reminder?
is my reminder about the dry cleaning paused
did i already cancel the reminder to order ink?
when did i create the reminder for the eye test?
what's the message on my weekly cleaning reminder?
has the reminder about collecting the ring already fired?
do i have a reminder related to the passport office?
what day does my reminder about the council fee use
was the reminder for checking the leak set for 9am or 9pm?
why was i going to call the accountant tomorrow?
have i ever mentioned changing the dog walk reminder?
what did i ask you to remind me about last tuesday?
is the passport pickup reminder a one-off?
when did i last talk about pausing the budget reminder?
what time is my reminder for charging the camera
did i leave a reminder about returning the monitor?
which reminder did i mention in yesterday's chat?
is the reminder about the storage payment monthly?
do you remember why i wanted the saturday alarm?
''')
add('train','plain_question','transient-personal-status','''
my laptop battery is nearly empty.
i'm exhausted after that workshop.
my coffee's gone cold again
i feel like taking a long walk.
the internet is really slow this afternoon.
i'm waiting for the parcel downstairs.
my hands are freezing.
i can't find my blue notebook right now.
i'm running late for lunch.
my train is stuck outside the station
the neighbour's dog is barking again.
i'm feeling a bit distracted today.
this chair is uncomfortable.
i don't have the energy to finish the draft tonight.
my headphones are charging.
i just spilled water on the desk.
the kettle is still boiling.
not in the mood to cook this evening
i'm looking forward to the weekend.
the room is too warm at the moment.
my phone has no signal here.
''')
add('train','plain_question','retrieve-personal-logistics','''
where did i save the hotel confirmation?
what time was my appointment with the physiotherapist?
who was going to collect the spare keys
which restaurant did we pick for the reunion?
what did the repair shop say about the estimate?
find the email with the train booking reference.
did my sister send the address for the party?
where is the list of things to bring on the hike?
what was the delivery date for the replacement fan?
can you find the plumber's message about the leak
which day did we agree to visit the museum?
what was the cafe name that luca recommended?
who has the spare folding table?
find the conversation about the lost umbrella.
did the library say i could renew the books online?
what measurements did i write down for the wardrobe?
where did i put the quote for fixing the gate
what did the tailor say about the sleeve length?
which courier was handling the return shipment?
can you find the route my friend suggested for cycling?
what was the baggage allowance in the booking email?
''')
add('train','plain_question','lookup-saved-profile-facts','''
what's the email address i have for noor?
do you remember my brother's birthday?
where does sienna work now
what phone number did i save for the building manager?
when is my parents' anniversary?
what's my saved home address?
which company did reuben join?
what role does priyanka have on the team?
can you look up helena's contact details from my notes?
what birthday did i write down for ada
did i save the address of the pottery studio?
what's the phone number in the message from the electrician?
what did i say my new job title was?
where is my cousin's office?
when does milo celebrate his birthday?
who is the operations lead at cedar labs?
what email did the mentor ask me to use
do you have the date of zara's anniversary in memory?
what address was on the parcel label i copied?
which contact number did i use for the florist?
what's my aunt's current email?
''')
add('test','plain_question','recover-creative-feedback','''
i'd like to revisit the feedback on my landscape photos.
can you locate the chat about the ending of my short story?
what did the instructor suggest for improving the bowl shape?
which recording had the drum fill i wanted to practise?
where were the notes about changing the poster colours
what did the editor think of my opening paragraph?
locate the reference image i used for the bird sketch.
which part of the song did the teacher say was too fast?
what were the framing options i compared last weekend?
help me find the message about the glaze turning cloudy.
who suggested the wider border for the lino print?
i want the notes from the lighting workshop i attended.
what did the critique group say about the dialogue?
where can i find the list of lenses i researched?
any idea which page had that knitting chart i looked at
what was the alternative chord progression i saved?
find the feedback thread for the festival logo.
which clay body did the studio recommend in that email?
''')
add('test','plain_question','community-memory-questions','''
who volunteered to bring the spare microphone to the fundraiser?
where's the document listing the shelter's donation needs?
what time did the walking group agree to meet on sunday?
can you locate the message about the cancelled rehearsal?
who had the keys for the community hall last time
what were the rules for entering the local photo contest?
which park did the cleanup organisers choose?
what did the club treasurer say about membership fees?
find the email explaining how to collect the race bib.
which days was the food bank accepting deliveries?
was the chess tournament meant to start at 10am?
i need the notes from the neighbourhood planning meeting.
where is the signup link for the public garden tour?
what did the organiser say about bringing children?
who was coordinating the transport for the beach cleanup?
can you recover that list of books for the reading circle
what was the amount mentioned for renting the hall?
where did the cycling club post the revised route?
''')
add('test','plain_question','passive-status-and-reminder-inquiries','''
i'm on the bus and my headphones just died.
the reminder about the volunteer shift was for what time?
my desk is covered in packaging right now.
was there already a nudge set for checking the tyre pump?
i slept badly and can't concentrate on this page.
how often does the reminder for cleaning the easel repeat?
the shop's queue is moving very slowly.
had i paused the reminder for the choir fees?
my screen keeps flickering this morning
do you know whether i scheduled a reminder for collecting the clay?
i'm not feeling hungry yet.
what wording did i use in that ferry booking reminder?
the printer is out of paper at the moment.
is there already a reminder attached to the library event?
i left my jacket in the meeting room today.
when was i supposed to get the reminder about the club badges?
i'm trying to focus but the street outside is noisy.
did i mention a reminder for this evening during yesterday's chat?
''')

# Append newly authored rows after the original train and test rows. This preserves every
# original clock, context, id, and serialized test example.
from expansion_data import append_rows
append_rows(add, ROWS, schedule)

# Known fields survive a question about which existing reminder to select.
KNOWN_SELECTION_FIELDS = {
    'snooze my exercise reminder for 20 mins': {'minutes':20},
    'Move the invoice reminder to 10am.': {'timing_spec':'daily 10:00'},
    'Change the bill payment reminder to Friday at 2pm.': {'timing_spec':'daily 14:00 5'},
    'Snooze the dog reminder for half an hour.': {'minutes':30},
    'Move the meeting prep reminder to tomorrow at 8am.': {'timing_spec':'tomorrow 08:00'},
    'Update the car reminder to 7pm.': {'timing_spec':'daily 19:00'},
    'Snooze the laundry nudge for 15 minutes.': {'minutes':15},
    'snooze the laptop repair reminder for 25 mins': {'minutes':25},
    'Move the reminder about picking up the violin to tomorrow at 5pm.': {'timing_spec':'tomorrow 17:00'},
    'Please change the tennis lesson reminder to Saturday 9am.': {'timing_spec':'weekday 6 09:00'},
    'Update my freezer delivery reminder to noon tomorrow.': {'timing_spec':'tomorrow 12:00'},
    'Snooze the reminder to visit the registrar for 10 minutes.': {'minutes':10},
    'Please move the visa interview reminder to Thursday 10am.': {'timing_spec':'weekday 4 10:00'},
    'Let my team reminder wait 30 minutes.': {'minutes':30},
    'The rehearsal reminder needs moving to Friday 7pm.': {'timing_spec':'daily 19:00 5'},
    'Could my lesson reminder happen at 10am instead?': {'timing_spec':'daily 10:00'},
    'I need a 40-minute snooze for the chimney sweep reminder.': {'minutes':40},
    'Change the reminder for collecting the repaired vacuum to Thursday noon.': {'timing_spec':'weekday 4 12:00'},
    "I'd like the washing machine installation reminder to say Bring the receipt.": {'message':'Bring the receipt'},
    'Please shift my water tank cleaning reminder to tomorrow at 11am.': {'timing_spec':'tomorrow 11:00'},
}
for row in ROWS:
    for key,value in KNOWN_SELECTION_FIELDS.get(row['message'],{}).items():
        if key=='timing_spec':
            row['expected']['timing']=timing(value,datetime.fromisoformat(row['situation']['now']).replace(tzinfo=None))
        else:
            row['expected'][key]=value

# Fact scenarios distinguish the record being changed and create versus update.
# This keeps one scenario coherent even when a topical group contains many attributes.
for row in ROWS:
    if row['scenario'] in {'professional-contact-directory','family-dates-and-addresses','colleague-role-corrections','home-contact-details'}:
        e = row['expected']
        row['scenario'] += '-' + e['attribute'] + '-' + ('update' if e['action']=='update_fact' else 'save')

# Real schedule ids are opaque and in no particular order. Fixed names like s-target would let a model
# copy the id without reading the titles, so each row gets fresh random ids and a shuffled list.
for row in ROWS:
    rng = random.Random('ids-' + row['id'])
    schedules = row['situation']['schedules']
    rename = {s['id']: f'sch_{rng.getrandbits(32):08x}' for s in schedules}
    for s in schedules:
        s['id'] = rename[s['id']]
    rng.shuffle(schedules)
    if 'schedule_id' in row['expected']:
        row['expected']['schedule_id'] = rename[row['expected']['schedule_id']]

if __name__ == '__main__':
    for split in ('train','test'):
        rows=[{k:v for k,v in row.items() if k!='_split'} for row in ROWS if row['_split']==split]
        (ROOT/f'{split}.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in rows))
        print(split,len(rows))
