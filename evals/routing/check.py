"""Deterministic data validation and transparent cross-split leakage checks.

No models or scores. Full findings and fixed-seed samples go to report.json.
Near-copy checks mask labelled entities, times, weekdays and reminder content,
then compare exact skeletons (including short ones), word overlap and token edit
similarity. They intentionally flag candidates for manual inspection.
"""
import json
import random
import re
import unicodedata
from collections import Counter
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from pathlib import Path

ROOT=Path(__file__).resolve().parent
SHARES={'new_reminder_once':18,'new_reminder_repeating':10,'new_task':4,'manage_reminder':14,'list_reminders':3,'save_fact':10,'follow_up':16,'answer_follow_up':7,'plain_question':18}
ACTIONS={'create_reminder','create_task','update_schedule','pause_schedule','resume_schedule','cancel_schedule','snooze_schedule','list_schedules','remember_fact','update_fact','clarify','answer'}
FIELDS={'action','title','message','prompt','requires_live_sources','timing','timezone','schedule_id','minutes','subject','attribute','value','question'}
TFIELDS={'type','local_at','time','day','every_minutes','start_local','window_start','window_end','weekdays'}
INTENTIONAL_CONTRAST_MESSAGES={'pause my gym reminder'}
EXPANSION={'follow_up':360,'answer_follow_up':150,'new_reminder_once':200,
          'new_reminder_repeating':120,'manage_reminder':100,'save_fact':80,
          'new_task':60,'plain_question':30}

def normalized(s):
    return ' '.join(re.findall(r'\w+',unicodedata.normalize('NFKC',s).lower()))

def skeleton(row):
    s=row['message'].lower()
    e=row['expected']
    entities=[e.get(k,'') for k in ('subject','value','message','prompt','title')]
    entities += [x['title'] for x in row['situation']['schedules']]
    entities += [x['subject'] for x in row['situation']['facts']]
    for entity in sorted(entities,key=len,reverse=True):
        if entity and entity!='self':
            s=re.sub(r'(?<!\w)'+re.escape(entity.lower())+r'(?!\w)',' ENTITY ',s)
    s=re.sub(r'\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b',' TIME ',s)
    s=re.sub(r'\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b',' DAY ',s)
    s=re.sub(r'\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|ninety|half|quarter)\b',' NUMBER ',s)
    s=re.sub(r'\b\d+(?::\d+)?(?:st|nd|rd|th)?\b',' NUMBER ',s)
    return normalized(s)

def validate(row):
    assert set(row)=={'id','kind','scenario','situation','message','expected'},row['id']
    assert row['kind'] in SHARES
    assert row['message'].strip() and row['scenario']
    s,e=row['situation'],row['expected']
    assert set(s)=={'now','weekday','timezone','schedules','facts','recent_turns','pending_draft'}
    now=datetime.fromisoformat(s['now'])
    assert now.strftime('%A')==s['weekday'] and now.utcoffset()==timedelta(hours=5,minutes=30)
    assert s['timezone']=='Asia/Kolkata' and 0<=len(s['schedules'])<=8
    for schedule in s['schedules']:
        assert set(schedule)=={'id','title','status','timing','timezone','next'}
        assert schedule['status'] in ('active','paused') and schedule['timezone']==s['timezone']
    for fact in s['facts']: assert set(fact)=={'subject','attribute'}
    assert len(s['recent_turns'])<=4
    for turn in s['recent_turns']:
        assert set(turn)=={'role','content'} and turn['role'] in ('user','assistant') and len(turn['content'])<=300
    assert set(e)<=FIELDS and e['action'] in ACTIONS
    action=e['action']
    allowed_by_kind={'new_reminder_once':{'create_reminder'},'new_reminder_repeating':{'create_reminder'},'new_task':{'create_task'},'manage_reminder':{'update_schedule','pause_schedule','resume_schedule','cancel_schedule','snooze_schedule'},'list_reminders':{'list_schedules'},'save_fact':{'remember_fact','update_fact'},'follow_up':{'clarify'},'answer_follow_up':{'create_reminder','create_task','update_schedule','remember_fact','update_fact','clarify','pause_schedule','resume_schedule','cancel_schedule','snooze_schedule'},'plain_question':{'answer'}}
    assert action in allowed_by_kind[row['kind']]
    assert (s['pending_draft'] is not None)==(row['kind']=='answer_follow_up')
    if s['pending_draft']:
        assert 'user_text' in s['pending_draft'] and s['recent_turns'][-1]['role']=='assistant'
    if action=='answer': assert e=={'action':'answer'}
    if action=='clarify': assert e.get('question') and len(e['question'])<=300 and e['question'].count('?')==1
    if action in ('remember_fact','update_fact'):
        assert all(e.get(k) for k in ('subject','attribute','value'))
        assert e['value'] in row['message'] and e['attribute']==e['attribute'].lower()
        exists={'subject':e['subject'],'attribute':e['attribute']} in s['facts']
        assert exists==(action=='update_fact')
    if action in ('pause_schedule','resume_schedule','cancel_schedule','snooze_schedule','update_schedule'):
        matches=[x for x in s['schedules'] if x['id']==e['schedule_id']]
        assert len(matches)==1
        if action=='resume_schedule': assert matches[0]['status']=='paused'
        if action=='snooze_schedule': assert 1<=e['minutes']<=1440
    if action in ('create_reminder','create_task'):
        assert e.get('message' if action=='create_reminder' else 'prompt') and 'timing' in e
    if 'timing' in e:
        t=e['timing']; assert set(t)<=TFIELDS
        typ=t['type']; assert typ in ('once','daily','monthly','interval')
        complete=action!='clarify'
        if typ=='once' and ('local_at' in t or complete):
            at=datetime.strptime(t['local_at'],'%Y-%m-%dT%H:%M')
            assert at>now.replace(tzinfo=None)
        if typ in ('daily','monthly') and ('time' in t or complete): assert re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d',t['time'])
        if typ=='monthly' and complete: assert t['day']==-1 or 1<=t['day']<=31
        if 'weekdays' in t: assert t['weekdays']==sorted(set(t['weekdays'])) and all(1<=x<=7 for x in t['weekdays'])
        if typ=='interval' and complete:
            assert 15<=t['every_minutes']<=525600
            if 'window_start' in t or 'window_end' in t:
                assert t['window_start']<t['window_end']
                assert t['start_local']==s['now'][:10]+'T'+t['window_start']
            else:
                assert datetime.fromisoformat(t['start_local'])==now.replace(tzinfo=None)+timedelta(minutes=t['every_minutes'])

