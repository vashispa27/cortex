import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoriesPage } from './MemoriesPage';
it('exports a labeled tab interface and reuses supplied activity content without nesting navigation', () => {
  const html = renderToStaticMarkup(<MemoriesPage recentActivity={<div>Existing activity search</div>} />);
  expect(html).toContain('role="tablist"');
  expect(html.match(/role="tab"/g)).toHaveLength(2);
  expect(html.match(/role="tabpanel"/g)).toHaveLength(2);
  expect(html).toContain('aria-selected="true"');
  expect(html).toContain('tabindex="-1"');
  expect(html).toContain('Existing activity search');
  expect(html).toContain('Search permanent memory');
});
it('lists facts with an add button and keeps the fact form out of the page until asked', () => {
  const html = renderToStaticMarkup(<MemoriesPage recentActivity={<div />} />);
  expect(html).toContain('Add memory');
  expect(html).not.toContain('<form');
});
