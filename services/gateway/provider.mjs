import { TASKS, buildPrompt } from '../../packages/prompts/index.mjs';

export class MockProvider {
  async infer(task, input) {
    if (task === 'transcribe') throw Object.assign(new Error('No speech model is configured'), { status: 503, code: 'speech_unavailable' });
    if (task === 'rewrite') return { output: { replacement_text: input.text, evidence_ids: [], uncertainties: ['Synthetic model preserved the original text'] }, usage: { input_tokens: 0, output_tokens: 0 } };
    if (task === 'answer') return { output: { answer: input.evidence.length ? `The provided source says: ${input.evidence[0].text.slice(0, 300)}` : "I couldn't find evidence for that in the supplied context.", evidence_ids: input.evidence.length ? [input.evidence[0].id] : [], uncertainties: input.evidence.length ? [] : ['No supporting evidence was supplied'] }, usage: { input_tokens: 0, output_tokens: 0 } };
    if (task === 'summarize') return { output: { summary: input.evidence.length ? input.evidence[0].text.slice(0, 500) : input.text.slice(0, 500), evidence_ids: input.evidence.length ? [input.evidence[0].id] : [], uncertainties: [] }, usage: { input_tokens: 0, output_tokens: 0 } };
    return { output: { items: [], evidence_ids: [], uncertainties: ['Synthetic extractor produced no claims'] }, usage: { input_tokens: 0, output_tokens: 0 } };
  }
}

/** Generic OpenAI-compatible provider. Exact deployment IDs and contractual retention are deployment configuration. */
export class CompatibleProvider {
  constructor({ baseUrl, allowedOrigin, apiKey, models }) {
    const url = new URL(baseUrl);
    const allow = new URL(allowedOrigin);
    if (url.protocol !== 'https:' || allow.protocol !== 'https:' || allowedOrigin !== allow.origin || url.origin !== allow.origin || url.username || url.password || url.search || url.hash || !apiKey) throw new Error('Provider URL must be HTTPS on the configured allowlisted origin without URL credentials or query');
    this.base = url.href.endsWith('/') ? url.href : `${url.href}/`;
    this.allowedOrigin = allow.origin; this.key = apiKey; this.models = models;
  }
  endpoint(path) { const url = new URL(path, this.base); if (url.origin !== this.allowedOrigin || url.protocol !== 'https:') throw new Error('Provider endpoint escaped allowlist'); return url; }
  async infer(task, input, signal) {
    const model = this.models[TASKS[task].deployment];
    if (!model) throw Object.assign(new Error('Model route is not configured'), { status: 503, code: 'model_unavailable' });
    if (task === 'transcribe') {
      const form = new FormData();
      form.append('model', model);
      form.append('file', new Blob([Buffer.from(input.audio_base64, 'base64')], { type: input.mime_type }), 'audio');
      if (input.language) form.append('language', input.language);
      const res = await fetch(this.endpoint('audio/transcriptions'), { method: 'POST', headers: { authorization: `Bearer ${this.key}` }, body: form, redirect: 'error', signal });
      if (!res.ok) throw Object.assign(new Error('Speech provider failed'), { status: 502, code: 'provider_error' });
      const payload = await res.json();
      return { output: { transcript: payload.text || '', evidence_ids: [], uncertainties: [] }, usage: { input_tokens: 0, output_tokens: 0 } };
    }
    const prompt = buildPrompt(task, input);
    const res = await fetch(this.endpoint('chat/completions'), {
      method: 'POST', redirect: 'error', signal,
      headers: { authorization: `Bearer ${this.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }], response_format: { type: 'json_object' }, max_tokens: prompt.max_output_tokens })
    });
    if (!res.ok) throw Object.assign(new Error('Model provider failed'), { status: 502, code: 'provider_error' });
    const payload = await res.json();
    let output;
    try { output = JSON.parse(payload.choices?.[0]?.message?.content || ''); } catch { throw Object.assign(new Error('Invalid provider JSON'), { status: 502, code: 'provider_invalid_output' }); }
    return { output, usage: { input_tokens: payload.usage?.prompt_tokens || 0, output_tokens: payload.usage?.completion_tokens || 0 } };
  }
}
