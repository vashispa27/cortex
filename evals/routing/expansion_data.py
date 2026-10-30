"""Additional individually authored routing rows; author.py computes labels and contexts."""

def append_rows(add, rows, schedule):
    start = len(rows)
    # Missing time: independent situations across home, work, travel, hobbies, and family.
    add('train','follow_up','school-office-time-clarifications','''
Remind me to return the permission slip.|When should I remind you?|Return the permission slip
Could you nudge me to email the class coordinator?|What date and time should I use?|Email the class coordinator
set up a reminder for the science fair supplies pls|When should I remind you?|Prepare science fair supplies
I keep forgetting to collect the art folder from school. Remind me.|When would you like the reminder?|Collect the art folder from school
Every weekday remind me to check the parent portal.|What time on weekdays?|Check the parent portal|daily|weekdays
''',mode='time')
    add('train','follow_up','apartment-repair-time-clarifications','''
Remind me to ask the super about the hallway light.|When should I remind you?|Ask the superintendent about the hallway light
I need to book someone to fix the kitchen tap; remind me.|When would you like that reminder?|Book a kitchen tap repair
pls nudge me to send the leak photos to maintenance|When should I remind you?|Send leak photos to maintenance
Can you remind me to collect the spare mailbox key?|What date and time should I use?|Collect the spare mailbox key
Make a weekday reminder for putting cardboard out.|What time on weekdays?|Put cardboard out|daily|weekdays
''',mode='time')
    add('train','follow_up','community-theatre-time-clarifications','''
Please remind me to return the costume rack.|When should I remind you?|Return the costume rack
I should message the lighting volunteer; can you remind me?|What date and time should I use?|Message the lighting volunteer
remind me to bring the ticket float to rehearsal|When would you like a reminder?|Bring the ticket float to rehearsal
Need a nudge to print the cast list, thanks.|When should I remind you?|Print the cast list
Add a daily reminder to check the rehearsal room booking.|What time each day?|Check the rehearsal room booking|daily
''',mode='time')
    add('train','follow_up','bike-workshop-time-clarifications','''
Remind me to order new brake pads.|When should I remind you?|Order new brake pads
can you remind me to ask Jae about the wheel stand|When would you like that reminder?|Ask Jae about the wheel stand
I need to take the repaired pump back to the shop. Nudge me.|What date and time should I use?|Return the repaired pump to the shop
Please set a reminder to check the chain wear.|When should I remind you?|Check the chain wear
Make a weekly reminder to charge the workshop lights.|What time each week?|Charge the workshop lights|daily
''',mode='time')
    add('train','follow_up','garden-swap-time-clarifications','''
Remind me to label the seed envelopes.|When would you like that reminder?|Label the seed envelopes
Could you remind me to bring empty pots to the swap?|When should I remind you?|Bring empty pots to the swap
pls nudge me to ask Mina for the tomato seedlings|What date and time should I use?|Ask Mina for the tomato seedlings
I promised to update the allotment map. Set me a reminder.|When should I remind you?|Update the allotment map
Set a weekday reminder to water the greenhouse trays.|What time on weekdays?|Water the greenhouse trays|daily|weekdays
''',mode='time')
    add('train','follow_up','ceramics-studio-time-clarifications','''
Remind me to wedge the clay before class.|When should I remind you?|Wedge the clay before class
I need to pick up the kiln shelf; could you nudge me?|When would you like the reminder?|Pick up the kiln shelf
please remind me to photograph the glaze tests|What date and time should I use?|Photograph the glaze tests
Add a reminder for cleaning the trimming tools.|When should I remind you?|Clean the trimming tools
Every Sunday remind me to wrap the finished bowls.|What time on Sundays?|Wrap the finished bowls|daily
''',mode='time')
    add('train','follow_up','neighborhood-cleanup-time-clarifications','''
Can you remind me to borrow the litter pickers?|When should I remind you?|Borrow the litter pickers
I ought to send the route map to the volunteers. Nudge me.|When would you like the reminder?|Send the route map to the volunteers
remind me to refill the first aid kit for the cleanup|What date and time should I use?|Refill the first aid kit
Set a reminder to return the borrowed hi-vis vests.|When should I remind you?|Return the borrowed hi-vis vests
Make a daily reminder to check the weather notice.|What time each day?|Check the weather notice|daily
''',mode='time')
    add('train','follow_up','family-recipe-book-time-clarifications','''
Remind me to scan Auntie Nita's recipe cards.|When would you like that reminder?|Scan Auntie Nita's recipe cards
I should buy dividers for the family cookbook; nudge me.|When should I remind you?|Buy dividers for the family cookbook
Can you remind me to ask Dev for the handwritten index?|What date and time should I use?|Ask Dev for the handwritten index
please add a reminder to test the old scanner|When should I remind you?|Test the old scanner
Every weekday remind me to back up the recipe photos.|What time on weekdays?|Back up the recipe photos|daily|weekdays
''',mode='time')
    add('train','follow_up','dog-sitting-time-clarifications','''
Remind me to leave the spare leash with Priya.|When should I remind you?|Leave the spare leash with Priya
Could you nudge me to pick up the dog food order?|When would you like that reminder?|Pick up the dog food order
I need to send the sitter the vet's number, remind me.|What date and time should I use?|Send the sitter the vet's number
set a reminder for washing the travel bowl|When should I remind you?|Wash the travel bowl
Make a daily reminder to check the water fountain.|What time each day?|Check the water fountain|daily
''',mode='time')
    add('train','follow_up','independent-bookshop-time-clarifications','''
Remind me to confirm the poetry reading chairs.|When should I remind you?|Confirm the poetry reading chairs
I need to send the bookseller my invoice. Please nudge me.|When would you like the reminder?|Send the bookseller my invoice
remind me to put the window display cards in the drawer|What date and time should I use?|Put the window display cards in the drawer
Can you remind me to collect the signed copies?|When should I remind you?|Collect the signed copies
Each morning remind me to count the event bookmarks.|What time each day?|Count the event bookmarks|daily
''',mode='time')
    add('train','follow_up','mountain-cabin-time-clarifications','''
Remind me to check whether the cabin batteries are charged.|When should I remind you?|Check whether the cabin batteries are charged
Could I get a nudge to pack the paper maps?|When would you like the reminder?|Pack the paper maps
I must tell Luca the gate code changed. Remind me.|What date and time should I use?|Tell Luca the gate code changed
please add something to remind me to drain the outdoor tap|When should I remind you?|Drain the outdoor tap
Put checking the smoke alarm on a monthly reminder.|What time of day?|Check the smoke alarm|monthly
''',mode='time')
    add('train','follow_up','museum-volunteer-time-clarifications','''
Remind me to return the gallery keys.|When should I remind you?|Return the gallery keys
I should email the school group about their arrival; nudge me.|What date and time should I use?|Email the school group about their arrival
Can you remind me to restock the audio-guide lanyards?|When would you like that reminder?|Restock the audio-guide lanyards
Set a reminder for counting the donation envelopes.|When should I remind you?|Count the donation envelopes
Every Friday remind me to print the tour roster.|What time on Fridays?|Print the tour roster|daily
''',mode='time')

    # Bare hours: the work is known, but the clock period is not.
    add('train','follow_up','community-radio-ambiguous-hours','''
Could you remind me at 6 to test the studio mic?|Is that 6am or 6pm?|Test the studio microphone
At 4 tomorrow, nudge me to send the playlist to Noor.|Is that 4am or 4pm?|Send the playlist to Noor
remind me at 11:30 to switch the transmitter over|Is that 11:30am or 11:30pm?|Switch the transmitter over
Please set a reminder for Tuesday at 7 to collect the guest badges.|Is that 7am or 7pm?|Collect the guest badges
I need to label the recordings at 9. Remind me.|Is that 9am or 9pm?|Label the recordings
''',mode='ampm')
    add('train','follow_up','bakery-prep-ambiguous-hours','''
Remind me at 3 to start the rye dough.|Is that 3am or 3pm?|Start the rye dough
Tomorrow at 5, please nudge me to check the proofing basket.|Is that 5am or 5pm?|Check the proofing basket
at 8:15 remind me to turn on the deck oven|Is that 8:15am or 8:15pm?|Turn on the deck oven
Could you remind me to weigh the flour at 10?|Is that 10am or 10pm?|Weigh the flour
Set a reminder for Friday at 2 to collect the butter delivery.|Is that 2am or 2pm?|Collect the butter delivery
''',mode='ampm')
    add('train','follow_up','orchard-harvest-ambiguous-hours','''
Remind me at 6 to check the irrigation pump.|Is that 6am or 6pm?|Check the irrigation pump
Please nudge me tomorrow at 7 to bring the picking crates.|Is that 7am or 7pm?|Bring the picking crates
at 4:20 remind me to call the cider press|Is that 4:20am or 4:20pm?|Call the cider press
Can you remind me at 11 to lock the tool shed?|Is that 11am or 11pm?|Lock the tool shed
I should label the pear boxes at 3. Remind me.|Is that 3am or 3pm?|Label the pear boxes
''',mode='ampm')
    add('train','follow_up','language-class-ambiguous-hours','''
Remind me at 5 to print the Italian dialogue.|Is that 5am or 5pm?|Print the Italian dialogue
At 8 tomorrow, nudge me to upload the speaking exercise.|Is that 8am or 8pm?|Upload the speaking exercise
please remind me at 1:30 to email the tutor|Is that 1:30am or 1:30pm?|Email the tutor
Set a reminder for Thursday at 9 to bring my workbook.|Is that 9am or 9pm?|Bring my workbook
Could you remind me to charge the recorder at 6?|Is that 6am or 6pm?|Charge the recorder
''',mode='ampm')
    add('train','follow_up','furniture-restoration-ambiguous-hours','''
Remind me at 2 to pick up the brass handles.|Is that 2am or 2pm?|Pick up the brass handles
Tomorrow at 10, remind me to sand the drawer fronts.|Is that 10am or 10pm?|Sand the drawer fronts
pls nudge me at 7:45 to mix the shellac|Is that 7:45am or 7:45pm?|Mix the shellac
Could you remind me to photograph the chair joints at 4?|Is that 4am or 4pm?|Photograph the chair joints
At 12, remind me to move the varnish indoors.|Is that 12am or 12pm?|Move the varnish indoors
''',mode='ampm')
    add('train','follow_up','sailing-club-ambiguous-hours','''
Remind me at 5 to inspect the port-side rope.|Is that 5am or 5pm?|Inspect the port-side rope
At 9 tomorrow, nudge me to bring the tide tables.|Is that 9am or 9pm?|Bring the tide tables
set a reminder for Wednesday at 6:10 to check the bilge|Is that 6:10am or 6:10pm?|Check the bilge
Please remind me to collect the club pennant at 3.|Is that 3am or 3pm?|Collect the club pennant
Can you nudge me at 11 to lock the dinghy store?|Is that 11am or 11pm?|Lock the dinghy store
''',mode='ampm')
    add('train','follow_up','home-recording-ambiguous-hours','''
Remind me at 8 to move the microphone stand.|Is that 8am or 8pm?|Move the microphone stand
Tomorrow at 6, remind me to export the rehearsal mix.|Is that 6am or 6pm?|Export the rehearsal mix
at 2:40 pls remind me to label the guitar takes|Is that 2:40am or 2:40pm?|Label the guitar takes
Set a reminder for Monday at 10 to return the borrowed headphones.|Is that 10am or 10pm?|Return the borrowed headphones
Could you remind me to switch off the interface at 12?|Is that 12am or 12pm?|Switch off the audio interface
''',mode='ampm')
    add('train','follow_up','ceramics-firing-ambiguous-hours','''
Remind me at 7 to check the kiln shelf.|Is that 7am or 7pm?|Check the kiln shelf
At 3 tomorrow, nudge me to wedge the porcelain.|Is that 3am or 3pm?|Wedge the porcelain
can you remind me at 9:20 to unload the bisque firing|Is that 9:20am or 9:20pm?|Unload the bisque firing
Please remind me at 1 to weigh the glaze ingredients.|Is that 1am or 1pm?|Weigh the glaze ingredients
Set a reminder for Saturday at 11:45 to photograph the test tiles.|Is that 11:45am or 11:45pm?|Photograph the test tiles
''',mode='ampm')
    add('train','follow_up','bird-survey-ambiguous-hours','''
Remind me at 5 to put the recorder by the marsh.|Is that 5am or 5pm?|Put the recorder by the marsh
At 8 tomorrow, please nudge me to charge the binocular camera.|Is that 8am or 8pm?|Charge the binocular camera
set a reminder at 6:30 to log the rookery count|Is that 6:30am or 6:30pm?|Log the rookery count
Can you remind me to return the hide key at 4?|Is that 4am or 4pm?|Return the hide key
I need to label the dawn recordings at 10. Remind me.|Is that 10am or 10pm?|Label the dawn recordings
''',mode='ampm')
    add('train','follow_up','film-club-ambiguous-hours','''
Remind me at 6 to test the borrowed projector.|Is that 6am or 6pm?|Test the borrowed projector
Tomorrow at 9, remind me to post the screening link.|Is that 9am or 9pm?|Post the screening link
pls remind me at 4:15 to collect the subtitles file|Is that 4:15am or 4:15pm?|Collect the subtitles file
Could you nudge me to put out the programme cards at 3?|Is that 3am or 3pm?|Put out the programme cards
Set a reminder for Thursday at 11 to lock the screening room.|Is that 11am or 11pm?|Lock the screening room
''',mode='ampm')
    add('train','follow_up','canoe-trip-ambiguous-hours','''
Remind me at 7 to check the dry bags.|Is that 7am or 7pm?|Check the dry bags
At 5 tomorrow, nudge me to pick up the river permit.|Is that 5am or 5pm?|Pick up the river permit
please remind me at 10:25 to call the launch site|Is that 10:25am or 10:25pm?|Call the launch site
Set a reminder for Sunday at 2 to rinse the paddles.|Is that 2am or 2pm?|Rinse the paddles
Can you remind me to pack the map case at 8?|Is that 8am or 8pm?|Pack the map case
''',mode='ampm')
    add('train','follow_up','tailoring-room-ambiguous-hours','''
Remind me at 4 to cut the lining pieces.|Is that 4am or 4pm?|Cut the lining pieces
At 7 tomorrow, please nudge me to collect the coat buttons.|Is that 7am or 7pm?|Collect the coat buttons
set a reminder for 2:30 to thread the overlocker|Is that 2:30am or 2:30pm?|Thread the overlocker
Could you remind me to baste the sleeve at 9?|Is that 9am or 9pm?|Baste the sleeve
Please nudge me at 12 to return the pattern book.|Is that 12am or 12pm?|Return the pattern book
''',mode='ampm')

    # Missing reminder subject: timing is known and must survive the clarification.
    add('train','follow_up','gallery-opening-subject-clarifications','''
Could you remind me tomorrow at 10:15am?|What should I remind you about?|tomorrow 10:15
Set a nudge for Friday at 6:20pm, please.|What should the reminder say?|weekday 5 18:20
I need something at 2:40 tomorrow afternoon to remind me.|What should I remind you about?|tomorrow 14:40
put in a reminder for next Sunday at 11am|What should the reminder say?|weekday 7 11:00
Please remind me in 45 minutes.|What should I remind you about?|+ 45
''',mode='subject')
    add('train','follow_up','greenhouse-subject-clarifications','''
Can you remind me tonight at 8:35?|What should the reminder be about?|today 20:35
Add a reminder for Monday at 7:50am.|What should I remind you about?|weekday 1 07:50
Nudge me on the 18th at 4:10pm.|What should the reminder say?|date 18 16:10
I want a reminder in an hour and twenty minutes.|What should I remind you about?|+ 80
Set a daily reminder at 6:05am.|What should the reminder be about each day?|daily 06:05
''',mode='subject')
    add('train','follow_up','tax-paperwork-subject-clarifications','''
Remind me tomorrow at 9:35am.|What should I remind you about?|tomorrow 09:35
Please put a reminder on Thursday at 3:25pm.|What should the reminder say?|weekday 4 15:25
Could I get a nudge at 5:40 tomorrow evening?|What should I remind you about?|tomorrow 17:40
Schedule something for the 7th at 12:15.|What should the reminder be about?|date 7 12:15
Remind me in 25 minutes, thanks.|What should I remind you about?|+ 25
''',mode='subject')
    add('train','follow_up','community-kitchen-subject-clarifications','''
Please remind me at noon tomorrow.|What should the reminder say?|tomorrow 12:00
I need a reminder for Saturday at 8:45am.|What should I be reminded about?|weekday 6 08:45
Set a nudge for the last day of the month at 7:30pm.|What should I remind you about?|monthly -1 19:30
Can you remind me tonight at 10:05?|What should the reminder be about?|today 22:05
Put a reminder in for 35 minutes from now.|What should the reminder say?|+ 35
''',mode='subject')
    add('train','follow_up','rail-commute-subject-clarifications','''
Remind me Wednesday at 6:55am.|What should I remind you about?|weekday 3 06:55
Can you set a reminder for tomorrow at 1:20pm?|What should the reminder say?|tomorrow 13:20
I'd like something on the 22nd at 9:05am.|What should I be reminded about?|date 22 09:05
Nudge me in three hours, please.|What should I remind you about?|+ 180
Set a daily reminder for 8pm.|What should the reminder be about each day?|daily 20:00
''',mode='subject')
    add('train','follow_up','choir-concert-subject-clarifications','''
Could you remind me Saturday at 4:50pm?|What should I remind you about?|weekday 6 16:50
Put a reminder on the 12th at 10:35am.|What should the reminder say?|date 12 10:35
Remind me in 75 minutes.|What should I be reminded about?|+ 75
Set something for tomorrow at 7:15 in the evening.|What should the reminder be about?|tomorrow 19:15
I need a weekday reminder at 5:25pm.|What should I remind you about on weekdays?|daily 17:25 1,2,3,4,5
''',mode='subject')
    add('train','follow_up','coastal-fieldwork-subject-clarifications','''
Please remind me at 9:40 tomorrow morning.|What should the reminder say?|tomorrow 09:40
Can I get a reminder next Friday at 2:05pm?|What should I remind you about?|weekday 5 14:05
Nudge me on the 3rd at 11:50am.|What should the reminder be about?|date 3 11:50
Set a reminder in 50 minutes, if you can.|What should I be reminded about?|+ 50
Please add a daily reminder for 6:45pm.|What should the reminder be about each day?|daily 18:45
''',mode='subject')
    add('train','follow_up','makerspace-subject-clarifications','''
Remind me on Tuesday at 1:35pm.|What should I remind you about?|weekday 2 13:35
Can you nudge me tomorrow at 6:15am?|What should the reminder say?|tomorrow 06:15
Set a reminder for the 26th at 3:45pm.|What should I be reminded about?|date 26 15:45
In two hours, remind me.|What should I remind you about?|+ 120
Add a daily reminder at 9:55pm.|What should the reminder be about each day?|daily 21:55
''',mode='subject')
    add('train','follow_up','orchid-society-subject-clarifications','''
Could you remind me Thursday at 11:10am?|What should the reminder say?|weekday 4 11:10
Set something for tomorrow at 4:35pm.|What should I remind you about?|tomorrow 16:35
Please nudge me on the 9th at 8:25am.|What should the reminder be about?|date 9 08:25
Remind me in 15 minutes.|What should I remind you about?|+ 15
I need a monthly reminder at 5:55pm on the last day.|What should I remind you about?|monthly -1 17:55
''',mode='subject')
    add('train','follow_up','lakeside-hostel-subject-clarifications','''
Remind me tomorrow at 10:50pm.|What should I remind you about?|tomorrow 22:50
Set a reminder for Monday at 12:40pm.|What should the reminder say?|weekday 1 12:40
Could you put a nudge on the 16th at 7:05am?|What should I be reminded about?|date 16 07:05
Please remind me in 40 minutes.|What should I remind you about?|+ 40
Add something daily at 4:30pm.|What should the reminder be about each day?|daily 16:30
''',mode='subject')
    add('train','follow_up','public-library-subject-clarifications','''
Please remind me tomorrow at 3:55pm.|What should I remind you about?|tomorrow 15:55
Set a nudge for Sunday at 9:15am.|What should the reminder say?|weekday 7 09:15
I'd like a reminder on the 21st at 6:35pm.|What should I be reminded about?|date 21 18:35
Can you remind me in 95 minutes?|What should the reminder be about?|+ 95
Put a daily reminder at 7:25am on my list.|What should the reminder be about each day?|daily 07:25
''',mode='subject')
    add('train','follow_up','repair-cafe-subject-clarifications','''
Could you remind me on Friday at 12:50pm?|What should I remind you about?|weekday 5 12:50
Set a reminder for tomorrow at 8:05pm.|What should the reminder say?|tomorrow 20:05
Nudge me on the 5th at 10:45am.|What should I be reminded about?|date 5 10:45
Remind me in 55 minutes, please.|What should I remind you about?|+ 55
I need a monthly reminder on the final day at 2:35pm.|What should the reminder be about?|monthly -1 14:35
''',mode='subject')

    # Multiple plausible reminders: names are deliberately close within each pair.
    add('train','follow_up','multiple-gym-and-saturday-recurrence-contrasts','''
Pause my gym reminder.|Which one: Go to the gym before work or Go to the gym after work?|Go to the gym before work|Go to the gym after work
Move my gym reminder to noon.|Which one: Pay the gym membership or Book a gym induction?|Pay the gym membership|Book a gym induction
Cancel the gym reminder, please.|Which one: Pick up the gym access card or Bring gym shoes to work?|Pick up the gym access card|Bring gym shoes to work
Snooze my gym reminder for 20 minutes.|Which one: Pack the gym bag or Wash the gym clothes?|Pack the gym bag|Wash the gym clothes
Resume the gym alert.|Which one: Do the strength session or Do the cardio session?|Do the strength session|Do the cardio session
''',mode='multiple')
    add('train','follow_up','near-name-family-reminder-selection','''
Pause the reminder for Maya.|Which one: Call Maya Shah or Call Maya Sen?|Call Maya Shah|Call Maya Sen
Change the reminder for Arjun to tomorrow.|Which one: Send Arjun Mehta the photos or Send Arjun Malhotra the photos?|Send Arjun Mehta the photos|Send Arjun Malhotra the photos
Cancel the Anya reminder.|Which one: Pick up Anya's parcel or Pick up Anya's prescription?|Pick up Anya's parcel|Pick up Anya's prescription
Snooze the reminder about calling Rina.|Which one: Call Rina Patel or Call Rina Prasad?|Call Rina Patel|Call Rina Prasad
Resume my note to message Dev.|Which one: Message Dev Rao or Message Dev Rane?|Message Dev Rao|Message Dev Rane
''',mode='multiple')
    add('train','follow_up','near-name-work-reminder-selection','''
Pause the reminder for Jordan.|Which one: Send Jordan Lee the draft or Send Jordan Li the draft?|Send Jordan Lee the draft|Send Jordan Li the draft
Move the Chen reminder to Friday.|Which one: Review Mei Chen's quote or Review Mei Cheng's quote?|Review Mei Chen's quote|Review Mei Cheng's quote
Snooze my call with Alex.|Which one: Call Alex Morgan or Call Alex Morrison?|Call Alex Morgan|Call Alex Morrison
Cancel the reminder about Priya's report.|Which one: Review Priya Nair's report or Review Priya Nayar's report?|Review Priya Nair's report|Review Priya Nayar's report
Resume the note to contact Sam.|Which one: Email Sam Ortiz or Email Sam Ortez?|Email Sam Ortiz|Email Sam Ortez
''',mode='multiple')
    add('train','follow_up','similar-admin-reminder-selection','''
Please pause my renewal reminder.|Which one: Renew the library card or Renew the museum pass?|Renew the library card|Renew the museum pass
Cancel the payment reminder.|Which one: Pay the water bill or Pay the electricity bill?|Pay the water bill|Pay the electricity bill
Snooze the application reminder.|Which one: Submit the visa application or Submit the grant application?|Submit the visa application|Submit the grant application
Move the appointment reminder to 10am.|Which one: Book the eye exam or Book the dental exam?|Book the eye exam|Book the dental exam
Resume the form reminder.|Which one: Complete the school form or Complete the travel form?|Complete the school form|Complete the travel form
''',mode='multiple')
    add('train','follow_up','equipment-reminder-selection','''
Pause the charger reminder.|Which one: Charge the camera battery or Charge the radio battery?|Charge the camera battery|Charge the radio battery
Cancel the filter reminder.|Which one: Clean the water filter or Clean the air filter?|Clean the water filter|Clean the air filter
Snooze the laptop reminder for half an hour.|Which one: Back up the work laptop or Back up the home laptop?|Back up the work laptop|Back up the home laptop
Change my printer reminder to Tuesday.|Which one: Order printer paper or Replace the printer toner?|Order printer paper|Replace the printer toner
Resume the router reminder.|Which one: Restart the studio router or Restart the house router?|Restart the studio router|Restart the house router
''',mode='multiple')
    add('train','follow_up','similar-pet-reminder-selection','''
Pause the cat reminder.|Which one: Give Olive her tablet or Give Olive her eye drops?|Give Olive her tablet|Give Olive her eye drops
Move the parrot reminder to 8am.|Which one: Refill Kiko's water or Refill Kiko's seed bowl?|Refill Kiko's water|Refill Kiko's seed bowl
Snooze the dog walk reminder.|Which one: Walk Bruno before breakfast or Walk Bruno after dinner?|Walk Bruno before breakfast|Walk Bruno after dinner
Cancel the vet reminder.|Which one: Call Greenway Vet or Call Greenfield Vet?|Call Greenway Vet|Call Greenfield Vet
Resume my rabbit reminder.|Which one: Clean Pippin's hutch or Refill Pippin's hay rack?|Clean Pippin's hutch|Refill Pippin's hay rack
''',mode='multiple')
    add('train','follow_up','similar-travel-reminder-selection','''
Pause my booking reminder.|Which one: Confirm the rail booking or Confirm the hotel booking?|Confirm the rail booking|Confirm the hotel booking
Move the passport reminder to tomorrow.|Which one: Renew my passport or Photocopy my passport?|Renew my passport|Photocopy my passport
Snooze the airport reminder.|Which one: Book the airport cab or Check the airport shuttle?|Book the airport cab|Check the airport shuttle
Cancel the packing nudge.|Which one: Pack the green suitcase or Pack the grey suitcase?|Pack the green suitcase|Pack the grey suitcase
Resume the map reminder.|Which one: Download the city map or Print the trail map?|Download the city map|Print the trail map
''',mode='multiple')
    add('train','follow_up','similar-class-reminder-selection','''
Pause my homework reminder.|Which one: Finish the algebra sheet or Finish the geometry sheet?|Finish the algebra sheet|Finish the geometry sheet
Move the class fee reminder to the 3rd.|Which one: Pay the pottery class fee or Pay the language class fee?|Pay the pottery class fee|Pay the language class fee
Snooze the reading reminder.|Which one: Read the history chapter or Read the biology chapter?|Read the history chapter|Read the biology chapter
Cancel the tutor reminder.|Which one: Email tutor Carla or Email tutor Karla?|Email tutor Carla|Email tutor Karla
Resume the course reminder.|Which one: Submit the coding exercise or Submit the design exercise?|Submit the coding exercise|Submit the design exercise
''',mode='multiple')
    add('train','follow_up','similar-event-reminder-selection','''
Pause the ticket reminder.|Which one: Buy tickets for the matinee or Buy tickets for the evening show?|Buy tickets for the matinee|Buy tickets for the evening show
Move the volunteer reminder to Saturday.|Which one: Pack the food-bank boxes or Pack the coat-drive boxes?|Pack the food-bank boxes|Pack the coat-drive boxes
Snooze the meeting reminder for 15 minutes.|Which one: Prepare the board meeting or Prepare the book-club meeting?|Prepare the board meeting|Prepare the book-club meeting
Cancel the roster reminder.|Which one: Send the choir roster or Send the theatre roster?|Send the choir roster|Send the theatre roster
Resume the fundraiser reminder.|Which one: Print the raffle tickets or Print the donation cards?|Print the raffle tickets|Print the donation cards
''',mode='multiple')
    add('train','follow_up','similar-household-reminder-selection','''
Pause the laundry reminder.|Which one: Wash the blue sheets or Wash the guest towels?|Wash the blue sheets|Wash the guest towels
Move my bin reminder to Thursday.|Which one: Put out the recycling bin or Put out the garden bin?|Put out the recycling bin|Put out the garden bin
Snooze the cupboard reminder.|Which one: Wipe the pantry shelves or Wipe the linen cupboard?|Wipe the pantry shelves|Wipe the linen cupboard
Cancel the key reminder.|Which one: Leave the side-door key or Leave the garage key?|Leave the side-door key|Leave the garage key
Resume the shopping note.|Which one: Buy oat milk or Buy almond milk?|Buy oat milk|Buy almond milk
''',mode='multiple')
    add('train','follow_up','similar-health-reminder-selection','''
Pause my tablet reminder.|Which one: Take the blue tablet or Take the white tablet?|Take the blue tablet|Take the white tablet
Move the appointment note to Friday.|Which one: Call the physio clinic or Call the podiatry clinic?|Call the physio clinic|Call the podiatry clinic
Snooze the exercise reminder.|Which one: Do the shoulder stretches or Do the back stretches?|Do the shoulder stretches|Do the back stretches
Cancel the refill reminder.|Which one: Refill the inhaler or Refill the saline spray?|Refill the inhaler|Refill the saline spray
Resume my water nudge.|Which one: Drink water after lunch or Drink water after the walk?|Drink water after lunch|Drink water after the walk
''',mode='multiple')
    add('train','follow_up','similar-library-reminder-selection','''
Pause the return reminder.|Which one: Return the travel memoir or Return the cooking memoir?|Return the travel memoir|Return the cooking memoir
Move the pickup reminder to tomorrow.|Which one: Collect the history holds or Collect the mystery holds?|Collect the history holds|Collect the mystery holds
Snooze the reading group reminder.|Which one: Bring snacks to the poetry circle or Bring snacks to the mystery circle?|Bring snacks to the poetry circle|Bring snacks to the mystery circle
Cancel the renewal note.|Which one: Renew my city library card or Renew my university library card?|Renew my city library card|Renew my university library card
Resume the book reminder.|Which one: Read The Glass Orchard or Read The Glass Harbor?|Read The Glass Orchard|Read The Glass Harbor
''',mode='multiple')

    # No existing item fits the request. Background schedules are unrelated.
    add('train','follow_up','missing-vet-follow-up-reminders','''
Cancel my reminder to ask Dr Batra about the new vaccine.|I can't find a matching reminder. Which one should I look for?
Pause the reminder for collecting Milo's test results.|Which reminder did you mean? I don't see one for Milo's results.
Snooze the nudge to call Northside Animal Hospital for 20 minutes.|I can't find a matching reminder. Which one should I snooze?
Move the reminder about booking Tessa's dental check to Friday at 2pm.|Which reminder should I change? I don't see that booking reminder.
Resume the reminder to order the special cat food.|Which existing reminder did you mean? I can't find one for that.
''',mode='none')
    add('train','follow_up','missing-property-reminders','''
Pause my reminder to ask the landlord about the loose balcony rail.|Which reminder should I pause? I don't see one about the balcony rail.
Cancel the nudge to photograph the meter before the inspection.|I can't find a matching reminder. Which one did you mean?
Snooze the reminder to leave the spare key with the plumber.|Which reminder should I snooze? I don't see one for the spare key.
Move my reminder about the bedroom window seal to tomorrow at 11am.|Which reminder should I change? I can't find that one.
Resume the note to request another parking sticker.|I don't see a matching reminder. Which one are you referring to?
''',mode='none')
    add('train','follow_up','missing-bakery-order-reminders','''
Cancel my reminder to confirm the rye flour delivery.|I can't find a matching reminder. Which one should I look for?
Pause the nudge to ask Saira about the pastry boxes.|Which reminder did you mean? I don't see one for Saira.
Snooze the reminder to collect the new piping tips for 15 minutes.|Which reminder should I snooze? I can't find that one.
Move the reminder for ordering apricot jam to Thursday at 3pm.|I can't find a matching reminder. Which reminder should I change?
Resume the note about checking the sourdough starter temperature.|Which existing reminder did you mean? That one isn't on the list.
''',mode='none')
    add('train','follow_up','missing-studio-admin-reminders','''
Pause my reminder to submit the gallery insurance form.|Which reminder should I pause? I don't see the insurance form reminder.
Cancel the nudge for calling the picture framer about the glass.|I can't find a matching reminder. Which one did you mean?
Snooze the reminder to pick up the bronze labels for 30 minutes.|Which reminder should I snooze? I don't see one for those labels.
Move the reminder about sending the curator's invoice to Friday at 10am.|Which reminder should I change? I can't find that invoice reminder.
Resume my note to photograph the sculpture plinth.|Which existing reminder did you mean? I don't see one for the plinth.
''',mode='none')
    add('train','follow_up','missing-boat-maintenance-reminders','''
Cancel the reminder to order a replacement bilge hose.|I can't find a matching reminder. Which one should I cancel?
Pause the nudge to ask Captain Ellis about the mooring fee.|Which reminder did you mean? I don't see one for that call.
Snooze the reminder to rinse the life jackets for 10 minutes.|Which reminder should I snooze? That one isn't listed.
Move the reminder about booking the engine service to Tuesday at 4pm.|I can't find a matching reminder. Which reminder should I change?
Resume the note to bring the navigation lights ashore.|Which existing reminder do you mean? I don't see one about the lights.
''',mode='none')
    add('train','follow_up','missing-choir-admin-reminders','''
Pause my reminder to send the accompanist the revised score.|I can't find a matching reminder. Which one should I pause?
Cancel the nudge about collecting the tenor folders from Hana.|Which reminder did you mean? I don't see that folder pickup.
Snooze the reminder to book a piano tuner for 25 minutes.|Which reminder should I snooze? I can't find one for the tuner.
Move the reminder about printing the spring concert programme to Monday at noon.|Which reminder should I change? That programme isn't listed.
Resume my reminder to ask the hall manager for extra chairs.|I don't see a matching reminder. Which one are you referring to?
''',mode='none')
    add('train','follow_up','missing-cycling-club-reminders','''
Cancel the nudge to renew my trail permit.|I can't find a matching reminder. Which one should I cancel?
Pause my reminder to collect the spoke wrench from Ishan.|Which reminder did you mean? I don't see one for the wrench.
Snooze the reminder to check the rear light mount for 20 minutes.|Which reminder should I snooze? I can't find that one.
Move the note about paying the race entry fee to Saturday at 9am.|I don't see a matching reminder. Which one do you mean?
Resume the reminder to return the club's route-sign stakes.|Which existing reminder should I resume? That one isn't listed.
''',mode='none')
    add('train','follow_up','missing-workshop-reminders','''
Pause my reminder to order the replacement soldering tip.|I can't find a matching reminder. Which one should I pause?
Cancel the nudge to ask Laila for the laser-cutter booking.|Which reminder did you mean? I don't see a booking reminder.
Snooze the reminder to label the repaired multimeter for 15 minutes.|Which reminder should I snooze? That item isn't on the list.
Move the reminder about returning the borrowed calipers to tomorrow at 5pm.|I can't find a matching reminder. Which one should I change?
Resume my note to clean the dust extractor hose.|Which existing reminder did you mean? I don't see one for that.
''',mode='none')
    add('train','follow_up','missing-volunteer-shift-reminders','''
Cancel the reminder to ask Omar for the shelter van keys.|I can't find a matching reminder. Which one should I look for?
Pause my nudge to bring the new sign-in sheets to the shelter.|Which reminder did you mean? I don't see one about the sheets.
Snooze the reminder to call the meal coordinator for 40 minutes.|Which reminder should I snooze? I can't find that call.
Move the reminder about packing the winter blanket boxes to Thursday at 1pm.|I don't see a matching reminder. Which one should I change?
Resume the note about checking the donation scale.|Which existing reminder are you referring to? That one isn't listed.
''',mode='none')
    add('train','follow_up','missing-woodland-trail-reminders','''
Pause my reminder to ask the ranger about the fallen footbridge.|I can't find a matching reminder. Which one should I pause?
Cancel the nudge to bring fresh batteries for the trail camera.|Which reminder did you mean? I don't see that trail-camera reminder.
Snooze the reminder to check the western gate latch for 10 minutes.|Which reminder should I snooze? That one isn't on the list.
Move the note about replacing the path marker to Friday at 4pm.|I don't see a matching reminder. Which one should I change?
Resume the reminder to return the park's pruning saw.|Which existing reminder did you mean? I can't find one for the saw.
''',mode='none')
    add('train','follow_up','missing-bookbindery-reminders','''
Cancel my reminder to order linen thread from the bindery supplier.|I can't find a matching reminder. Which one should I cancel?
Pause the nudge to ask Mr Iqbal about the damaged press plate.|Which reminder did you mean? I don't see one for that conversation.
Snooze the note to collect the repaired bone folder for 20 minutes.|Which reminder should I snooze? I can't find that one.
Move the reminder about posting the restored atlas to Monday at 10am.|I don't see a matching reminder. Which one should I change?
Resume my reminder to photograph the marbled paper samples.|Which existing reminder are you referring to? That reminder isn't listed.
''',mode='none')
    add('train','follow_up','missing-neighborhood-garage-reminders','''
Pause my reminder to ask the mechanic about the dashboard rattle.|I can't find a matching reminder. Which one should I pause?
Cancel the nudge to bring the spare wheel lock to the garage.|Which reminder did you mean? I don't see one for that wheel lock.
Snooze the reminder to collect the repaired bicycle rack for 30 minutes.|Which reminder should I snooze? That item isn't listed.
Move the note about booking a headlight alignment to Wednesday at 2pm.|I can't find a matching reminder. Which one should I change?
Resume the reminder to ask about the rustproofing quote.|Which existing reminder did you mean? I don't see one for the quote.
''',mode='none')

    # Unresolved references: no recent turn identifies the object or activity.
    add('train','follow_up','unclear-gallery-demonstratives','''
Remind me about that tomorrow at 6:20pm.|What does “that” refer to?|tomorrow 18:20
Could you nudge me to finish it on Thursday at 10am?|What should I remind you to finish?|weekday 4 10:00
This needs doing tonight at 8:45, remind me.|What should I remind you about?|today 20:45
Please put a reminder for that on the 14th at noon.|What is the reminder for?|date 14 12:00
I need to take care of it in 35 minutes.|What should I remind you to take care of?|+ 35
''',mode='reference')
    add('train','follow_up','unclear-household-demonstratives','''
Can you remind me about this tomorrow at 7:10am?|What does “this” refer to?|tomorrow 07:10
Remind me to sort it out Friday at 3:30pm.|What should I remind you to sort out?|weekday 5 15:30
That has to happen on the 8th at 9:25am.|What should the reminder be about?|date 8 09:25
Could you set a nudge for this in 50 minutes?|What should I remind you about?|+ 50
I need to deal with that tonight at 10:15.|What does “that” refer to?|today 22:15
''',mode='reference')
    add('train','follow_up','unclear-fieldwork-demonstratives','''
Remind me about it Wednesday at 5:40pm.|What does “it” refer to?|weekday 3 17:40
Please nudge me to do this tomorrow at 11:35am.|What should I remind you to do?|tomorrow 11:35
That should be handled on the 19th at 2:50pm.|What should the reminder be for?|date 19 14:50
Can you put a reminder in for this in 70 minutes?|What should I remind you about?|+ 70
I can't forget it, remind me tonight at 7:25.|What should I remind you about?|today 19:25
''',mode='reference')
    add('train','follow_up','unclear-volunteer-demonstratives','''
Remind me to bring that on Saturday at 8:20am.|What should you bring?|weekday 6 08:20
Can you remind me to call them tomorrow at 4:55pm?|Who should I remind you to call?|tomorrow 16:55
I need to follow up on this in 25 minutes.|What should I follow up on?|+ 25
Please put a reminder in for it on the 2nd at 6:15pm.|What is the reminder for?|date 2 18:15
Nudge me to check that Friday at noon.|What should I remind you to check?|weekday 5 12:00
''',mode='reference')
    add('train','follow_up','unclear-maker-project-demonstratives','''
Remind me to fix this tomorrow at 2:35pm.|What should I remind you to fix?|tomorrow 14:35
Could you nudge me to send that in 40 minutes?|What should I remind you to send?|+ 40
I need to finish it Tuesday at 9:50am.|What should I remind you to finish?|weekday 2 09:50
Put a reminder for this on the 27th at 3:05pm.|What should the reminder be about?|date 27 15:05
Please remind me to return that at 6:30 tomorrow evening.|What should I remind you to return?|tomorrow 18:30
''',mode='reference')
    add('train','follow_up','unclear-family-errand-demonstratives','''
Remind me about that in 15 minutes, please.|What does “that” refer to?|+ 15
I should pick it up tomorrow at 5:15pm. Remind me.|What should I remind you to pick up?|tomorrow 17:15
Could you nudge me to call her Monday at 10:40am?|Who should I remind you to call?|weekday 1 10:40
Set a reminder for this on the 11th at 1:45pm.|What should the reminder be for?|date 11 13:45
That needs to go back on Thursday at 4:25pm.|What should I remind you to return?|weekday 4 16:25
''',mode='reference')
    add('train','follow_up','unclear-library-demonstratives','''
Remind me to renew it on the 6th at 9:35am.|What should I remind you to renew?|date 6 09:35
Please nudge me to return that tomorrow at 11:55am.|What should I remind you to return?|tomorrow 11:55
I have to ask about this Friday at 2:15pm.|What should I remind you to ask about?|weekday 5 14:15
Could you remind me about it in 85 minutes?|What does “it” refer to?|+ 85
Put a reminder for that on Sunday at 6:45pm.|What is the reminder for?|weekday 7 18:45
''',mode='reference')
    add('train','follow_up','unclear-studio-demonstratives','''
Remind me to pack this tonight at 9:40.|What should I remind you to pack?|today 21:40
Can you nudge me to check it tomorrow at 7:55am?|What should I remind you to check?|tomorrow 07:55
I need to take that back on Wednesday at 3:35pm.|What should I remind you to take back?|weekday 3 15:35
Set a reminder for this in 60 minutes.|What should the reminder be about?|+ 60
Please remind me to ask him about it on the 23rd at 10:10am.|What should I remind you to ask him about?|date 23 10:10
''',mode='reference')
    add('train','follow_up','unclear-travel-demonstratives','''
Remind me to book that tomorrow at 12:25pm.|What should I remind you to book?|tomorrow 12:25
Could you nudge me to print it on Friday at 8:40am?|What should I remind you to print?|weekday 5 08:40
I need to collect this in 30 minutes.|What should I remind you to collect?|+ 30
Put a reminder for that on the 17th at 5:20pm.|What should the reminder be for?|date 17 17:20
Remind me to check it on Tuesday at 7:05pm.|What should I remind you to check?|weekday 2 19:05
''',mode='reference')
    add('train','follow_up','unclear-contractor-demonstratives','''
Remind me to show them this tomorrow at 9:15am.|Who should I remind you to show it to?|tomorrow 09:15
Can you nudge me to fix that tonight at 8:05?|What should I remind you to fix?|today 20:05
I should send it on the 25th at 4:50pm. Remind me.|What should I remind you to send?|date 25 16:50
Please set a reminder to look at this in 20 minutes.|What should I remind you to look at?|+ 20
That needs an answer next Thursday at 1:30pm.|What should I remind you to answer?|weekday 4 13:30
''',mode='reference')
    add('train','follow_up','unclear-cooking-demonstratives','''
Remind me to put that away in 10 minutes.|What should I remind you to put away?|+ 10
Please nudge me to thaw it tomorrow at 6:05pm.|What should I remind you to thaw?|tomorrow 18:05
I need to bring this on Saturday at 11:25am.|What should I remind you to bring?|weekday 6 11:25
Set a reminder to taste that on the 4th at 7:35pm.|What should I remind you to taste?|date 4 19:35
Could you remind me to turn it off tonight at 10:40?|What should I remind you to turn off?|today 22:40
''',mode='reference')
    add('train','follow_up','unclear-repair-demonstratives','''
Remind me to measure that tomorrow at 8:30am.|What should I remind you to measure?|tomorrow 08:30
Can you remind me to call about this on Monday at 4:45pm?|What should I remind you to call about?|weekday 1 16:45
I need to replace it in 100 minutes.|What should I remind you to replace?|+ 100
Please nudge me to photograph that on the 13th at 3:15pm.|What should I remind you to photograph?|date 13 15:15
Set a reminder to ask them about it Sunday at 12:10pm.|Who should I remind you to ask, and about what?|weekday 7 12:10
''',mode='reference')
    add('train','new_reminder_once','weekend-market-one-offs','''
Remind me this Saturday at 8:40am to bring the canvas bags.|Bring the canvas bags|weekday 6 08:40
Could you nudge me Sunday at 4:25pm to collect the olive order?|Collect the olive order|weekday 7 16:25
At 10:15am tomorrow, remind me to ask the cheesemonger about the mild goat cheese.|Ask the cheesemonger about mild goat cheese|tomorrow 10:15
Please remind me in 27 minutes to move the bread out of the sun.|Move the bread out of the sun|+ 27
on the 29th at 9:10am remind me to renew the market stall pass|Renew the market stall pass|date 29 09:10
I need a reminder Friday at 6:35pm to return the borrowed cool box.|Return the borrowed cool box|weekday 5 18:35
Nudge me tonight at 8:05 to put the reusable ice packs back.|Put away the reusable ice packs|today 20:05
remind me in 2 hours to send the vendor the table dimensions|Send the vendor the table dimensions|+ 120
''')
    add('train','new_reminder_once','shared-studio-cleanup-one-offs','''
Remind me at 7:20 tonight to put the screen-printing ink away.|Put away the screen-printing ink|today 19:20
Could you remind me Tuesday at 9:35am to sweep under the etching press?|Sweep under the etching press|weekday 2 09:35
I need to label the drying racks in 18 minutes, pls nudge me.|Label the drying racks|+ 18
On the 31st at 3:50pm remind me to return Asha's brayer.|Return Asha's brayer|date 31 15:50
Remind me Friday at 12:20pm to refill the washout booth.|Refill the washout booth|weekday 5 12:20
Tomorrow at 6:45am, nudge me to unlock the back entrance.|Unlock the back entrance|tomorrow 06:45
Please remind me in 110 minutes to email everyone the cleanup photo.|Email everyone the cleanup photo|+ 110
Sunday at 2:15pm would be a good time to stack the spare stools; give me a nudge.|Stack the spare stools|weekday 7 14:15
''')
    add('train','new_reminder_once','library-archive-one-offs','''
Remind me tomorrow at 1:05pm to return the archival gloves.|Return the archival gloves|tomorrow 13:05
Could I get a nudge Thursday at 8:55am to scan the map ledger?|Scan the map ledger|weekday 4 08:55
in 22 minutes remind me to ask Farah for the accession number|Ask Farah for the accession number|+ 22
Please remind me on the 30th at 5:45pm to bring the conservation box.|Bring the conservation box|date 30 17:45
Saturday at 11:30am, remind me to sign the reading-room register.|Sign the reading-room register|weekday 6 11:30
I need to send the archivist my notes in 75 minutes.|Send the archivist my notes|+ 75
Tonight at 7:55 nudge me to put the microfilm reel in its sleeve.|Put the microfilm reel in its sleeve|today 19:55
Remind me next Monday at 3:25pm to return the brass key.|Return the brass key|weekday 1 15:25
''')
    add('train','new_reminder_once','bicycle-service-one-offs','''
Remind me Friday at 10:40am to bring the rear wheel to the mechanic.|Bring the rear wheel to the mechanic|weekday 5 10:40
At 6:30 tomorrow evening, nudge me to collect the spoke nipples.|Collect the spoke nipples|tomorrow 18:30
please remind me in 16 minutes to photograph the cracked mudguard|Photograph the cracked mudguard|+ 16
On the 15th at 9:20am remind me to ask about the new brake cable.|Ask about the new brake cable|date 15 09:20
Can you set a reminder for Sunday at 2:55pm to return the loaner helmet?|Return the loaner helmet|weekday 7 14:55
I need to take the bike lock to the shop in 95 minutes.|Take the bike lock to the shop|+ 95
On the 29th at 7:05am remind me to check the bus rack height.|Check the bus rack height|date 29 07:05
Nudge me Wednesday at 5:35pm to pick up the wheel truing stand.|Pick up the wheel truing stand|weekday 3 17:35
''')
    add('train','new_reminder_once','museum-audio-tour-one-offs','''
Remind me tomorrow at 9:50am to test the headset at gallery three.|Test the headset at gallery three|tomorrow 09:50
Please nudge me Saturday at 1:35pm to bring the visitor maps upstairs.|Bring the visitor maps upstairs|weekday 6 13:35
in 38 min remind me to ask Nikhil about the quiet-room sign|Ask Nikhil about the quiet-room sign|+ 38
On the 28th at 4:45pm, remind me to charge the tour tablets.|Charge the tour tablets|date 28 16:45
Could you remind me Friday at 8:10am to print the large-type labels?|Print the large-type labels|weekday 5 08:10
Tonight at 6:55 remind me to lock the west gallery cabinet.|Lock the west gallery cabinet|today 18:55
Remind me in 2 hours 15 minutes to send the attendance count.|Send the attendance count|+ 135
Sunday at noon, nudge me to return the borrowed audio receiver.|Return the borrowed audio receiver|weekday 7 12:00
''')
    add('train','new_reminder_once','sewing-repair-one-offs','''
Remind me tomorrow at 7:35am to pack the denim patches.|Pack the denim patches|tomorrow 07:35
Can you nudge me Tuesday at 5:05pm to collect the repaired zipper?|Collect the repaired zipper|weekday 2 17:05
please remind me in 29 mins to cut a fresh bias strip|Cut a fresh bias strip|+ 29
On the 2nd at 10:55am remind me to return the tailor's chalk.|Return the tailor's chalk|date 2 10:55
I need to pin the sleeve before class Friday at 11:20am.|Pin the sleeve before class|weekday 5 11:20
Tonight at 8:50 remind me to set out the blue thread.|Set out the blue thread|today 20:50
Nudge me in 55 minutes to message Ritu about the hem.|Message Ritu about the hem|+ 55
Remind me Sunday at 4:30pm to drop off the coat lining.|Drop off the coat lining|weekday 7 16:30
''')
    add('train','new_reminder_once','coastal-ferry-one-offs','''
Remind me tomorrow at 5:55am to check the ferry terminal notice.|Check the ferry terminal notice|tomorrow 05:55
Could you remind me Friday at 3:40pm to buy a paper ticket for Nana?|Buy a paper ticket for Nana|weekday 5 15:40
in 33 mins remind me to ask the harbour office about bicycle storage|Ask the harbour office about bicycle storage|+ 33
On the 24th at 8:35am remind me to collect the printed tide sheet.|Collect the printed tide sheet|date 24 08:35
Please nudge me Sunday at 7:50pm to pack the motion-sickness bands.|Pack the motion-sickness bands|weekday 7 19:50
I should send the guesthouse our arrival time in 70 minutes.|Send the guesthouse our arrival time|+ 70
Please ping me Thursday at 1:25pm so I remember to return the terminal locker token.|Return the terminal locker token|weekday 4 13:25
Tonight at 9:15 remind me to download the offline route.|Download the offline route|today 21:15
''')
    add('train','new_reminder_once','community-fridge-one-offs','''
Remind me at 6:40pm to label the oat milk donation.|Label the oat milk donation|today 18:40
Tomorrow at 8:05am, nudge me to pick up the temperature log.|Pick up the temperature log|tomorrow 08:05
please remind me in 47 minutes to send the volunteer rota|Send the volunteer rota|+ 47
On the 19th at 12:35pm remind me to check the fridge seal.|Check the fridge seal|date 19 12:35
Can you remind me Saturday at 3:15pm to bring the clean crates?|Bring the clean crates|weekday 6 15:15
I need to call the delivery driver in 105 minutes.|Call the delivery driver|+ 105
Tonight at 7:40 remind me to put the allergen cards by the shelves.|Put the allergen cards by the shelves|today 19:40
Nudge me next Wednesday at 10:25am to return the padlock.|Return the padlock|weekday 3 10:25
''')
    add('train','new_reminder_once','watercolour-class-one-offs','''
Remind me tomorrow at 7:25am to fill the travel palette.|Fill the travel palette|tomorrow 07:25
Can you remind me Thursday at 5:50pm to pick up the cold-press paper?|Pick up the cold-press paper|weekday 4 17:50
pls remind me in 26 mins to rinse the masking fluid brush|Rinse the masking fluid brush|+ 26
On the 6th at 3:35pm remind me to photograph the paint swatches.|Photograph the paint swatches|date 6 15:35
Set a nudge for Monday at 9:25am to bring the water jar.|Bring the water jar|weekday 1 09:25
Tonight at 10:30 remind me to put the wet studies flat.|Put the wet studies flat|today 22:30
In 65 minutes, remind me to order another mop brush.|Order another mop brush|+ 65
Sunday at 1:10pm nudge me to return the borrowed board.|Return the borrowed board|weekday 7 13:10
''')
    add('train','new_reminder_once','farmers-market-cooking-demo-one-offs','''
Remind me tomorrow at 9:15am to pack the cast-iron pan.|Pack the cast-iron pan|tomorrow 09:15
Please nudge me Saturday at 5:25pm to buy fresh coriander.|Buy fresh coriander|weekday 6 17:25
in 44 minutes remind me to print the allergen sheet|Print the allergen sheet|+ 44
On the 20th at 10:50am remind me to ask Iqra for the spice list.|Ask Iqra for the spice list|date 20 10:50
Can you remind me Friday at noon to bring the recipe cards?|Bring the recipe cards|weekday 5 12:00
Tonight at 7:15 remind me to soak the dried chickpeas.|Soak the dried chickpeas|today 19:15
I need to return the borrowed ladle in 115 minutes.|Return the borrowed ladle|+ 115
Sunday at 3:45pm nudge me to wipe down the demo table.|Wipe down the demo table|weekday 7 15:45
''')
    add('train','new_reminder_once','railway-model-club-one-offs','''
Remind me tomorrow at 8:50am to bring the signal diagrams.|Bring the signal diagrams|tomorrow 08:50
Could you remind me Wednesday at 6:15pm to pick up the ballast order?|Pick up the ballast order|weekday 3 18:15
pls nudge me in 19 mins to switch off the soldering iron|Switch off the soldering iron|+ 19
On the 1st at 4:30pm remind me to return the station lamps.|Return the station lamps|date 1 16:30
Before heading out Saturday, at 10:20am remind me to bring the spare couplers.|Bring the spare couplers|weekday 6 10:20
Tonight at 9:35 remind me to save the layout measurements.|Save the layout measurements|today 21:35
In 145 minutes remind me to email the club treasurer.|Email the club treasurer|+ 145
Please nudge me Thursday at 1:05pm to collect the printed timetable.|Collect the printed timetable|weekday 4 13:05
''')
    add('train','new_reminder_once','ceramic-tile-install-one-offs','''
Remind me tomorrow at 11:05am to check the grout colour.|Check the grout colour|tomorrow 11:05
At 3:30pm Saturday, nudge me to bring the tile spacers.|Bring the tile spacers|weekday 6 15:30
please remind me in 52 minutes to call the tile cutter|Call the tile cutter|+ 52
On the 23rd at 8:15am remind me to pick up the edging strips.|Pick up the edging strips|date 23 08:15
Can you remind me Thursday at 4:20pm to photograph the shower niche?|Photograph the shower niche|weekday 4 16:20
Tonight at 7:05 remind me to cover the open mortar tub.|Cover the open mortar tub|today 19:05
Nudge me in 125 minutes to order a spare diamond blade.|Order a spare diamond blade|+ 125
Sunday at 10:30am remind me to return the borrowed level.|Return the borrowed level|weekday 7 10:30
''')
    add('train','new_reminder_once','community-garden-harvest-one-offs','''
Remind me tomorrow at 6:20am to take the harvest basket.|Take the harvest basket|tomorrow 06:20
Please nudge me Wednesday at 5:45pm to weigh the runner beans.|Weigh the runner beans|weekday 3 17:45
in 23 minutes remind me to leave the gate key at the shed|Leave the gate key at the shed|+ 23
On the 25th at 2:10pm remind me to ask Salma about the compost delivery.|Ask Salma about the compost delivery|date 25 14:10
Can you remind me Saturday at 9:55am to bring the seedling trays?|Bring the seedling trays|weekday 6 09:55
Tonight at 8:35 remind me to water the newly planted row.|Water the newly planted row|today 20:35
I need to return the garden scale in 90 minutes.|Return the garden scale|+ 90
Sunday at 4:40pm nudge me to label the squash crates.|Label the squash crates|weekday 7 16:40
''')
    add('train','new_reminder_once','independent-photography-one-offs','''
Remind me tomorrow at 5:25am to pack the 50mm lens.|Pack the 50mm lens|tomorrow 05:25
Could you remind me Friday at 7:35pm to back up the concert shots?|Back up the concert shots|weekday 5 19:35
in 41 minutes remind me to wipe the sensor swabs off the desk|Put away the sensor swabs|+ 41
On the 21st at 1:15pm remind me to return the borrowed tripod plate.|Return the borrowed tripod plate|date 21 13:15
Please nudge me Sunday at 10:45am to meet the print technician.|Meet the print technician|weekday 7 10:45
Tonight at 6:50 remind me to charge the small flash.|Charge the small flash|today 18:50
I should send the model-release form in 68 minutes.|Send the model-release form|+ 68
Tuesday at 3:05pm remind me to pick up the contact sheets.|Pick up the contact sheets|weekday 2 15:05
''')
    add('train','new_reminder_once','hilltop-hostel-one-offs','''
Remind me tomorrow at 4:45am to fill the thermos.|Fill the thermos|tomorrow 04:45
Please nudge me Saturday at 8:15pm to bring the spare headlamp.|Bring the spare headlamp|weekday 6 20:15
set a reminder in 17 minutes to check the boot laces|Check the boot laces|+ 17
On the 27th at 6:25pm remind me to confirm the late check-in.|Confirm the late check-in|date 27 18:25
Can you remind me Monday at 7:30am to leave the key in the lockbox?|Leave the key in the lockbox|weekday 1 07:30
Tonight at 10:55 remind me to download the elevation map.|Download the elevation map|today 22:55
Nudge me in 140 minutes to message the trail guide.|Message the trail guide|+ 140
Friday at noon remind me to return the hostel mug.|Return the hostel mug|weekday 5 12:00
''')
    add('train','new_reminder_once','heritage-house-tour-one-offs','''
Remind me tomorrow at 9:05am to bring the visitor-count clicker.|Bring the visitor-count clicker|tomorrow 09:05
Could you nudge me Sunday at 3:55pm to put the rope barrier back?|Put the rope barrier back|weekday 7 15:55
in 28 minutes remind me to ask the caretaker for the west-room key|Ask the caretaker for the west-room key|+ 28
On the 8th at 2:25pm remind me to polish the brass nameplate.|Polish the brass nameplate|date 8 14:25
Please remind me Thursday at 10:50am to print the large text guide.|Print the large text guide|weekday 4 10:50
Tonight at 7:30 nudge me to lock the garden door.|Lock the garden door|today 19:30
I need to email the accessibility volunteer in 48 minutes.|Email the accessibility volunteer|+ 48
Saturday at 1:45pm remind me to return the oral-history recorder.|Return the oral-history recorder|weekday 6 13:45
''')
    add('train','new_reminder_once','community-theatre-costume-one-offs','''
Remind me tomorrow at 12:05pm to mend the blue waistcoat.|Mend the blue waistcoat|tomorrow 12:05
Set a nudge for Friday at 9:40am to collect the feather trim.|Collect the feather trim|weekday 5 09:40
please remind me in 39 minutes to put the costume tags back|Put the costume tags back|+ 39
On the 5th at 7:15pm remind me to ask Amina about the hat box.|Ask Amina about the hat box|date 5 19:15
Could you remind me Sunday at 5:05pm to return the velvet cape?|Return the velvet cape|weekday 7 17:05
Tonight at 8:15 nudge me to steam the green skirt.|Steam the green skirt|today 20:15
I need to send the understudy a fitting photo in 100 minutes.|Send the understudy a fitting photo|+ 100
Tuesday at 11:35am remind me to label the prop shoes.|Label the prop shoes|weekday 2 11:35
''')
    add('train','new_reminder_once','local-history-walk-one-offs','''
Remind me tomorrow at 8:35am to pack the old street maps.|Pack the old street maps|tomorrow 08:35
Could you remind me Saturday at 3:25pm to meet by the clock tower?|Meet by the clock tower|weekday 6 15:25
in 21 min remind me to send the route correction to Anand|Send the route correction to Anand|+ 21
On the 18th at 6:10pm remind me to return the borrowed megaphone.|Return the borrowed megaphone|date 18 18:10
Please nudge me Monday at 10:15am to print the building photographs.|Print the building photographs|weekday 1 10:15
Tonight at 9:25 remind me to charge the lapel mic.|Charge the lapel microphone|today 21:25
I should ask the archivist about the old bridge in 76 minutes.|Ask the archivist about the old bridge|+ 76
Sunday at 1:55pm remind me to bring the spare umbrellas.|Bring the spare umbrellas|weekday 7 13:55
''')
    add('train','new_reminder_once','orchard-volunteer-one-offs','''
Remind me tomorrow at 6:55am to bring the grafting tape.|Bring the grafting tape|tomorrow 06:55
Can you nudge me Friday at 4:10pm to collect the apple crates?|Collect the apple crates|weekday 5 16:10
please remind me in 32 mins to rinse the fruit press|Rinse the fruit press|+ 32
On the 29th at 10:25am remind me to ask Paolo about the ladder.|Ask Paolo about the ladder|date 29 10:25
Can I get a nudge to cover the seedling bench once Sunday gets to 5:35pm?|Cover the seedling bench|weekday 7 17:35
Tonight at 7:45 nudge me to return the pruning saw.|Return the pruning saw|today 19:45
I need to update the harvest sign in 58 minutes.|Update the harvest sign|+ 58
Wednesday at noon remind me to collect the cider bottles.|Collect the cider bottles|weekday 3 12:00
''')
    add('train','new_reminder_once','school-science-fair-one-offs','''
Remind me tomorrow at 7:55am to pack the foam planets.|Pack the foam planets|tomorrow 07:55
Please nudge me Wednesday at 5:15pm to print the judging sheets.|Print the judging sheets|weekday 3 17:15
in 14 minutes remind me to find the spare extension cord|Find the spare extension cord|+ 14
On the 11th at 8:50am remind me to ask Mr Bose about the display table.|Ask Mr Bose about the display table|date 11 08:50
Could you remind me Saturday at 1:25pm to label the salt-water jars?|Label the salt-water jars|weekday 6 13:25
Tonight at 9:45 nudge me to charge the planetarium speaker.|Charge the planetarium speaker|today 21:45
I should send the parent volunteers a parking note in 83 minutes.|Send the parent volunteers a parking note|+ 83
Friday at 10:05am remind me to bring the paper volcano.|Bring the paper volcano|weekday 5 10:05
''')
    add('train','new_reminder_once','riverside-plant-nursery-one-offs','''
Remind me tomorrow at 8:45am to bring the shade cloth samples.|Bring the shade cloth samples|tomorrow 08:45
Can you remind me Sunday at 12:35pm to collect the dwarf citrus tree?|Collect the dwarf citrus tree|weekday 7 12:35
in 37 mins remind me to ask Harini about the potting mix|Ask Harini about the potting mix|+ 37
On the 22nd at 5:55pm remind me to return the loaned hand trolley.|Return the loaned hand trolley|date 22 17:55
Please nudge me Friday at 7:40am to photograph the grafted rose.|Photograph the grafted rose|weekday 5 07:40
Tonight at 10:25 remind me to bring the seed catalogue indoors.|Bring the seed catalogue indoors|today 22:25
I should call the nursery about the bare-root order in 73 minutes.|Call the nursery about the bare-root order|+ 73
Saturday at 3:05pm remind me to label the compost samples.|Label the compost samples|weekday 6 15:05
''')
    add('train','new_reminder_once','neighborhood-food-drive-one-offs','''
Remind me tomorrow at 7:05am to bring the folding trolley.|Bring the folding trolley|tomorrow 07:05
Please nudge me Saturday at 4:35pm to collect the donated tins.|Collect the donated tins|weekday 6 16:35
in 53 minutes remind me to print the collection route|Print the collection route|+ 53
On the 17th at 11:20am remind me to ask Rakesh about the bakery boxes.|Ask Rakesh about the bakery boxes|date 17 11:20
Can you remind me Thursday at 6:25pm to restock the paper bags?|Restock the paper bags|weekday 4 18:25
Tonight at 8:40 remind me to put the weighing scale in the van.|Put the weighing scale in the van|today 20:40
I should text the pantry manager in 115 minutes.|Text the pantry manager|+ 115
''')
    add('train','new_reminder_once','mountain-bike-race-one-offs','''
Remind me tomorrow at 5:35am to tape the race number to my jersey.|Tape the race number to my jersey|tomorrow 05:35
Could you remind me Saturday at 6:45pm to pick up the timing chip?|Pick up the timing chip|weekday 6 18:45
pls nudge me in 12 minutes to check the tyre pressure|Check the tyre pressure|+ 12
On the 26th at 8:05am remind me to ask the marshal about the start corral.|Ask the marshal about the start corral|date 26 08:05
At 1:40pm Friday I should pack the electrolyte tabs; don't let me forget.|Pack the electrolyte tabs|weekday 5 13:40
Tonight at 9:55 remind me to charge the route beacon.|Charge the route beacon|today 21:55
I need to send the emergency contact number in 87 minutes.|Send the emergency contact number|+ 87
Sunday at 10:35am nudge me to return the borrowed pump.|Return the borrowed pump|weekday 7 10:35
''')
    add('train','new_reminder_once','handmade-paper-workshop-one-offs','''
Remind me tomorrow at 9:25am to soak the cotton rag.|Soak the cotton rag|tomorrow 09:25
Can you nudge me Sunday at 2:45pm to collect the drying screens?|Collect the drying screens|weekday 7 14:45
please remind me in 43 minutes to sweep the pulp off the floor|Sweep the pulp off the floor|+ 43
On the 14th at 10:15am remind me to ask Noor about the watermark mould.|Ask Noor about the watermark mould|date 14 10:15
Could I get a Friday-evening ping, 5:50pm, so the linen apron makes it back?|Return the linen apron|weekday 5 17:50
Tonight at 7:35 nudge me to put the pressed sheets under weight.|Put the pressed sheets under weight|today 19:35
I need to refill the deckle bucket in 91 minutes.|Refill the deckle bucket|+ 91
Saturday at 3:20pm remind me to photograph the blue pulp batch.|Photograph the blue pulp batch|weekday 6 15:20
''')
    add('train','new_reminder_once','school-library-book-fair-one-offs','''
Remind me tomorrow at 8:15am to bring the coin float.|Bring the coin float|tomorrow 08:15
Could you nudge me Thursday at 4:50pm to collect the author posters?|Collect the author posters|weekday 4 16:50
in 26 minutes remind me to make the volunteer name tags|Make the volunteer name tags|+ 26
On the 30th at 1:35pm remind me to return the folding display stands.|Return the folding display stands|date 30 13:35
Please remind me Saturday at 10:55am to put the class wish lists by the door.|Put the class wish lists by the door|weekday 6 10:55
Tonight at 9:15 nudge me to save the checkout tally.|Save the checkout tally|today 21:15
I should email the book supplier in 78 minutes.|Email the book supplier|+ 78
Friday at 2:25pm remind me to label the donated graphic novels.|Label the donated graphic novels|weekday 5 14:25
''')

    # Recurrences: explicit weekly/daily intent and true calendar month ends.
    add('train','new_reminder_repeating','last-day-accounting-routines','''
On the last day of every month at 6:40pm, remind me to reconcile the studio receipts.|Reconcile the studio receipts|monthly -1 18:40
monthly, final day at 8:15am: remind me to archive the payroll export|Archive the payroll export|monthly -1 08:15
Could you remind me at 5:30pm on each month's last day to submit the meter reading?|Submit the meter reading|monthly -1 17:30
Every month on its final date at noon, nudge me to check the petty cash tin.|Check the petty cash tin|monthly -1 12:00
last day of every month, 9:05pm, remind me to back up the ledger|Back up the ledger|monthly -1 21:05
At 7:45am on the final day monthly, remind me to send the payroll note.|Send the payroll note|monthly -1 07:45
On each month's last day remind me at 4:20pm to download the account statement.|Download the account statement|monthly -1 16:20
Please make that recurring: check the till float at 6:10pm on the last day of every month.|Check the till float|monthly -1 18:10
''')
    add('train','new_reminder_repeating','nightly-equipment-wrap-up','''
Every evening I need an alert at 9:25pm so I remember to switch off the soldering station.|Switch off the soldering station|daily 21:25
every night at 10:10 remind me to lock the music cupboard|Lock the music cupboard|daily 22:10
Please nudge me each evening at 8:35pm to charge the handheld scanners.|Charge the handheld scanners|daily 20:35
At 11:05pm every night, remind me to save the print queue.|Save the print queue|daily 23:05
could I get a nightly reminder at 9:50pm to bring the porch cushions in|Bring the porch cushions in|daily 21:50
Every night at 10:40pm remind me to put the camera batteries on charge.|Charge the camera batteries|daily 22:40
Set a reminder each night at 8:55pm to close the greenhouse vent.|Close the greenhouse vent|daily 20:55
An evening ping at 9:15pm each night would help me refill the cat's water bowl.|Refill the cat's water bowl|daily 21:15
''')
    add('train','new_reminder_repeating','weekday-workbench-start','''
Every weekday at 8:35am remind me to open the parts inventory.|Open the parts inventory|daily 08:35 1,2,3,4,5
weekday mornings at 7:20am, nudge me to review the bus depot handover|Review the bus depot handover|daily 07:20 1,2,3,4,5
Could you remind me Monday through Friday at 9:10am to check the shared mailbox?|Check the shared mailbox|daily 09:10 1,2,3,4,5
Each workday at 5:45pm remind me to put the sample books away.|Put the sample books away|daily 17:45 1,2,3,4,5
Every weekday at 12:25pm, nudge me to submit the lunch headcount.|Submit the lunch headcount|daily 12:25 1,2,3,4,5
Please remind me on weekdays at 6:50pm to lock the equipment cage.|Lock the equipment cage|daily 18:50 1,2,3,4,5
M-F at 8:05am remind me to start the dispatch checklist|Start the dispatch checklist|daily 08:05 1,2,3,4,5
Set a weekday reminder for 4:35pm to log the workshop temperatures.|Log the workshop temperatures|daily 16:35 1,2,3,4,5
''')
    add('train','new_reminder_repeating','weekend-market-regulars','''
Every Saturday at 6:20am remind me to pack the market sign.|Pack the market sign|daily 06:20 6
Sunday evenings at 5:45pm, remind me to count the leftover jars.|Count the leftover jars|daily 17:45 7
Please nudge me each Saturday at 3:10pm to confirm the flower stall.|Confirm the flower stall|daily 15:10 6
every Sunday at 8:30am remind me to charge the card reader|Charge the card reader|daily 08:30 7
At 7:15am on Saturdays, remind me to collect the bread order.|Collect the bread order|daily 07:15 6
Each Sunday at 6:05pm remind me to wash the display cloths.|Wash the display cloths|daily 18:05 7
Could I get a weekly Saturday reminder at 10:40am to bring the chalkboard?|Bring the chalkboard|daily 10:40 6
''')
    add('train','new_reminder_repeating','monthly-first-weekly-reports','''
On the 1st of each month at 9:35am, remind me to send the reading-room count.|Send the reading-room count|monthly 1 09:35
monthly on the 15th at 6:25pm: remind me to check the van mileage|Check the van mileage|monthly 15 18:25
Please remind me on the 7th every month at 11:50am to order receipt rolls.|Order receipt rolls|monthly 7 11:50
At 4:40pm on the 20th monthly, nudge me to file the committee minutes.|File the committee minutes|monthly 20 16:40
Each month on the 12th at 7:05am remind me to inspect the water meter.|Inspect the water meter|monthly 12 07:05
Remind me every month on the 24th at 8:55pm to download the archive snapshot.|Download the archive snapshot|monthly 24 20:55
Set a monthly nudge for the 9th at 1:15pm to renew the noticeboard listings.|Renew the noticeboard listings|monthly 9 13:15
On the 3rd of every month at 5:10pm remind me to update the pantry inventory.|Update the pantry inventory|monthly 3 17:10
''')
    add('train','new_reminder_repeating','daily-language-practice','''
Every day at 6:35am remind me to do ten minutes of Japanese listening.|Do ten minutes of Japanese listening|daily 06:35
please nudge me nightly at 8:45pm to review my Arabic flashcards|Review my Arabic flashcards|daily 20:45
At 12:15pm each day, remind me to practise the violin scale slowly.|Practise the violin scale slowly|daily 12:15
I want a daily reminder at 7:55pm to write one line in my Spanish journal.|Write one line in my Spanish journal|daily 19:55
Every morning at 5:50am remind me to stretch before the run.|Stretch before the run|daily 05:50
Remind me daily, 9:40pm, to read one page of the grammar book.|Read one page of the grammar book|daily 21:40
Could you set a reminder for every day at 3:25pm to watercolour for a bit?|Spend some time watercolour painting|daily 15:25
Each day at 10:05am, nudge me to check the pronunciation recording.|Check the pronunciation recording|daily 10:05
''')
    add('train','new_reminder_repeating','weekly-club-practice','''
Every Tuesday at 7:10pm remind me to practise the bass line.|Practise the bass line|daily 19:10 2
Saturday mornings at 9:45am, nudge me to run the trail loop.|Run the trail loop|daily 09:45 6
Please remind me each Thursday at 6:30pm to bring my chess notebook.|Bring my chess notebook|daily 18:30 4
Every Wednesday at 8:05pm remind me to join the pottery open studio.|Join the pottery open studio|daily 20:05 3
Could you set a weekly Sunday reminder at 2:20pm to call the reading circle?|Call the reading circle|daily 14:20 7
Remind me every Monday at 7:35am to check the rowing forecast.|Check the rowing forecast|daily 07:35 1
Friday at 5:55pm each week, nudge me to put out the badminton nets.|Put out the badminton nets|daily 17:55 5
I need a recurring reminder each Saturday at 11:15am to clean my camera lens.|Clean my camera lens|daily 11:15 6
''')
    add('train','new_reminder_repeating','monthly-last-day-household','''
On the final day each month at 7:25pm remind me to empty the dehumidifier.|Empty the dehumidifier|monthly -1 19:25
Every month's last day at 10:15am, nudge me to check the smoke alarm batteries.|Check the smoke alarm batteries|monthly -1 10:15
Please remind me on the last calendar day monthly at 3:35pm to water the fern wall.|Water the fern wall|monthly -1 15:35
last day of each month, 8:50pm: remind me to back up the family photos|Back up the family photos|monthly -1 20:50
At noon on the last of every month remind me to wipe the fridge seals.|Wipe the fridge seals|monthly -1 12:00
Could you set a repeating last-day reminder for 6:05am to put out the glass bin?|Put out the glass bin|monthly -1 06:05
Every month on its final day at 9:45am, remind me to read the boiler meter.|Read the boiler meter|monthly -1 09:45
Please nudge me at 5:20pm on the final day each month to water the citrus pot.|Water the citrus pot|monthly -1 17:20
''')
    add('train','new_reminder_repeating','nightly-close-routines','''
Every night at 9:40pm remind me to lock the bicycle shed.|Lock the bicycle shed|daily 21:40
Nightly, 10:55pm, nudge me to put the tablet in the study drawer.|Put the tablet in the study drawer|daily 22:55
At 8:05pm each evening remind me to turn the porch light on.|Turn the porch light on|daily 20:05
Please remind me every night at 11:15pm to save the audio project.|Save the audio project|daily 23:15
Every evening at 7:30pm, remind me to bring the laundry rack inside.|Bring the laundry rack inside|daily 19:30
could you remind me nightly at 9:05pm to check the back door|Check the back door|daily 21:05
Set a recurring nudge at 10:35pm to unplug the soldering mat.|Unplug the soldering mat|daily 22:35
Each night at 8:25pm remind me to put the library books by the door.|Put the library books by the door|daily 20:25
''')
    add('train','new_reminder_repeating','weekly-family-calls','''
Every Sunday at 7:20pm remind me to call Nana.|Call Nana|daily 19:20 7
Could you nudge me each Wednesday at 6:05pm to check in with my brother?|Check in with my brother|daily 18:05 3
Saturday at 10:50am weekly, remind me to video call the twins.|Video call the twins|daily 10:50 6
Please remind me every Monday at 8:15pm to send Dad the crossword.|Send Dad the crossword|daily 20:15 1
Every Thursday at 5:35pm remind me to ask Leela how the seedlings are doing.|Ask Leela how the seedlings are doing|daily 17:35 4
Set a weekly nudge for Friday at 7:45pm to call my aunt in Kochi.|Call my aunt in Kochi|daily 19:45 5
Each Tuesday at 9:05pm remind me to share the family photo album.|Share the family photo album|daily 21:05 2
Remind me every Saturday at 1:30pm to message my cousin about lunch.|Message my cousin about lunch|daily 13:30 6
''')
    add('train','new_reminder_repeating','monthly-last-day-studio-admin','''
Remind me at 4:55pm on the last day each month to archive the project proofs.|Archive the project proofs|monthly -1 16:55
Every month's final day at 8:35am, nudge me to export the studio booking calendar.|Export the studio booking calendar|monthly -1 08:35
last day monthly at 6:25pm remind me to email the kiln maintenance log|Email the kiln maintenance log|monthly -1 18:25
Please set a monthly final-day reminder at 1:45pm to check the studio first-aid kit.|Check the studio first-aid kit|monthly -1 13:45
On the last date each month at 10:50pm, remind me to back up the design files.|Back up the design files|monthly -1 22:50
Could you remind me at 7:10am on every month's last day to lock the paint cabinet?|Lock the paint cabinet|monthly -1 07:10
Nudge me each month on the final day at 2:30pm to submit the room booking tally.|Submit the room booking tally|monthly -1 14:30
At 5:05pm on the last day of every month remind me to update the supply list.|Update the supply list|monthly -1 17:05
''')
    add('train','new_reminder_repeating','sunday-pantry-reset','''
Every Sunday at 6:50pm remind me to soak the chickpeas for Monday.|Soak the chickpeas for Monday|daily 18:50 7
At 9:10am each Sunday, nudge me to check the pantry staples.|Check the pantry staples|daily 09:10 7
Please remind me every Sunday at 3:30pm to make the week's soup stock.|Make the week's soup stock|daily 15:30 7
Sunday at 8:40pm weekly remind me to put the lunch jars in the fridge|Put the lunch jars in the fridge|daily 20:40 7
Every week on Sunday at 11:25am remind me to sharpen the kitchen knife.|Sharpen the kitchen knife|daily 11:25 7
Set a weekly Sunday reminder at 5:15pm to write the grocery list.|Write the grocery list|daily 17:15 7
Could you nudge me Sunday mornings at 7:35am to start the bean soak?|Start the bean soak|daily 07:35 7
Each Sunday at 10:20pm remind me to label the leftovers.|Label the leftovers|daily 22:20 7
''')
    add('train','new_reminder_repeating','monthly-first-day-community-room','''
On the 1st every month at 8:45am remind me to collect the community-room keys.|Collect the community-room keys|monthly 1 08:45
Please nudge me at 6:35pm on the first of each month to update the hall noticeboard.|Update the hall noticeboard|monthly 1 18:35
monthly on day one at 11:20am remind me to test the microphone cupboard|Test the microphone cupboard|monthly 1 11:20
Every month's first day at 4:05pm, remind me to send the room-use report.|Send the room-use report|monthly 1 16:05
At 9:55am on the 1st each month, nudge me to check the fire-exit signs.|Check the fire-exit signs|monthly 1 09:55
Could I get a monthly reminder on the 1st at 7:25pm to refill the tea tin?|Refill the tea tin|monthly 1 19:25
Remind me on the first of every month at 12:40pm to post the events calendar.|Post the events calendar|monthly 1 12:40
Set a recurring reminder for the 1st at 5:50pm to put the folding tables away.|Put the folding tables away|monthly 1 17:50
''')
    add('train','new_reminder_repeating','monthly-last-day-club-books','''
On the last day of every month at 6:15pm remind me to reconcile the book-club dues.|Reconcile the book-club dues|monthly -1 18:15
At 9:30am on the final date monthly, nudge me to return the club banner.|Return the club banner|monthly -1 09:30
Every month's last day at 7:55pm remind me to post next month's reading choice.|Post next month's reading choice|monthly -1 19:55
Please remind me at 12:20pm on the last calendar day to submit the library-room request.|Submit the library-room request|monthly -1 12:20
last day each month at 3:05pm, remind me to email the guest speaker|Email the guest speaker|monthly -1 15:05
Could you set a recurring nudge at 8:25am on the month's final day to check the projector?|Check the projector|monthly -1 08:25
On the final day monthly at 10:45pm remind me to save the meeting notes.|Save the meeting notes|monthly -1 22:45
Every month on its last day at 5:40pm, remind me to put out the next event poster.|Put out the next event poster|monthly -1 17:40
''')
    add('train','new_reminder_repeating','friday-workshop-close','''
Every Friday at 6:30pm remind me to lock the shared tool cabinet.|Lock the shared tool cabinet|daily 18:30 5
At 4:45pm every Friday nudge me to wipe down the printmaking tables.|Wipe down the printmaking tables|daily 16:45 5
Please remind me each Friday at 7:05pm to log the equipment repairs.|Log the equipment repairs|daily 19:05 5
Friday evenings at 8:15pm, remind me to charge the workshop radio.|Charge the workshop radio|daily 20:15 5
Every Friday at 5:25pm remind me to empty the clay reclaim bucket.|Empty the clay reclaim bucket|daily 17:25 5
Set a recurring reminder for Fridays at 6:55pm to return the studio keys.|Return the studio keys|daily 18:55 5
Could I get a weekly Friday nudge at 3:35pm to put away the soldering mats?|Put away the soldering mats|daily 15:35 5
Remind me Friday at 9:40pm every week to save the laser-cutter job files.|Save the laser-cutter job files|daily 21:40 5
''')

    # Create-task requests ask Cortex to write a recurring brief, not to remind the user.
    add('train','new_task','independent-market-research-briefs','''
Every Monday at 8:35am, prepare a short comparison of current electric-bike prices.|Compare current electric-bike prices|daily 08:35 1|live
At 6pm each Friday, write a digest of new public transit projects.|Summarise new public transit projects|daily 18:00 5|live
Could you draft a weekday morning update on new food safety notices at 7:15?|Summarise new food safety notices|daily 07:15 1,2,3,4,5|live
Each Sunday at 4:20pm, compile the latest regional astronomy events.|Compile regional astronomy events|daily 16:20 7|live
Write me a daily 9:10am brief on current battery recycling research.|Summarise current battery recycling research|daily 09:10|live
''')
    add('train','new_task','personal-study-syntheses','''
Every night at 8:45pm, write a recap of the biology notes I added today.|Summarise today's biology notes|daily 20:45|local
On Wednesdays at 6:30pm, pull together the questions from my language lessons.|Summarise questions from my language lessons|daily 18:30 3|local
Each Sunday at 10am prepare a short review of my saved architecture articles.|Review my saved architecture articles|daily 10:00 7|local
At 7:25pm daily, write a digest of the cooking ideas I bookmarked.|Summarise my bookmarked cooking ideas|daily 19:25|local
Every Friday at 5:40pm draft a recap of my photography practice notes.|Summarise my photography practice notes|daily 17:40 5|local
''')
    add('train','new_task','operations-team-digests','''
Every workday at 5:15pm, compile the open issues from my project notes.|Summarise open issues from my project notes|daily 17:15 1,2,3,4,5|local
At noon on Tuesdays write a brief from the workshop inspection log.|Summarise the workshop inspection log|daily 12:00 2|local
Please generate a Monday 8:50am recap of the decisions in my meeting notes.|Summarise decisions in my meeting notes|daily 08:50 1|local
Each Thursday at 4:35pm, draft a list of unresolved comments in my design documents.|List unresolved comments in my design documents|daily 16:35 4|local
Every month on the 6th at 9:20am, write a summary of my support tickets.|Summarise my support tickets|monthly 6 09:20|local
''')
    add('train','new_task','current-environment-watch','''
At 7:30am every day, write a digest of current air quality updates for Pune.|Summarise current air quality updates for Pune|daily 07:30|live
Every Thursday at 6:10pm, compile the latest local water conservation notices.|Summarise local water conservation notices|daily 18:10 4|live
Prepare a Sunday 9:45am roundup of new coastal flood advisories.|Summarise new coastal flood advisories|daily 09:45 7|live
Each weekday at 8:05am write a quick update on current wildfire reports.|Summarise current wildfire reports|daily 08:05 1,2,3,4,5|live
On the last day of each month at 3pm, write a digest of current city tree-planting grants.|Summarise current city tree-planting grants|monthly -1 15:00|live
''')
    add('train','new_task','saved-recipe-roundups','''
Every Sunday at 7:15pm, write a list of the recipes I saved this week.|List recipes I saved this week|daily 19:15 7|local
At 8:20pm daily, prepare a recap of my bread-baking notes.|Summarise my bread-baking notes|daily 20:20|local
Each Wednesday at 5:55pm, draft a short review of new recipes in my cookbook folder.|Review new recipes in my cookbook folder|daily 17:55 3|local
Once a month on the 11th at 6:05pm, write up the meals I marked as favourites.|Summarise my favourite meals|monthly 11 18:05|local
Please create a Friday 9:35pm digest of my saved lunch ideas.|Summarise my saved lunch ideas|daily 21:35 5|local
''')
    add('train','new_task','community-event-roundups','''
Every Saturday at 8:30am prepare a current list of free public lectures nearby.|List current free public lectures nearby|daily 08:30 6|live
On Mondays at 6:45pm, write a digest of upcoming library events in Mysuru.|Summarise upcoming library events in Mysuru|daily 18:45 1|live
Could you compile current neighbourhood repair cafes each Thursday at 7pm?|List current neighbourhood repair cafes|daily 19:00 4|live
At 10:15am each Sunday, prepare a guide to this month's local bird walks.|Write a guide to this month's local bird walks|daily 10:15 7|live
Every Friday at 4:50pm, prepare a current roundup of independent craft fairs.|Summarise current craft fairs|daily 16:50 5|live
''')
    add('train','new_task','personal-reading-history','''
Each Tuesday at 9:05pm, write a recap of the books I read this week.|Summarise books I read this week|daily 21:05 2|local
Every night at 10:15pm, compile the passages I highlighted today.|Compile passages I highlighted today|daily 22:15|local
At 5:30pm each Friday draft a review of my saved essays on urban design.|Review my saved essays on urban design|daily 17:30 5|local
On the 1st of every month at 7:40pm, write a list of books I abandoned.|List books I abandoned|monthly 1 19:40|local
Please produce a Sunday 6:20pm summary of my reading-club notes.|Summarise my reading-club notes|daily 18:20 7|local
''')
    add('train','new_task','small-business-news-briefs','''
Every weekday at 7:55am write a current briefing on new small-business tax notices.|Summarise new small-business tax notices|daily 07:55 1,2,3,4,5|live
Each month on the last day at 8:10am, compile current wholesale coffee price changes.|Summarise current wholesale coffee price changes|monthly -1 08:10|live
At 5:35pm every Tuesday, write a digest of new payment security advisories.|Summarise new payment security advisories|daily 17:35 2|live
Please prepare a Saturday 11:25am update on current packaging regulations.|Summarise current packaging regulations|daily 11:25 6|live
Every Monday at 6:50pm, list current grant deadlines for independent shops.|List current grant deadlines for independent shops|daily 18:50 1|live
''')
    add('train','new_task','volunteer-team-recaps','''
Every Sunday at 8:40pm, write a recap of the volunteer shift notes I saved.|Summarise my saved volunteer shift notes|daily 20:40 7|local
At 4:55pm on Fridays, pull together the unanswered questions from our cleanup chats.|Summarise unanswered questions from cleanup chats|daily 16:55 5|local
Each Wednesday at 7:10pm, draft a list of the community kitchen's open tasks from my notes.|List open tasks from my community kitchen notes|daily 19:10 3|local
Please write a monthly summary of the donation counts on the 28th at 6:25pm.|Summarise my donation counts|monthly 28 18:25|local
Every Monday at 9:45am prepare a brief of the food-drive handover notes.|Summarise food-drive handover notes|daily 09:45 1|local
''')
    add('train','new_task','technology-release-briefs','''
At 8:15am every weekday, write me a digest of current browser security releases.|Summarise current browser security releases|daily 08:15 1,2,3,4,5|live
Each Friday at 3:25pm compile the latest public Rust language announcements.|Summarise public Rust language announcements|daily 15:25 5|live
Please prepare a Monday evening roundup of new open hardware releases at 7:40pm.|Summarise new open hardware releases|daily 19:40 1|live
Every day at 6:55am, write a short brief on current data privacy guidance.|Summarise current data privacy guidance|daily 06:55|live
On the 19th each month at noon, compile current accessibility guidance for mobile apps.|Summarise current accessibility guidance for mobile apps|monthly 19 12:00|live
''')
    add('train','new_task','local-weather-summaries','''
Every morning at 6:45am write a current weather outlook for the Western Ghats.|Summarise the current weather outlook for the Western Ghats|daily 06:45|live
At 7pm each Wednesday, prepare a digest of current heat alerts in Hyderabad.|Summarise current heat alerts in Hyderabad|daily 19:00 3|live
Please compile current monsoon road closures each Friday at 5:20pm.|Summarise current monsoon road closures|daily 17:20 5|live
On the 2nd of every month at 8:30am, write a current rainfall summary for Chennai.|Summarise current rainfall in Chennai|monthly 2 08:30|live
Every Saturday at 9:15pm, prepare an update on current snow warnings for the trek route.|Summarise current snow warnings for the trek route|daily 21:15 6|live
''')
    add('train','new_task','personal-project-status','''
Every Monday at 7:25pm, write a recap of what I changed in the garden plan.|Summarise changes to my garden plan|daily 19:25 1|local
At 5:10pm daily compile the tasks I marked done in my notebook.|Summarise tasks I marked done in my notebook|daily 17:10|local
Each Friday at 8:55pm write a short review of my sewing-project progress notes.|Review my sewing-project progress notes|daily 20:55 5|local
Please draft a monthly recap of my home renovation decisions at 6:35pm on the 20th.|Summarise my home renovation decisions|monthly 20 18:35|local
On Sundays at 4:15pm, prepare a recap of my trail-running log.|Summarise my trail-running log|daily 16:15 7|local
''')

    # Stable personal details: keep the person in subject and the detail in attribute.
    add('train','save_fact','architecture-studio-contacts','''
Mira's office is in Pune.|Mira|office location|Pune
Remember that Kunal's extension is 4821.|Kunal|extension|4821
Asha's work email is asha.iyer@example.test.|Asha|work email|asha.iyer@example.test
Please save Devika's professional title as lighting designer.|Devika|professional title|lighting designer
Naveen's studio is called Copper Finch Works.|Naveen|studio name|Copper Finch Works
Sana's preferred name is Sanu.|Sana|preferred name|Sanu
Actually, Mira's office is in Nashik now.|Mira|office location|Nashik|update
Kunal's extension changed to 4910; please remember the new one.|Kunal|extension|4910|update
''')
    add('train','save_fact','neighborhood-care-circle','''
Leela's birthday is 22 May.|Leela|birthday|22 May
Please remember Farid's landline is 020-555-0182.|Farid|landline|020-555-0182
Rupa lives at 17 Gulmohar Lane.|Rupa|home address|17 Gulmohar Lane
Save that Imran's emergency contact is his sister Nargis.|Imran|emergency contact|his sister Nargis
Meenal's preferred language is Marathi.|Meenal|preferred language|Marathi
Tapan's building number is 44.|Tapan|building number|44
Actually Leela's birthday is 23 May, not 22 May.|Leela|birthday|23 May|update
Rupa moved to 21 Gulmohar Lane; update her home address.|Rupa|home address|21 Gulmohar Lane|update
''')
    add('train','save_fact','independent-clinic-directory','''
Dr Nandita's clinic is called Riverbend Family Practice.|Dr Nandita|clinic name|Riverbend Family Practice
Remember Dr Felix's appointment line is 011-555-0144.|Dr Felix|appointment phone|011-555-0144
Dr Amara's specialty is pediatric cardiology.|Dr Amara|specialty|pediatric cardiology
Please save that Dr Sood accepts the CareSpring plan.|Dr Sood|insurance accepted|CareSpring plan
Dr Howard's office email is howard.office@example.test.|Dr Howard|office email|howard.office@example.test
Keep Dr Iqbal's preferred title as Professor Iqbal.|Dr Iqbal|preferred title|Professor Iqbal
Dr Nandita's clinic is now named Riverbend Health Rooms.|Dr Nandita|clinic name|Riverbend Health Rooms|update
Dr Felix's appointment line changed to 011-555-0166.|Dr Felix|appointment phone|011-555-0166|update
''')
    add('train','save_fact','bookbinding-workshop-people','''
Parul's role at the bindery is paper conservator.|Parul|role|paper conservator
Store that Ramesh's workbench number is B-14.|Ramesh|workbench number|B-14
Zoya's preferred glue is wheat paste.|Zoya|preferred glue|wheat paste
Please remember that Anton trained in Prague.|Anton|training location|Prague
Nisha's shop email is nisha.bindery@example.test.|Nisha|shop email|nisha.bindery@example.test
Milan's birthday is 9 February.|Milan|birthday|9 February
Parul's role is now senior paper conservator.|Parul|role|senior paper conservator|update
Zoya prefers methyl cellulose now, so update her preferred glue.|Zoya|preferred glue|methyl cellulose|update
''')
    add('train','save_fact','school-science-fair-team','''
Save that Isha's science teacher is Mr Dutta.|Isha|science teacher|Mr Dutta
Rohan's project partner is Neel.|Rohan|project partner|Neel
Remember Aditi's classroom is 2C.|Aditi|classroom|2C
Tushar's parent email is t.kale@example.test.|Tushar|parent email|t.kale@example.test
Please keep Zara's science project title as How Seeds Travel.|Zara|project title|How Seeds Travel
Arnav's school office extension is 263.|Arnav|school office extension|263
Isha's science teacher is Ms Menon this term.|Isha|science teacher|Ms Menon|update
Zara renamed the project to Seeds on the Move; update the title.|Zara|project title|Seeds on the Move|update
''')
    add('train','save_fact','heritage-house-volunteers','''
Remember that Indu's volunteer badge code is HH-38.|Indu|badge code|HH-38
Joseph's shift lead is Mrs Pinto.|Joseph|shift lead|Mrs Pinto
Please save Nilofer's volunteer role as garden guide.|Nilofer|volunteer role|garden guide
Eshan's emergency number is 98-555-0140.|Eshan|emergency number|98-555-0140
Rafi's preferred tour language is Bengali.|Rafi|preferred tour language|Bengali
Keep Tara's home branch as the North Gate entrance.|Tara|home branch|North Gate entrance
Indu's badge code is HH-41 now.|Indu|badge code|HH-41|update
Nilofer is now the archive-room guide, please update her volunteer role.|Nilofer|volunteer role|archive-room guide|update
''')
    add('train','save_fact','community-orchestra-roster','''
Save that Bhavna plays the oboe.|Bhavna|instrument|oboe
Kartik's orchestra section is second violin.|Kartik|orchestra section|second violin
Remember Renu's preferred tuning is A=442.|Renu|preferred tuning|A=442
Anil's concert shirt size is medium.|Anil|concert shirt size|medium
Please note that Selvi's music stand is number 12.|Selvi|music stand number|12
Kabir's conductor is A. Fernandes.|Kabir|conductor|A. Fernandes
Bhavna switched to English horn; update her instrument.|Bhavna|instrument|English horn|update
Kartik now sits in first violin, change his orchestra section.|Kartik|orchestra section|first violin|update
''')
    add('train','save_fact','repair-cafe-volunteer-details','''
Please remember Omar's repair specialty is small appliances.|Omar|repair specialty|small appliances
Lata's bench number is 6.|Lata|bench number|6
Save that Chen's volunteer email is chen.repairs@example.test.|Chen|volunteer email|chen.repairs@example.test
Dev's safety course expires in October 2027.|Dev|safety course expiry|October 2027
Moussa's preferred shift is the morning session.|Moussa|preferred shift|morning session
Keep Priti's tool locker as cabinet C-9.|Priti|tool locker|cabinet C-9
Omar now specialises in sewing machines; update his repair specialty.|Omar|repair specialty|sewing machines|update
Lata's bench was renumbered to 8; update it.|Lata|bench number|8|update
''')
    add('train','save_fact','orchard-cooperative-directory','''
Remember that Aurel's orchard row is D-7.|Aurel|orchard row|D-7
Sonal's harvest contact is sonal.fruit@example.test.|Sonal|harvest email|sonal.fruit@example.test
Please save Gerry's forklift certificate number as FL-2608.|Gerry|forklift certificate|FL-2608
Uma's preferred crate size is 12 kilograms.|Uma|preferred crate size|12 kilograms
Nabil's block captain is Reena Shah.|Nabil|block captain|Reena Shah
Keep Yuki's packing shed access code as PINE-46.|Yuki|packing shed access code|PINE-46
Aurel's orchard row changed to E-2.|Aurel|orchard row|E-2|update
Uma prefers the 8-kilogram crate now; update her preferred crate size.|Uma|preferred crate size|8-kilogram crate|update
''')
    add('train','save_fact','independent-bookshop-directory','''
Save that Esha's shop is called Paper Lantern Books.|Esha|shop name|Paper Lantern Books
Rudra's bookseller licence is BL-9037.|Rudra|bookseller licence|BL-9037
Please remember Nina's ordering email is nina.orders@example.test.|Nina|ordering email|nina.orders@example.test
Javed's preferred publisher contact is Mara Kline.|Javed|publisher contact|Mara Kline
Tess's shop opening year was 2018.|Tess|opening year|2018
Keep Amol's delivery entrance as the side lane door.|Amol|delivery entrance|side lane door
Esha renamed the shop Lantern & Leaf Books.|Esha|shop name|Lantern & Leaf Books|update
Nina's ordering email is now nina.buying@example.test.|Nina|ordering email|nina.buying@example.test|update
''')

    # Reminder management includes one-off schedules that must remain one-off when moved.
    add('train','manage_reminder','move-one-off-appointment-reminders','''
Move my dentist reminder to Thursday at noon.|Dental cleaning|update_schedule|weekday 4 12:00|tomorrow 10:00
Pause the reminder for my blood test pickup.|Collect test results|pause_schedule|-|tomorrow 10:00
Snooze the physio referral reminder for 18 minutes.|Call physiotherapy clinic|snooze_schedule|18|tomorrow 10:00
Cancel the reminder to bring my old scan.|Bring old scan to clinic|cancel_schedule|-|tomorrow 10:00
Change the appointment reminder text to Bring the insurance card.|Clinic appointment|update_schedule|text:Bring the insurance card|tomorrow 10:00
''')
    add('train','manage_reminder','one-off-school-pickups','''
Move the class photo reminder to Friday at 3:30pm.|Collect class photos|update_schedule|weekday 5 15:30|tomorrow 09:00
Pause the note about returning the library book.|Return school library book|pause_schedule|-|tomorrow 09:00
Snooze the science folder pickup for 25 minutes.|Collect science folder|snooze_schedule|25|tomorrow 09:00
Cancel my reminder to pack the art smock.|Pack art smock|cancel_schedule|-|tomorrow 09:00
Rename the school trip reminder to Bring signed form.|School trip|update_schedule|text:Bring signed form|tomorrow 09:00
''')
    add('train','manage_reminder','one-off-travel-checklist','''
Shift the passport photo reminder to Monday at 8:15am.|Take passport photo|update_schedule|weekday 1 08:15|tomorrow 09:00
Pause my reminder to print the train ticket.|Print train ticket|pause_schedule|-|tomorrow 09:00
Snooze the cab booking nudge for 35 minutes.|Book airport cab|snooze_schedule|35|tomorrow 09:00
Cancel the reminder to download the offline map.|Download offline map|cancel_schedule|-|tomorrow 09:00
Change my suitcase tag reminder to Pack the blue tags.|Suitcase tags|update_schedule|text:Pack the blue tags|tomorrow 09:00
''')
    add('train','manage_reminder','one-off-repair-shop-visits','''
Move the vacuum repair pickup to Thursday at 1pm.|Collect repaired vacuum|update_schedule|weekday 4 13:00|tomorrow 09:00
Please pause the note to ask about the washing machine hose.|Ask about washer hose|pause_schedule|-|tomorrow 09:00
Snooze the bicycle brake check for 12 minutes.|Check bicycle brakes|snooze_schedule|12|tomorrow 09:00
Cancel my reminder to bring the lamp shade in.|Bring lamp shade to repair shop|cancel_schedule|-|tomorrow 09:00
Update the repair counter reminder to Take the claim ticket.|Repair counter|update_schedule|text:Take the claim ticket|tomorrow 09:00
''')
    add('train','manage_reminder','one-off-community-hall-bookings','''
Move my hall key reminder to Saturday at 10:45am.|Return community hall key|update_schedule|weekday 6 10:45|tomorrow 09:00
Pause the nudge to confirm the chair count.|Confirm chair count|pause_schedule|-|tomorrow 09:00
Snooze the banner collection reminder for 45 minutes.|Collect event banner|snooze_schedule|45|tomorrow 09:00
Cancel the reminder to email the caretaker.|Email the caretaker|cancel_schedule|-|tomorrow 09:00
Change the hall cleanup reminder to Bring the blue cloths.|Hall cleanup|update_schedule|text:Bring the blue cloths|tomorrow 09:00
''')
    add('train','manage_reminder','one-off-studio-supply-runs','''
Move the clay pickup reminder to Tuesday at 4:20pm.|Collect clay order|update_schedule|weekday 2 16:20|tomorrow 09:00
Pause the reminder for ordering tracing paper.|Order tracing paper|pause_schedule|-|tomorrow 09:00
Snooze the ink sample collection for 30 minutes.|Collect ink samples|snooze_schedule|30|tomorrow 09:00
Cancel the nudge to bring the lino cutters.|Bring lino cutters|cancel_schedule|-|tomorrow 09:00
''')
    add('train','manage_reminder','one-off-pet-care-visits','''
Move the cat carrier pickup to Friday at 11:10am.|Collect cat carrier|update_schedule|weekday 5 11:10|tomorrow 09:00
Pause the reminder about taking Pesto's sample to the vet.|Take Pesto's sample to vet|pause_schedule|-|tomorrow 09:00
Snooze the groomer call for 22 minutes.|Call the groomer|snooze_schedule|22|tomorrow 09:00
Cancel the note to pack the rabbit's travel hay.|Pack rabbit travel hay|cancel_schedule|-|tomorrow 09:00
Change the vet folder reminder to Bring the vaccination card.|Vet folder|update_schedule|text:Bring the vaccination card|tomorrow 09:00
''')
    add('train','manage_reminder','one-off-volunteer-deliveries','''
Move the food-bank crate drop to Wednesday at 2:40pm.|Drop crates at food bank|update_schedule|weekday 3 14:40|tomorrow 09:00
Pause the note to call the shelter coordinator.|Call shelter coordinator|pause_schedule|-|tomorrow 09:00
Snooze the blanket donation pickup for 40 minutes.|Collect blanket donations|snooze_schedule|40|tomorrow 09:00
Cancel the reminder to bring the folding trolley.|Bring folding trolley|cancel_schedule|-|tomorrow 09:00
Change the pantry delivery reminder to Count the sealed tins.|Pantry delivery|update_schedule|text:Count the sealed tins|tomorrow 09:00
''')
    add('train','manage_reminder','one-off-vehicle-inspection','''
Move the emissions test reminder to Monday at 9:25am.|Take car for emissions test|update_schedule|weekday 1 09:25|tomorrow 09:00
Pause my reminder to check the tyre tread.|Check tyre tread|pause_schedule|-|tomorrow 09:00
Snooze the garage appointment nudge for 16 minutes.|Call garage about appointment|snooze_schedule|16|tomorrow 09:00
Cancel the reminder to bring the registration papers.|Bring registration papers|cancel_schedule|-|tomorrow 09:00
Change the car wash reminder wording to Ask for the underbody rinse.|Car wash|update_schedule|text:Ask for the underbody rinse|tomorrow 09:00
''')
    add('train','manage_reminder','one-off-music-rehearsal-logistics','''
Move the oboe repair pickup to Saturday at 12:35pm.|Collect repaired oboe|update_schedule|weekday 6 12:35|tomorrow 09:00
Pause the note to print the quartet parts.|Print quartet parts|pause_schedule|-|tomorrow 09:00
Snooze the rehearsal-room key return for 28 minutes.|Return rehearsal-room key|snooze_schedule|28|tomorrow 09:00
Cancel the reminder to pack the mute.|Pack the mute|cancel_schedule|-|tomorrow 09:00
Update the concert folder reminder to Bring the marked score.|Concert folder|update_schedule|text:Bring the marked score|tomorrow 09:00
''')
    add('train','manage_reminder','one-off-garden-club-visits','''
Move the compost delivery reminder to Thursday at 8:40am.|Meet compost delivery|update_schedule|weekday 4 08:40|tomorrow 09:00
Pause the note to collect the grafted pear tree.|Collect grafted pear tree|pause_schedule|-|tomorrow 09:00
Snooze the seed exchange pickup for 33 minutes.|Pick up seed exchange packet|snooze_schedule|33|tomorrow 09:00
Cancel the reminder to bring the pruning gloves.|Bring pruning gloves|cancel_schedule|-|tomorrow 09:00
Change the garden gate reminder to Leave the brass key with Uma.|Garden gate|update_schedule|text:Leave the brass key with Uma|tomorrow 09:00
''')
    add('train','manage_reminder','one-off-library-returns','''
Move the archive box return to Tuesday at 3:05pm.|Return archive box|update_schedule|weekday 2 15:05|tomorrow 09:00
Pause the note about collecting the interlibrary loan.|Collect interlibrary loan|pause_schedule|-|tomorrow 09:00
Snooze the library card renewal call for 14 minutes.|Call library about card renewal|snooze_schedule|14|tomorrow 09:00
Cancel my reminder to bring back the atlas.|Return the atlas|cancel_schedule|-|tomorrow 09:00
Change the reading room reminder to Take my pencil case.|Reading room visit|update_schedule|text:Take my pencil case|tomorrow 09:00
''')
    add('train','manage_reminder','one-off-sewing-alterations','''
Move the trouser fitting to Friday at 4:50pm.|Go to trouser fitting|update_schedule|weekday 5 16:50|tomorrow 09:00
Pause the note to collect the button sample card.|Collect button sample card|pause_schedule|-|tomorrow 09:00
Snooze the tailor call for 19 minutes.|Call the tailor|snooze_schedule|19|tomorrow 09:00
Cancel the reminder to bring the coat lining.|Bring coat lining|cancel_schedule|-|tomorrow 09:00
Change the sewing class reminder to Pack the seam ripper.|Sewing class|update_schedule|text:Pack the seam ripper|tomorrow 09:00
''')
    add('train','manage_reminder','one-off-school-office-admin','''
Move the school office visit to Wednesday at 10:25am.|Visit school office|update_schedule|weekday 3 10:25|tomorrow 09:00
Pause the reminder to sign the excursion form.|Sign excursion form|pause_schedule|-|tomorrow 09:00
Snooze the library fee payment nudge for 24 minutes.|Pay library fee|snooze_schedule|24|tomorrow 09:00
Cancel the note to return the spare uniform.|Return spare uniform|cancel_schedule|-|tomorrow 09:00
Update the classroom visit reminder to Bring the visitor badge.|Classroom visit|update_schedule|text:Bring the visitor badge|tomorrow 09:00
''')
    add('train','manage_reminder','one-off-farmers-market-stalls','''
Move the produce scale drop-off to Thursday at 7:15am.|Drop off produce scale|update_schedule|weekday 4 07:15|tomorrow 09:00
Pause the reminder to print the stall menu.|Print stall menu|pause_schedule|-|tomorrow 09:00
Snooze the chalkboard pickup for 17 minutes.|Collect stall chalkboard|snooze_schedule|17|tomorrow 09:00
Cancel my note to bring the cash float.|Bring cash float|cancel_schedule|-|tomorrow 09:00
Change the market canopy reminder to Pack the orange guy ropes.|Market canopy|update_schedule|text:Pack the orange guy ropes|tomorrow 09:00
''')
    add('train','manage_reminder','one-off-boat-club-maintenance','''
Move the anchor-chain inspection to Monday at 11:45am.|Inspect anchor chain|update_schedule|weekday 1 11:45|tomorrow 09:00
Pause the nudge to order the bilge filter.|Order bilge filter|pause_schedule|-|tomorrow 09:00
Snooze the marina office call for 26 minutes.|Call marina office|snooze_schedule|26|tomorrow 09:00
Cancel the reminder to return the launch key.|Return launch key|cancel_schedule|-|tomorrow 09:00
Change the safety kit reminder to Replace the expired flares.|Safety kit|update_schedule|text:Replace the expired flares|tomorrow 09:00
''')
    add('train','manage_reminder','one-off-photo-lab-pickups','''
Move the contact sheet pickup to Thursday at 5:35pm.|Collect contact sheets|update_schedule|weekday 4 17:35|tomorrow 09:00
Pause the note about dropping off the damaged lens cap.|Drop off damaged lens cap|pause_schedule|-|tomorrow 09:00
Snooze the print lab call for 31 minutes.|Call print lab|snooze_schedule|31|tomorrow 09:00
Cancel my reminder to bring the archive sleeve.|Bring archive sleeve|cancel_schedule|-|tomorrow 09:00
Change the camera rental reminder to Pack the release form.|Camera rental|update_schedule|text:Pack the release form|tomorrow 09:00
''')
    add('train','manage_reminder','one-off-community-fridge-shifts','''
Move the fridge thermometer collection to Friday at 8:55am.|Collect fridge thermometer|update_schedule|weekday 5 08:55|tomorrow 09:00
Pause my reminder to wash the donation crates.|Wash donation crates|pause_schedule|-|tomorrow 09:00
Snooze the delivery driver call for 21 minutes.|Call delivery driver|snooze_schedule|21|tomorrow 09:00
Cancel the note to bring the spare shelf clips.|Bring spare shelf clips|cancel_schedule|-|tomorrow 09:00
Change the fridge check reminder to Photograph the temperature display.|Fridge check|update_schedule|text:Photograph the temperature display|tomorrow 09:00
''')
    add('train','manage_reminder','one-off-heritage-house-appointments','''
Move the locksmith visit to Wednesday at 9:50am.|Meet heritage-house locksmith|update_schedule|weekday 3 09:50|tomorrow 09:00
Pause the reminder about collecting the brass rubbing paper.|Collect brass rubbing paper|pause_schedule|-|tomorrow 09:00
Snooze the curator call for 13 minutes.|Call the curator|snooze_schedule|13|tomorrow 09:00
Cancel my note to return the west wing key.|Return west wing key|cancel_schedule|-|tomorrow 09:00
Change the tour sign reminder to Put the sign by the garden gate.|Tour sign|update_schedule|text:Put the sign by the garden gate|tomorrow 09:00
''')
    add('train','manage_reminder','one-off-kayak-rental-return','''
Move the paddle return reminder to Sunday at 5:25pm.|Return rented paddles|update_schedule|weekday 7 17:25|tomorrow 09:00
Pause the nudge to check the kayak hull.|Check kayak hull|pause_schedule|-|tomorrow 09:00
Snooze the river permit office call for 29 minutes.|Call river permit office|snooze_schedule|29|tomorrow 09:00
Cancel the reminder to rinse the spray skirt.|Rinse spray skirt|cancel_schedule|-|tomorrow 09:00
Update the rental desk reminder to Bring the dry-bag deposit slip.|Rental desk|update_schedule|text:Bring the dry-bag deposit slip|tomorrow 09:00
''')

    # Questions that mention reminders, dates, or times without asking for a write.
    add('train','plain_question','passive-cafe-reminder-questions','''
What time was the reminder for collecting the coffee grinder?
Did I already have a nudge about the tea delivery?
How often did the reminder for cleaning the espresso tray repeat?
''')
    add('train','plain_question','passive-museum-reminder-questions','''
Was the gallery key reminder set for this morning or tomorrow?
Which time did I save for the sculpture tour reminder?
Had I paused the nudge about returning the audio receiver?
''')
    add('train','plain_question','passive-school-reminder-questions','''
What did my reminder say about bringing the science folder?
Was there a school trip reminder for next Wednesday already?
How often did I set the parent portal reminder to repeat?
''')
    add('train','plain_question','passive-workshop-reminder-questions','''
When was I meant to check the soldering station reminder?
Did the tool cabinet reminder repeat every Friday?
What wording did I use for the reminder about the calipers?
''')
    add('train','plain_question','passive-orchard-reminder-questions','''
Was there a reminder to cover the seedling bench last night?
What time did I put down for the apple crate pickup?
How often did my orchard scale reminder recur?
''')
    add('train','plain_question','passive-library-reminder-questions','''
Did I have a reminder to return the atlas this week?
What time did I choose for the reading room reminder?
Was the archive box nudge still active yesterday?
''')
    add('train','plain_question','passive-travel-reminder-questions','''
Which day was the reminder about downloading the route map?
Was there already a nudge to pack the dry bags?
How often did I schedule the passport reminder?
''')
    add('train','plain_question','passive-home-reminder-questions','''
What time was my reminder to water the window boxes?
Did I have a monthly reminder to read the boiler meter?
Was the porch cushion reminder for 8pm or 9pm?
''')
    add('train','plain_question','passive-music-reminder-questions','''
Had I set a reminder to bring the second violin part?
What time did the rehearsal key reminder use?
Did my music stand reminder happen every Saturday?
''')
    add('train','plain_question','passive-volunteer-reminder-questions','''
Was the food-bank crate reminder set for Thursday?
What did I write in the note about the shelter van keys?
Did the cleanup rota reminder have a time attached?
''')

    # Pending drafts: complete the saved message when time arrives, and combine a
    # supplied subject with a time already in the draft. Some replies remain vague.
    add('train','answer_follow_up','school-play-draft-completions','''
Tomorrow at 5:40pm.|Remind me to return the costume box.|When should I remind you?|Return the costume box|tomorrow 17:40
Saturday at 8:15am please.|Could you remind me to bring the prop keys?|What time should I use?|Bring the prop keys|weekday 6 08:15
At 6:25 tonight.|I need a reminder to email the stage manager.|When would you like that reminder?|Email the stage manager|today 18:25
''')
    add('train','answer_follow_up','school-play-draft-completions','''
Collect the painted backdrop.|Remind me tomorrow at 3:35pm.|What should I remind you about?|Collect the painted backdrop|tomorrow 15:35
Bring the gold thread.|Set a reminder for Friday at 11:10am.|What should the reminder say?|Bring the gold thread|weekday 5 11:10
Sometime after lunch.|Remind me to pack the headpieces.|When should I remind you?|Pack the headpieces|What time after lunch should I use?
''',mode='still')
    add('train','answer_follow_up','allotment-draft-completions','''
In 35 minutes.|Remind me to close the potting shed.|When should I remind you?|Close the potting shed|+ 35
Monday at 7:25am.|Can you remind me to collect the seed order?|What date and time should I use?|Collect the seed order|weekday 1 07:25
On the 12th at 4:50pm.|Please nudge me to take the compost bin out.|When would you like the reminder?|Take the compost bin out|date 12 16:50
''')
    add('train','answer_follow_up','allotment-draft-completions','''
Bring the dibber and gloves.|Remind me on Sunday at 9:20am.|What should I remind you about?|Bring the dibber and gloves|weekday 7 09:20
Ask Rafi about the bean poles.|Set something for tomorrow at 6:40pm.|What should the reminder say?|Ask Rafi about the bean poles|tomorrow 18:40
This weekend.|Remind me to label the herb trays.|When should I remind you?|Label the herb trays|Which day and time this weekend?
''',mode='still')
    add('train','answer_follow_up','ceramics-class-draft-completions','''
Thursday at 8:35pm.|Remind me to wrap the glazed plates.|When should I remind you?|Wrap the glazed plates|weekday 4 20:35
Tomorrow at noon.|Could you nudge me to bring the trimming tools?|What time should I use?|Bring the trimming tools|tomorrow 12:00
In 55 minutes.|I need a reminder to photograph the blue test tile.|When would you like that reminder?|Photograph the blue test tile|+ 55
''')
    add('train','answer_follow_up','ceramics-class-draft-completions','''
Clean the rib tools.|Remind me this evening at 7:15.|What should I remind you about?|Clean the rib tools|today 19:15
Pick up the porcelain.|Set a nudge for Friday at 3:45pm.|What should the reminder say?|Pick up the porcelain|weekday 5 15:45
Later tonight.|Remind me to wash the glaze buckets.|When should I remind you?|Wash the glaze buckets|What time later tonight?
''',mode='still')
    add('train','answer_follow_up','rail-journey-draft-completions','''
At 6:10am tomorrow.|Remind me to print the platform change notice.|When should I remind you?|Print the platform change notice|tomorrow 06:10
Sunday at 4:20pm.|Please remind me to pack the paper tickets.|What date and time should I use?|Pack the paper tickets|weekday 7 16:20
In 90 minutes.|Could you nudge me to download the station map?|When would you like the reminder?|Download the station map|+ 90
''')
    add('train','answer_follow_up','rail-journey-draft-completions','''
Bring the neck pillow.|Remind me tomorrow at 9:15pm.|What should I remind you about?|Bring the neck pillow|tomorrow 21:15
Call the guesthouse about late arrival.|Set a reminder for Wednesday at 11:40am.|What should the reminder say?|Call the guesthouse about late arrival|weekday 3 11:40
After I get home.|Remind me to return the locker token.|When should I remind you?|Return the locker token|What date and time after you get home?
''',mode='still')
    add('train','answer_follow_up','community-radio-draft-completions','''
At 7:05pm tonight.|Remind me to save the interview recording.|When should I remind you?|Save the interview recording|today 19:05
Tuesday at 10:50am.|Could you nudge me to send the guest a thank-you note?|What time should I use?|Send the guest a thank-you note|weekday 2 10:50
In 48 minutes.|Please remind me to test the spare headphones.|When would you like that reminder?|Test the spare headphones|+ 48
''')
    add('train','answer_follow_up','community-radio-draft-completions','''
Label the studio B cables.|Remind me on Thursday at 5:35pm.|What should I remind you about?|Label the studio B cables|weekday 4 17:35
Email Suman the running order.|Set something for tomorrow at 1:25pm.|What should the reminder say?|Email Suman the running order|tomorrow 13:25
Some time before the show.|Remind me to put fresh batteries in the recorder.|When should I remind you?|Put fresh batteries in the recorder|What date and time before the show?
''',mode='still')
    add('train','answer_follow_up','bike-repair-draft-completions','''
Friday at 2:55pm.|Remind me to collect the new brake pads.|When should I remind you?|Collect the new brake pads|weekday 5 14:55
In 24 minutes.|Please nudge me to photograph the frame number.|What date and time should I use?|Photograph the frame number|+ 24
Tomorrow at 8:05am.|I need a reminder to pack the wheel lock.|When would you like the reminder?|Pack the wheel lock|tomorrow 08:05
''')
    add('train','answer_follow_up','bike-repair-draft-completions','''
Bring the blue repair stand.|Remind me Saturday at 4:10pm.|What should I remind you about?|Bring the blue repair stand|weekday 6 16:10
Ask the mechanic about the chain skip.|Set a nudge for tomorrow at 9:45am.|What should the reminder say?|Ask the mechanic about the chain skip|tomorrow 09:45
This afternoon.|Remind me to return the borrowed helmet.|When should I remind you?|Return the borrowed helmet|What time this afternoon?
''',mode='still')
    add('train','answer_follow_up','family-recipe-draft-completions','''
At 8:25pm tonight.|Remind me to scan Nani's recipe card.|When should I remind you?|Scan Nani's recipe card|today 20:25
On the 16th at 9:35am.|Could you remind me to ask Dev for the chutney notes?|What date and time should I use?|Ask Dev for the chutney notes|date 16 09:35
In 72 minutes.|I need a nudge to buy more card sleeves.|When would you like the reminder?|Buy more card sleeves|+ 72
''')
    add('train','answer_follow_up','family-recipe-draft-completions','''
Photograph the spice tins.|Remind me tomorrow at 5:55pm.|What should I remind you about?|Photograph the spice tins|tomorrow 17:55
Bring the old notebook to Leena.|Set a reminder for Tuesday at 7:15am.|What should the reminder say?|Bring the old notebook to Leena|weekday 2 07:15
Later this week.|Remind me to print the family menu.|When should I remind you?|Print the family menu|Which day and time later this week?
''',mode='still')
    add('train','answer_follow_up','volunteer-kitchen-draft-completions','''
At 6:35pm Friday.|Remind me to bring the insulated soup tubs.|When should I remind you?|Bring the insulated soup tubs|weekday 5 18:35
In 105 minutes.|Could you nudge me to call the delivery driver?|What date and time should I use?|Call the delivery driver|+ 105
Tomorrow at 7:50am.|I need a reminder to unlock the pantry door.|When would you like that reminder?|Unlock the pantry door|tomorrow 07:50
''')
    add('train','answer_follow_up','volunteer-kitchen-draft-completions','''
Restock the paper napkins.|Remind me Sunday at 4:25pm.|What should I remind you about?|Restock the paper napkins|weekday 7 16:25
Ask Amina about the allergy list.|Set a reminder for the 21st at 10:15am.|What should the reminder say?|Ask Amina about the allergy list|date 21 10:15
Whenever the van is back.|Remind me to return the soup ladles.|When should I remind you?|Return the soup ladles|What date and time will the van be back?
''',mode='still')
    add('train','answer_follow_up','school-office-draft-completions','''
Wednesday at 4:15pm.|Remind me to sign the library permission form.|When should I remind you?|Sign the library permission form|weekday 3 16:15
Tomorrow at 7:35am.|Could you nudge me to pack the sports shoes?|What date and time should I use?|Pack the sports shoes|tomorrow 07:35
In 29 minutes.|Please remind me to reply to the class coordinator.|When would you like that reminder?|Reply to the class coordinator|+ 29
''')
    add('train','answer_follow_up','school-office-draft-completions','''
Bring the signed blue form.|Remind me on Friday at 9:25am.|What should I remind you about?|Bring the signed blue form|weekday 5 09:25
Collect Noor's art portfolio.|Set something for tomorrow at 4:40pm.|What should the reminder say?|Collect Noor's art portfolio|tomorrow 16:40
Next week sometime.|Remind me to ask about the bus pass.|When should I remind you?|Ask about the bus pass|What day and time next week?
''',mode='still')
    add('train','answer_follow_up','orchard-harvest-draft-completions','''
At 5:20pm tomorrow.|Remind me to bring the empty pear crates.|When should I remind you?|Bring the empty pear crates|tomorrow 17:20
In 43 minutes.|Could you nudge me to check the cider press hose?|What time should I use?|Check the cider press hose|+ 43
Saturday at 8:55am.|I need a reminder to call the fruit buyer.|When would you like the reminder?|Call the fruit buyer|weekday 6 08:55
''')
    add('train','answer_follow_up','orchard-harvest-draft-completions','''
Label the green apple boxes.|Remind me Sunday at 6:45pm.|What should I remind you about?|Label the green apple boxes|weekday 7 18:45
Ask Paolo about the ladder.|Set a nudge for Thursday at 10:05am.|What should the reminder say?|Ask Paolo about the ladder|weekday 4 10:05
When I'm at the packing shed.|Remind me to take the harvest log home.|When should I remind you?|Take the harvest log home|What date and time will you be at the packing shed?
''',mode='still')
    add('train','answer_follow_up','ceramic-tile-draft-completions','''
Tuesday at 2:25pm.|Remind me to pick up the grout samples.|When should I remind you?|Pick up the grout samples|weekday 2 14:25
Tomorrow at 9:55am.|Please remind me to ask the installer about the trim.|What date and time should I use?|Ask the installer about the trim|tomorrow 09:55
In 81 minutes.|Could you nudge me to cover the mortar bucket?|When would you like that reminder?|Cover the mortar bucket|+ 81
''')
    add('train','answer_follow_up','ceramic-tile-draft-completions','''
Bring the spacer wedges.|Remind me Friday at 6:15pm.|What should I remind you about?|Bring the spacer wedges|weekday 5 18:15
Photograph the finished niche.|Set a reminder for Saturday at 1:35pm.|What should the reminder say?|Photograph the finished niche|weekday 6 13:35
Before the next delivery.|Remind me to move the tile boxes inside.|When should I remind you?|Move the tile boxes inside|What date and time is the next delivery?
''',mode='still')
    add('train','answer_follow_up','apartment-repair-draft-completions','''
Tomorrow at 10:35am.|Remind me to email the maintenance photos.|When should I remind you?|Email the maintenance photos|tomorrow 10:35
At 7:20pm tonight.|Can you remind me to ask about the balcony latch?|What time should I use?|Ask about the balcony latch|today 19:20
In 37 minutes.|Please nudge me to move the hallway boxes.|When would you like that reminder?|Move the hallway boxes|+ 37
Send the plumber the tap measurements.|Remind me on Thursday at 3:10pm.|What should I remind you about?|Send the plumber the tap measurements|weekday 4 15:10
Buy felt pads for the chair legs.|Set a reminder tomorrow at 8:45am.|What should the reminder say?|Buy felt pads for the chair legs|tomorrow 08:45
After the inspection.|Remind me to ask about the window seal.|When should I remind you?|Ask about the window seal|What date and time is the inspection?
''',mode='still')
    add('train','answer_follow_up','mountain-hike-draft-completions','''
At 5:10am Saturday.|Remind me to fill the thermos.|When should I remind you?|Fill the thermos|weekday 6 05:10
Tomorrow at 6:35pm.|Could you nudge me to download the contour map?|What time should I use?|Download the contour map|tomorrow 18:35
In 57 minutes.|Please remind me to check the headlamp batteries.|When would you like the reminder?|Check the headlamp batteries|+ 57
Pack the dry socks.|Remind me Sunday at 4:05pm.|What should I remind you about?|Pack the dry socks|weekday 7 16:05
Call the trail hut about beds.|Set something for Friday at 11:25am.|What should the reminder say?|Call the trail hut about beds|weekday 5 11:25
When we get to the car park.|Remind me to return the trekking poles.|When should I remind you?|Return the trekking poles|What time will you get to the car park?
''',mode='still')
    add('train','answer_follow_up','community-orchestra-draft-completions','''
Thursday at 6:50pm.|Remind me to bring the marked cello part.|When should I remind you?|Bring the marked cello part|weekday 4 18:50
At 9:15am tomorrow.|Please remind me to loosen the bass clarinet reed.|What time should I use?|Loosen the bass clarinet reed|tomorrow 09:15
In 68 minutes.|Could you nudge me to email the new concert order?|When would you like that reminder?|Email the new concert order|+ 68
Collect Bhavna's mute.|Remind me Tuesday at 7:40pm.|What should I remind you about?|Collect Bhavna's mute|weekday 2 19:40
Print the revised seating chart.|Set a reminder for the 10th at 5:15pm.|What should the reminder say?|Print the revised seating chart|date 10 17:15
Sometime before rehearsal.|Remind me to charge the stage tuner.|When should I remind you?|Charge the stage tuner|What time before rehearsal?
''',mode='still')
    add('train','answer_follow_up','independent-bookshop-draft-completions','''
Tomorrow at 8:25am.|Remind me to unlock the side display case.|When should I remind you?|Unlock the side display case|tomorrow 08:25
Friday at 4:55pm.|Could you remind me to send the publisher the returns count?|What time should I use?|Send the publisher the returns count|weekday 5 16:55
In 32 minutes.|Please nudge me to print the event bookmarks.|When would you like the reminder?|Print the event bookmarks|+ 32
Put out the poetry table signs.|Remind me Sunday at 10:40am.|What should I remind you about?|Put out the poetry table signs|weekday 7 10:40
Ask Tess about the signed editions.|Set something for tomorrow at noon.|What should the reminder say?|Ask Tess about the signed editions|tomorrow 12:00
Next time I open the shop.|Remind me to reorder the window cards.|When should I remind you?|Reorder the window cards|What date and time will you open the shop?
''',mode='still')
    add('train','answer_follow_up','sailing-club-draft-completions','''
Saturday at 6:20am.|Remind me to check the bilge pump.|When should I remind you?|Check the bilge pump|weekday 6 06:20
At 5:45pm tomorrow.|Please nudge me to leave the tide book in the locker.|What time should I use?|Leave the tide book in the locker|tomorrow 17:45
In 92 minutes.|Could you remind me to phone the marina office?|When would you like that reminder?|Phone the marina office|+ 92
Bring the orange safety buoy.|Remind me Friday at 2:15pm.|What should I remind you about?|Bring the orange safety buoy|weekday 5 14:15
Return the club pennant to Mei.|Set a reminder for the 18th at 9:50am.|What should the reminder say?|Return the club pennant to Mei|date 18 09:50
After the boat is washed.|Remind me to put the canvas cover away.|When should I remind you?|Put the canvas cover away|What date and time will the boat be washed?
''',mode='still')
    add('train','answer_follow_up','film-club-draft-completions','''
At 7:55pm tomorrow.|Remind me to test the subtitle projector.|When should I remind you?|Test the subtitle projector|tomorrow 19:55
Sunday at 2:45pm.|Could you remind me to bring the discussion cards?|What time should I use?|Bring the discussion cards|weekday 7 14:45
In 53 minutes.|Please nudge me to send the screening link to Uma.|When would you like that reminder?|Send the screening link to Uma|+ 53
Collect the borrowed film reels.|Remind me Wednesday at 5:35pm.|What should I remind you about?|Collect the borrowed film reels|weekday 3 17:35
Print the programme for the silent film night.|Set a reminder for Saturday at 9:10am.|What should the reminder say?|Print the programme for the silent film night|weekday 6 09:10
Once the room is booked.|Remind me to tell the members the start time.|When should I remind you?|Tell the members the start time|What date and time will the room be booked?
''',mode='still')
    add('train','answer_follow_up','community-fridge-draft-completions','''
Tomorrow at 6:15am.|Remind me to read the fridge temperature log.|When should I remind you?|Read the fridge temperature log|tomorrow 06:15
At 4:30pm Friday.|Please nudge me to label the donated soup jars.|What time should I use?|Label the donated soup jars|weekday 5 16:30
In 46 minutes.|Could you remind me to call the produce supplier?|When would you like that reminder?|Call the produce supplier|+ 46
Restock the allergy cards.|Remind me Sunday at 1:55pm.|What should I remind you about?|Restock the allergy cards|weekday 7 13:55
Bring the spare shelf clips.|Set a nudge for Tuesday at 8:50am.|What should the reminder say?|Bring the spare shelf clips|weekday 2 08:50
At the next delivery.|Remind me to check the crate count.|When should I remind you?|Check the crate count|What date and time is the next delivery?
''',mode='still')
    add('train','answer_follow_up','archive-reading-room-draft-completions','''
Thursday at 10:25am.|Remind me to return the map gloves.|When should I remind you?|Return the map gloves|weekday 4 10:25
Tomorrow at 7:40pm.|Could you nudge me to scan the railway ledger?|What time should I use?|Scan the railway ledger|tomorrow 19:40
In 34 minutes.|Please remind me to put the atlas in its box.|When would you like the reminder?|Put the atlas in its box|+ 34
Ask the archivist about the missing index.|Remind me on Monday at 3:15pm.|What should I remind you about?|Ask the archivist about the missing index|weekday 1 15:15
Collect the acid-free folders.|Set something for Friday at 9:05am.|What should the reminder say?|Collect the acid-free folders|weekday 5 09:05
Next time I visit the reading room.|Remind me to bring the cotton gloves.|When should I remind you?|Bring the cotton gloves|What date and time will you visit?
''',mode='still')
    add('train','answer_follow_up','dog-sitter-draft-completions','''
At 8:20am tomorrow.|Remind me to leave Poppy's medicine with the sitter.|When should I remind you?|Leave Poppy's medicine with the sitter|tomorrow 08:20
Friday at 6:45pm.|Please nudge me to pack the orange lead.|What time should I use?|Pack the orange lead|weekday 5 18:45
In 27 minutes.|Could you remind me to text the vet's number to Anu?|When would you like the reminder?|Text the vet's number to Anu|+ 27
Wash the travel bowl.|Remind me Sunday at 7:35pm.|What should I remind you about?|Wash the travel bowl|weekday 7 19:35
Pick up the spare key from Kavi.|Set a reminder for tomorrow at 11:55am.|What should the reminder say?|Pick up the spare key from Kavi|tomorrow 11:55
After the walk.|Remind me to refill Poppy's water bottle.|When should I remind you?|Refill Poppy's water bottle|What time after the walk?
''',mode='still')
    add('train','answer_follow_up','piano-lesson-draft-completions','''
Tomorrow at 3:05pm.|Remind me to bring the pedal extender.|When should I remind you?|Bring the pedal extender|tomorrow 15:05
At 7:25pm Thursday.|Could you remind me to record the left-hand exercise?|What time should I use?|Record the left-hand exercise|weekday 4 19:25
In 66 minutes.|Please nudge me to ask the teacher about the recital piece.|When would you like that reminder?|Ask the teacher about the recital piece|+ 66
Photograph the marked score.|Remind me Saturday at 10:15am.|What should I remind you about?|Photograph the marked score|weekday 6 10:15
Collect the piano bench risers.|Set a reminder on the 22nd at 5:45pm.|What should the reminder say?|Collect the piano bench risers|date 22 17:45
Before the next lesson.|Remind me to pack the metronome batteries.|When should I remind you?|Pack the metronome batteries|Which day and time is the next lesson?
''',mode='still')
    add('train','answer_follow_up','heritage-house-tour-draft-completions','''
At 9:35am tomorrow.|Remind me to open the east parlour shutters.|When should I remind you?|Open the east parlour shutters|tomorrow 09:35
Sunday at 5:15pm.|Please remind me to return the brass key to Indu.|What time should I use?|Return the brass key to Indu|weekday 7 17:15
In 56 minutes.|Could you nudge me to print the large-type route map?|When would you like that reminder?|Print the large-type route map|+ 56
Refill the visitor badge tray.|Remind me Tuesday at 11:45am.|What should I remind you about?|Refill the visitor badge tray|weekday 2 11:45
Ask Rafi about the garden gate.|Set something for tomorrow at 6:05pm.|What should the reminder say?|Ask Rafi about the garden gate|tomorrow 18:05
After the school group leaves.|Remind me to put the rope barrier away.|When should I remind you?|Put the rope barrier away|What date and time will the group leave?
''',mode='still')
    add('train','answer_follow_up','river-cleanup-draft-completions','''
Saturday at 7:15am.|Remind me to bring the water-safety flags.|When should I remind you?|Bring the water-safety flags|weekday 6 07:15
At 5:50pm tomorrow.|Could you remind me to charge the handheld GPS?|What time should I use?|Charge the handheld GPS|tomorrow 17:50
In 39 minutes.|Please nudge me to ask Jo about the boat launch.|When would you like that reminder?|Ask Jo about the boat launch|+ 39
Return the grabber poles to the shed.|Remind me on Friday at 4:05pm.|What should I remind you about?|Return the grabber poles to the shed|weekday 5 16:05
Print the cleanup sign-in sheet.|Set a reminder for Sunday at 9:45am.|What should the reminder say?|Print the cleanup sign-in sheet|weekday 7 09:45
Once the tide turns.|Remind me to move the supply bags off the bank.|When should I remind you?|Move the supply bags off the bank|What date and time will the tide turn?
''',mode='still')
    add('train','answer_follow_up','mountain-bike-race-draft-completions','''
At 5:40am Sunday.|Remind me to attach the timing chip.|When should I remind you?|Attach the timing chip|weekday 7 05:40
Tomorrow at 8:10pm.|Could you nudge me to lay out the race jersey?|What time should I use?|Lay out the race jersey|tomorrow 20:10
In 44 minutes.|Please remind me to check the tyre sealant.|When would you like that reminder?|Check the tyre sealant|+ 44
Pack the repair plugs.|Remind me Saturday at 1:20pm.|What should I remind you about?|Pack the repair plugs|weekday 6 13:20
Ask the marshal where the neutral zone begins.|Set a reminder for Friday at 6:05pm.|What should the reminder say?|Ask the marshal where the neutral zone begins|weekday 5 18:05
Before I leave home.|Remind me to fill the frame bottle.|When should I remind you?|Fill the frame bottle|What date and time will you leave home?
''',mode='still')
    add('train','answer_follow_up','independent-bakery-draft-completions','''
At 5:30am tomorrow.|Remind me to start the sesame dough.|When should I remind you?|Start the sesame dough|tomorrow 05:30
Friday at 6:55pm.|Could you remind me to order the rye flour?|What time should I use?|Order the rye flour|weekday 5 18:55
In 63 minutes.|Please nudge me to put the butter in the cooler.|When would you like that reminder?|Put the butter in the cooler|+ 63
Collect the paper loaf bags.|Remind me Wednesday at 2:35pm.|What should I remind you about?|Collect the paper loaf bags|weekday 3 14:35
Ask Saira how many pastry boxes arrived.|Set a reminder for the 9th at 11:15am.|What should the reminder say?|Ask Saira how many pastry boxes arrived|date 9 11:15
Before the next bake.|Remind me to clean the proving basket.|When should I remind you?|Clean the proving basket|What day and time is the next bake?
''',mode='still')

    # Direct contrast pairs for a one-off Saturday request, a weekly Saturday request,
    # and choosing among two gym reminders versus pausing one exact gym reminder.
    add('train','new_reminder_once','multiple-gym-and-saturday-recurrence-contrasts','''
Please remind me this Saturday at 10:15am to bring the donation tins to the market.|Bring the donation tins to the market|weekday 6 10:15
''')
    add('train','new_reminder_repeating','multiple-gym-and-saturday-recurrence-contrasts','''
Every Saturday at 10:15am, remind me to bring the donation tins to the market.|Bring the donation tins to the market|daily 10:15 6
''')
    add('train','manage_reminder','multiple-gym-and-saturday-recurrence-contrasts','''
Pause my gym reminder.|Gym|pause_schedule|-|tomorrow 09:00
''')

    # Broaden background distractors on new rows only. Existing source rows and their
    # contexts remain byte-for-byte stable; target and explicit choice schedules stay intact.
    background_titles = [
        'Sharpen pruning shears', 'Replace range hood filter', 'Check roof drain',
        'Clean audio interface', 'Read the water meter', 'Rotate archive backup',
        'Feed courtyard pigeons', 'Polish brass lamp', 'Wash picnic blanket',
        'Inspect smoke detector', 'Repack first-aid pouch', 'Charge trail beacon',
        'Submit parking permit', 'Dust ceiling fan', 'Check bicycle bell',
        'Fold market canopy', 'Refill fountain pen', 'Clean rain gutters',
        'Sort old photo negatives', 'Test hallway doorbell', 'Water the aloe pot',
        'Oil the gate hinges', 'Return borrowed folding chair', 'Check pantry thermometer',
        'Replace sewing machine needle', 'Wash the reusable filters', 'Photograph meter reading',
        'Back up field recordings', 'Clean the umbrella stand', 'Inspect window latches',
        'Rehang the noticeboard map', 'Charge the label printer', 'Check the spare torch',
        'Pack the picnic cutlery', 'Read the boiler gauge', 'Clean the bicycle bell',
        'Print the emergency contacts', 'Refill the birdbath', 'Sort the seed packets',
        'Return the borrowed tripod', 'Check the pantry scale', 'Polish the brass handles',
        'Replace the porch bulb', 'Wash the paint brushes', 'Update the guest Wi-Fi card',
        'Inspect the first aid pouch', 'Clean the desk lamp', 'Charge the handheld radio',
        'Put away the garden twine', 'Check the freezer seal', 'Back up the voice memos',
        'Sort the repair receipts', 'Clean the rain boots', 'Test the spare charger',
        'File the building notice', 'Check the lunch thermos', 'Wash the window cloths',
        'Sharpen the kitchen scissors', 'Inspect the bike pump', 'Return the library atlas',
    ]
    extra_people = [
        ('Maya','Maia'), ('Mira','Meera'), ('Ishan','Ishaan'), ('Rina','Reena'),
        ('Asha','Aisha'), ('Nila','Neela'), ('Kiran','Kieran'), ('Rohan','Rohit'),
        ('Anya','Anika'), ('Dev','Deven'), ('Naveen','Naveen Rao'), ('Sara','Sarah'),
        ('Mei Chen','Mei Cheng'), ('Jon Lee','John Lee'), ('Arjun Mehta','Arjun Malhotra'),
        ('Priya Nair','Priya Nayar'), ('Sam Ortiz','Sam Ortez'), ('Leena','Lina'),
        ('Tara','Tara Sen'), ('Omar','Omer'), ('Noor','Nour'), ('Jaya','Jaiya'),
    ]
    extra_attributes = ['company','work email','phone','birthday','office location','role',
                        'preferred name','emergency contact','pronouns','shop name','home address']
    import random
    for row in rows[start:]:
        rng = random.Random('expansion-context-' + row['id'])
        situation = row['situation']
        message_words = set(row['message'].lower().split())
        target_words = set(row['expected'].get('message', row['expected'].get('title', '')).lower().split())
        pool = [title for title in background_titles
                if not (set(title.lower().split()) & (message_words | target_words))]
        bg = [s for s in situation['schedules'] if s['id'].startswith('s-bg-')]
        for sched, title in zip(bg, rng.sample(pool, min(len(bg), len(pool)))):
            sched['title'] = title
        if row['kind'] == 'save_fact':
            target = {'subject': row['expected']['subject'], 'attribute': row['expected']['attribute']}
            inventory = [target] if row['expected']['action'] == 'update_fact' else []
            candidates = [dict(subject=person, attribute=attr)
                          for a, b in extra_people for person in (a, b) for attr in extra_attributes]
            candidates = [fact for fact in candidates if fact != target]
            situation['facts'] = inventory + rng.sample(candidates, min(5 - len(inventory), len(candidates)))
        else:
            people = [dict(subject=person, attribute=attr)
                      for a, b in extra_people for person in (a, b) for attr in extra_attributes]
            situation['facts'] = rng.sample(people, min(len(situation['facts']), len(people)))