if __name__=='__main__':
    data={split:[json.loads(line) for line in (ROOT/f'{split}.jsonl').read_text().splitlines()] for split in ('train','test')}
    errors=[]
    for split,rows in data.items():
        for row in rows:
            try: validate(row)
            except (AssertionError,KeyError,ValueError) as ex: errors.append({'id':row.get('id'),'error':str(ex) or 'validation assertion failed'})
    ids=[r['id'] for rows in data.values() for r in rows]
    assert len(ids)==len(set(ids))
    counts={s:dict(sorted(Counter(r['kind'] for r in rows).items())) for s,rows in data.items()}
    expected_train={k:7*v+EXPANSION.get(k,0) for k,v in SHARES.items()}
    assert counts['train']==expected_train,(counts['train'],expected_train)
    assert {k:v for k,v in counts['test'].items()}=={k:3*v for k,v in SHARES.items()}
    new_rows=[r for r in data['train'] if int(r['id'][2:])>1000]
    original_train_scenarios={r['scenario'] for r in data['train'] if int(r['id'][2:])<=1000}
    new_train_scenarios={r['scenario'] for r in new_rows}
    assert not (original_train_scenarios & new_train_scenarios)
    assert all(n<=8 for n in Counter(r['scenario'] for r in new_rows).values())
    followup_reasons={
        'time':lambda s:'-time-clarifications' in s,
        'ampm':lambda s:'-ambiguous-hours' in s,
        'subject':lambda s:'-subject-clarifications' in s,
        'multiple':lambda s:'-reminder-selection' in s or s.startswith('multiple-'),
        'none':lambda s:s.startswith('missing-'),
        'reference':lambda s:s.startswith('unclear-'),
    }
    reason_counts={reason:sum(row['kind']=='follow_up' and pred(row['scenario']) for row in new_rows)
                   for reason,pred in followup_reasons.items()}
    assert reason_counts=={reason:60 for reason in followup_reasons},reason_counts
    scenarios={s:sorted(set(r['scenario'] for r in rows)) for s,rows in data.items()}
    norms={s:Counter(normalized(r['message']) for r in rows) for s,rows in data.items()}
    duplicates={s:[m for m,c in n.items() if c>1 and m not in INTENTIONAL_CONTRAST_MESSAGES] for s,n in norms.items()}
    contrast_rows=[r for r in new_rows if normalized(r['message']) in INTENTIONAL_CONTRAST_MESSAGES]
    assert len(contrast_rows)==2
    assert {r['expected']['action'] for r in contrast_rows}=={'pause_schedule','clarify'}
    assert len([s for s in contrast_rows[0]['situation']['schedules'] if s['title']=='Gym']) == 1 or len([s for s in contrast_rows[1]['situation']['schedules'] if s['title']=='Gym']) == 1
    exact=sorted(set(norms['train'])&set(norms['test']))
    near=[]
    train=[(r,skeleton(r)) for r in data['train']]
    test=[(r,skeleton(r)) for r in data['test']]
    for a,sa in train:
        for b,sb in test:
            if a['kind']!=b['kind']: continue
            ta,tb=sa.split(),sb.split()
            wa,wb=set(ta),set(tb)
            overlap=len(wa&wb)/len(wa|wb)
            ratio=SequenceMatcher(None,ta,tb,autojunk=False).ratio()
            reason='same masked sentence' if sa==sb else ('high word overlap' if min(len(ta),len(tb))>=6 and overlap>=0.8 else ('high token similarity' if min(len(ta),len(tb))>=6 and ratio>=0.9 else None))
            if reason: near.append({'train':a['id'],'test':b['id'],'reason':reason,'train_message':a['message'],'test_message':b['message'],'train_masked':sa,'test_masked':sb})
    rng=random.Random(20261030)
    report={'pairs_per_kind':counts,'pair_counts':{s:len(rows) for s,rows in data.items()},'scenario_counts':{s:len(v) for s,v in scenarios.items()},'new_training_rows':{kind:sum(r['kind']==kind for r in new_rows) for kind in sorted(EXPANSION)},'new_follow_up_reason_counts':reason_counts,'new_scenario_count':len(new_train_scenarios),'intentional_contrast_messages':sorted(INTENTIONAL_CONTRAST_MESSAGES),'scenario_overlap':sorted(set(scenarios['train'])&set(scenarios['test'])),'exact_matches':exact,'near_copies':near,'duplicates':duplicates,'validation_errors':errors,'samples':{s:rng.sample(rows,10) for s,rows in data.items()},'near_copy_method':{'mask':'labelled subjects, values, reminder contents, schedule titles, times, weekdays, numbers','exact_masked':True,'jaccard_min':0.8,'token_similarity_min':0.9,'fuzzy_min_tokens':6}}
    (ROOT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    markdown = ['# Routing dataset report', '', 'Generated by `python3 evals/routing/check.py`. Samples use seed `20261030`.', '',
        '| Kind | Train | Test |', '|---|---:|---:|']
    for kind in SHARES:
        markdown.append(f"| `{kind}` | {counts['train'].get(kind,0)} | {counts['test'].get(kind,0)} |")
    markdown.extend([f"| **Total** | **{len(data['train'])}** | **{len(data['test'])}** |", '',
        f"Scenarios: **{len(scenarios['train'])} train**, **{len(scenarios['test'])} test**. Each scenario stays in one file.", '',
        f"- Shared scenarios: {len(report['scenario_overlap'])}",
        f"- Exact normalized messages shared between files: {len(exact)}",
        f"- Near-copy candidates remaining: {len(near)}",
        f"- Duplicate messages within train (excluding the approved gym contrast pair): {len(duplicates['train'])}",
        f"- Duplicate messages within test: {len(duplicates['test'])}",
        f"- Structural, context and timing validation errors: {len(errors)}", '',
        '## Checks and reproduction', '',
        'Every message was authored as an individual literal in `author.py` or `expansion_data.py`; helpers package context and compute dates without filling message templates. All clocks use Asia/Kolkata. IDs are unique across both files.', '',
        'Exact checks lowercase and remove punctuation. Near-copy checks compare every train/test pair, mask labelled entities and content, numbers, times and weekdays, and flag matching skeletons, word-set Jaccard overlap of at least 0.80, or token sequence similarity of at least 0.90 (fuzzy checks require at least six tokens). These are deterministic heuristics, not proof against all semantic leakage. Seven initial candidates were manually rewritten before the final checks.', '',
        f"The structural check enforces kind counts, 60 examples per follow-up reason, scenario limits and separation, context shape, future one-off times, valid recurring times, fact update selection, and exact unwindowed interval starts. `validate-router.cjs` separately calls the production `resolveDecision()` and `buildContext()` functions on all {len(data['train'])+len(data['test']):,} labels. Its results are in `router-validation.json`. No model is called, trained or scored.", '',
        '```sh', 'python3 evals/routing/author.py', 'python3 evals/routing/check.py', 'node evals/routing/validate-router.cjs', '```', '',
        'The production check uses the existing TypeScript dependency in `apps/desktop/node_modules`. The packaging and overlap scripts need only Python 3.10 or newer. Existing application code and older evaluation cases are untouched.', '',
        '## Coverage', ''])
    all_rows=data['train']+data['test']
    markdown.extend([
        f"- {len({r['situation']['now'][:7] for r in all_rows})} calendar months, all seven weekdays, and clocks from shortly after midnight through late night.",
        '- Contexts contain 0–8 schedules, active and paused reminders, varying fact inventories, and relevant recent turns.',
        f"- {sum(r['message'][0].islower() for r in all_rows)} messages begin in lowercase; other informal examples use abbreviations, missing punctuation, fragments, or conversational replies.", '',
        '## Ten random training pairs', '',
        'Each expandable example includes the complete situation, user message and exact expected arguments.', ''])
    for split in ('train','test'):
        if split=='test': markdown.extend(['## Ten random test pairs',''])
        for row in report['samples'][split]:
            markdown.extend([f"### {row['id']} · {row['kind']}", '', row['message'], '',
                '**Expected**', '', '```json', json.dumps(row['expected'],ensure_ascii=False,indent=2), '```', '',
                '<details>', '<summary>Complete pair, including situation</summary>', '', '```json',
                json.dumps(row,ensure_ascii=False,indent=2), '```', '', '</details>', ''])
    (ROOT/'REPORT.md').write_text('\n'.join(markdown)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k not in ('samples','near_copies')},indent=2))
    print('near copies:',len(near))
    for flag in near[:50]: print(json.dumps(flag,ensure_ascii=False))
    raise SystemExit(bool(errors or near or exact or any(duplicates.values()) or report['scenario_overlap']))
