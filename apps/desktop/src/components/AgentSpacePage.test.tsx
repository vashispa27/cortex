import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentSpacePage } from './AgentSpacePage';

it('renders agent tasks as a status board with filters, without scheduled work or memory editing', () => {
  const html = renderToStaticMarkup(<AgentSpacePage sample />);
  expect(html).toContain('<h1>Agent Space</h1>');
  for (const label of ['Task board', 'To do column', 'In progress column', 'Blocked column', 'Parked column', 'Done column', 'Task ownership filter', 'Owner harness', 'Filter project']) {
    expect(html).toContain(`aria-label="${label}"`);
  }
  expect(html).not.toContain('aria-label="Archived column"');
  expect(html).toContain('Connect harnesses');
  expect(html).toContain('does not launch an agent');
  expect(html).toContain('Make context portable');
  expect(html).not.toContain('<form');
  expect(html).not.toContain('Save memory');
  expect(html).not.toContain('New reminder');
});
