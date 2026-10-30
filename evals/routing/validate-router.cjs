// Validate authored labels using production code; no model invocation or scoring.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../apps/desktop/node_modules/typescript');
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  }}).outputText, filename);
};
const { resolveDecision, buildContext, DECIDE_TOOL } = require('../../apps/desktop/src/lib/decide.ts');
const properties = DECIDE_TOOL.function.parameters.properties;
const errors = [];
let total = 0;
for (const split of ['train','test']) {
  const rows = fs.readFileSync(path.join(__dirname, `${split}.jsonl`), 'utf8').trim().split('\n').map(JSON.parse);
  for (const row of rows) {
    total++;
    const s = row.situation, e = row.expected;
    const ctx = { now: new Date(s.now), timezone: s.timezone,
      schedules: s.schedules.map(({ next, ...rest }) => ({ ...rest, next_due_local: next })),
      facts: s.facts, recent: s.recent_turns,
      ...(s.pending_draft ? { pending: { type:'decision', draft:s.pending_draft }} : {}),
    };
    const result = resolveDecision(e, ctx, row.message);
    const action=e.action;
    const expectedType = action === 'answer' ? 'answer' : action === 'clarify' ? 'clarify'
      : action.startsWith('create_') ? 'schedule_create'
      : action.endsWith('_fact') ? 'remember'
      : action === 'update_schedule' ? 'schedule_update'
      : action === 'snooze_schedule' ? 'schedule_snooze' : 'schedule_manage';
    const actualType = result === 'answer' ? 'answer' : result?.type;
    if (actualType !== expectedType) errors.push({id:row.id, action, result});
    // Production context shape agrees, apart from the explicit null draft required by the brief.
    const built=JSON.parse(buildContext(ctx));
    delete built.prompt_version;
    // upcoming_days is derived from now and timezone at inference time, so it is not stored in source rows.
    delete built.upcoming_days;
    if (!built.pending_draft) built.pending_draft=null;
    if (JSON.stringify(built)!==JSON.stringify(s)) errors.push({id:row.id, error:'context mismatch'});
    for (const [key,value] of Object.entries(e)) {
      const definition=properties[key];
      const type=Array.isArray(value)?'array':typeof value;
      if (!definition || (definition.type==='integer' ? !Number.isInteger(value) : definition.type!==type)) errors.push({id:row.id, error:`schema ${key}`});
    }
  }
}
fs.writeFileSync(path.join(__dirname,'router-validation.json'), JSON.stringify({checked:total,errors},null,2)+'\n');
console.log(JSON.stringify({checked:total, errors},null,2));
process.exitCode=Number(errors.length>0);
