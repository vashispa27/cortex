# Cortex website

A single, responsive product page with an interactive fictional memory demo, local-memory and privacy explanation, and FAQs. Built with Vite and plain HTML/CSS/JavaScript. No backend, accounts, analytics, or secrets are required.

## Develop

```sh
cd apps/website
npm ci
npm run dev
```

Open http://127.0.0.1:8790. The legacy `node apps/website/server.mjs` entry point also starts the Vite dev server from the repo root.

## Build and check

```sh
npm run build
npm test
npm run preview
```

`dist/` is the production site. The Mac demo cycles through four fictional scenarios with typing, processing, and answer phases. Answers have expandable sources. The memory animation shows a Mac conversation being captured, rotating questions, and a task-suggestion concept preview. The harness animation shows Codex saving progress at a credit limit, Claude resuming and updating the task, and OpenCode reviewing it through shared Cortex memory. All three animations have pause controls, honor reduced motion, and suspend their timelines outside the viewport. It makes no requests to Cortex or a model provider. The theme follows the desktop app: charcoal glass, electric blue, cyan, and system fonts. The public installer is not yet available; the main project link goes to the repository.

## Deploy to Vercel

Import this repository and set **Root Directory** to `apps/website`. Select the **Vite** framework preset, build with `npm run build`, and use `dist` as the output directory. The checked-in `vercel.json` also declares these settings. No environment variables are needed. Deployments are independent of Rust and the desktop app.

The earlier multi-route Node preview and JSON download configuration have been retired. Keep product capabilities and installer availability accurate when updating this page.

Animation timing uses elapsed clock time, including delayed callbacks. Any visible portion keeps a scene playing. The capture example changes every 5.2 seconds, cycling back to the first after four scenes. The capture demo cycles through Messages, Meetings, Email, and Project docs, with direct selection controls. Provider SVGs are bundled locally; see `public/logos/README.md` and its license for provenance.
