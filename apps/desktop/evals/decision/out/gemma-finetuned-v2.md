Routing baseline: mlx-community/gemma-4-e4b-it-4bit + adapter /Users/abhinavvashisht/workspace/cortex/evals/routing/adapters/gemma-4-e4b-it-4bit-v2 (short prompt) on /Users/abhinavvashisht/workspace/cortex/evals/routing/test.jsonl
Correct: 79% (237/300)
Right action chosen (ignoring details): 83% (248/300)
Wrong writes (must be 0): 15
Invalid or failed outputs: 0
Latency p50/p90: 1746 / 2447 ms

Per kind:
  new_reminder_once        33% (18/54)
  new_reminder_repeating   77% (23/30)
  new_task                 100% (12/12)
  manage_reminder          90% (38/42)
  list_reminders           100% (9/9)
  save_fact                97% (29/30)
  follow_up                83% (40/48)
  answer_follow_up         76% (16/21)
  plain_question           96% (52/54)

Wrong writes:
  r-0152 "Remind me once, 2.5 hours from now, about confirming the eye test." -> schedule_create {"action":"create_reminder","message":"Confirm the eye test","timing":{"local_at":"2028-02-29T02:33","type":"once"}}
  r-0159 "Add a Saturday 10:20am reminder about collecting the donation boxes." -> schedule_create {"action":"create_reminder","message":"Collect the donation boxes","timing":{"time":"10:20","type":"daily","weekdays":[6]}}
  r-0165 "The raffle books need counting; add that as a Monday 11:15am reminder." -> schedule_create {"action":"create_reminder","message":"Count the raffle books","timing":{"time":"11:15","type":"daily","weekdays":[1]}}
  r-0258 "A reminder to check the foster kitten every 40 minutes, only 8am through 10pm." -> schedule_create {"action":"create_reminder","message":"Check the foster kitten","timing":{"every_minutes":40,"start_local":"2027-03-31T08:00","type":"interval"}}
  r-0266 "Between 6am and noon every 90 minutes, I want reminding to mist the cuttings." -> schedule_create {"action":"create_reminder","message":"Mist the cuttings","timing":{"every_minutes":90,"start_local":"2027-09-12T06:00","type":"interval"}}
  r-0274 "Each month's closing day at noon, prompt me to check the pantry dates." -> schedule_create {"action":"create_task","prompt":"Check the pantry dates","requires_live_sources":false,"timing":{"day":-1,"time":"12:00","type":"monthly"}}
  r-0279 "Could you schedule checking the spare bulbs every month on the 9th at 6:15pm?" -> schedule_create {"action":"create_task","prompt":"Check the spare bulbs","requires_live_sources":false,"timing":{"day":9,"time":"18:15","type":"monthly"}}
  r-0708 "Make an ongoing weekday nudge for checking the grocery list." -> schedule_create {"action":"create_reminder","message":"Check the grocery list","timing":{"time":"09:00","type":"daily","weekdays":[1,2,3,4,5]}}
  r-0721 "For each Monday 8:45pm, add a reminder." -> schedule_create {"action":"create_reminder","message":"Add a reminder","timing":{"time":"20:45","type":"daily","weekdays":[1]}}
  r-0727 "Could you disable the club payment reminder by pausing it?" -> pause {"action":"pause_schedule","schedule_id":"sch_a936b307"}
  r-0728 "I want the session booking reminder deleted." -> cancel {"action":"cancel_schedule","schedule_id":"sch_e64cda03"}
  r-0730 "The rehearsal reminder needs moving to Friday 7pm." -> schedule_update {"action":"update_schedule","schedule_id":"sch_bc8e6082","timing":{"time":"19:00","type":"daily"}}
  r-0731 "Turn the event ticket reminder back on." -> resume {"action":"resume_schedule","schedule_id":"sch_770e7c8a"}
  r-0734 "Put the newsletter reminder on hold, pause it." -> pause {"action":"pause_schedule","schedule_id":"sch_33ee3e20"}
  r-0741 "I'd like the washing machine installation reminder to say Bring the receipt." -> schedule_update {"action":"update_schedule","message":"Bring the receipt","schedule_id":"sch_f60d6601"}
