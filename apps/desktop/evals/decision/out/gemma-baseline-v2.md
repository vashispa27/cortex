Routing baseline: mlx-community/gemma-4-e4b-it-4bit on /Users/abhinavvashisht/workspace/cortex/evals/routing/test.jsonl
Correct: 43% (129/300)
Right action chosen (ignoring details): 57% (172/300)
Wrong writes (must be 0): 17
Invalid or failed outputs: 80
Latency p50/p90: 1689 / 3398 ms

Per kind:
  new_reminder_once        13% (7/54)
  new_reminder_repeating   63% (19/30)
  new_task                 33% (4/12)
  manage_reminder          21% (9/42)
  list_reminders           44% (4/9)
  save_fact                100% (30/30)
  follow_up                67% (32/48)
  answer_follow_up         10% (2/21)
  plain_question           41% (22/54)

Wrong writes:
  r-0159 "Add a Saturday 10:20am reminder about collecting the donation boxes." -> schedule_create {"action":"create_reminder","message":"Collecting the donation boxes","timing":{"type":"daily","time":"10:20","weekdays":[6]}}
  r-0165 "The raffle books need counting; add that as a Monday 11:15am reminder." -> schedule_create {"action":"create_reminder","message":"The raffle books need counting","timing":{"type":"daily","time":"11:15","weekdays":[1]}}
  r-0256 "I'd like the final evening of every month at 6:40pm to remind me to weigh the dog." -> schedule_create {"action":"create_reminder","message":"weigh the dog","timing":{"type":"monthly","day":31,"time":"18:40"}}
  r-0262 "For each Monday and Saturday at 5:30pm, add a reminder to turn the pots." -> schedule_create {"action":"create_reminder","message":"turn the pots","timing":{"type":"daily","time":"17:30","weekdays":[1,7]}}
  r-0264 "At month end every month, give me a 4:10pm nudge to photograph the garden." -> schedule_create {"action":"create_reminder","message":"photograph the garden","timing":{"type":"monthly","day":31,"time":"16:10"}}
  r-0274 "Each month's closing day at noon, prompt me to check the pantry dates." -> schedule_create {"action":"create_reminder","message":"Check the pantry dates","timing":{"type":"monthly","day":28,"time":"12:00"}}
  r-0315 "Make me a written review of the fiction drafts I opened, every Sunday 5pm." -> schedule_create {"action":"create_reminder","message":"written review of the fiction drafts I opened","timing":{"type":"daily","time":"17:00","weekdays":[1]}}
  r-0317 "At 7:20pm daily I'd like you to generate a recap of the recipes I looked at." -> schedule_create {"action":"create_reminder","message":"recap of the recipes I looked at","timing":{"type":"daily","time":"19:20"}}
  r-0320 "On Tuesdays at 9:30pm, produce a short review of my recent music practice notes." -> schedule_create {"action":"create_reminder","message":"produce a short review of my recent music practice notes","timing":{"local_at":"2028-03-07T21:30","type":"once"}}
  r-0719 "A 7:35am reminder tomorrow, please." -> schedule_create {"action":"create_reminder","message":"Reminder","timing":{"type":"once","local_at":"2027-03-01T07:35"}}
  r-0721 "For each Monday 8:45pm, add a reminder." -> schedule_create {"action":"create_reminder","message":"add a reminder","timing":{"type":"daily","time":"20:45","weekdays":[1]}}
  r-0727 "Could you disable the club payment reminder by pausing it?" -> pause {"action":"pause_schedule","schedule_id":"sch_a936b307"}
  r-0730 "The rehearsal reminder needs moving to Friday 7pm." -> schedule_update {"action":"update_schedule","schedule_id":"sch_bc8e6082","timing":{"type":"once","local_at":"2026-12-04T19:00"}}
  r-0731 "Turn the event ticket reminder back on." -> resume {"action":"resume_schedule","schedule_id":"sch_d990b003"}
  r-0734 "Put the newsletter reminder on hold, pause it." -> pause {"action":"pause_schedule","schedule_id":"sch_33ee3e20"}
  r-0737 "I need a 40-minute snooze for the chimney sweep reminder." -> schedule_snooze {"action":"snooze_schedule","minutes":40,"schedule_id":"sch_b6def79a"}
  r-0747 "can i have a reminder to sign that on the 19th at 9am" -> schedule_create {"action":"create_reminder","message":"sign that","timing":{"type":"once","local_at":"2027-03-19T09:00"}}
