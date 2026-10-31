import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import React, { act, useState } from 'react';
import * as api from '../dist/esm/index.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
after(() => dom.window.close());

const requests = [
  {
    id: 'one',
    method: 'POST',
    url: '/orders',
    status: 201,
    startedAt: 10,
    duration: 30,
    requestHeaders: { Authorization: 'secret', 'X-Trace': 'private', Accept: 'json' },
    responseHeaders: { 'Set-Cookie': 'session=secret' },
    requestBody: { product: '<script>not executable</script>' },
    responseBody: { ok: true },
    timings: [{ name: 'Waiting', duration: 20 }],
  },
  { id: 'two', method: 'GET', url: '/health', startedAt: 20, duration: 10, error: 'Offline' },
];

test('redaction is case insensitive, additive and immutable', () => {
  const headers = { AUTHORIZATION: 'secret', Cookie: 'token', 'x-extra': 'hidden', Accept: 'json' };
  assert.deepEqual(api.redactHeaders(headers, ['X-EXTRA']), {
    AUTHORIZATION: '[REDACTED]',
    Cookie: '[REDACTED]',
    'x-extra': '[REDACTED]',
    Accept: 'json',
  });
  assert.equal(headers.AUTHORIZATION, 'secret');
  assert.equal(api.DEFAULT_REDACTED_HEADERS.includes('set-cookie'), true);
});

test('payload formatting handles empty, strings, cycles, bigint and truncation', () => {
  const cycle = {};
  cycle.self = cycle;
  assert.equal(api.formatPayload(undefined), '');
  assert.equal(api.formatPayload('abcdef', 3), 'abc\n[Truncated]');
  assert.equal(api.formatPayload(cycle), '[Unserializable payload]');
  assert.equal(api.formatPayload(1n), '[Unserializable payload]');
  assert.match(api.formatPayload({ ok: true }), /"ok": true/);
});

test('filter and waterfall are pure, relative and finite', () => {
  assert.equal(api.filterRequests(requests, 'OFFLINE')[0].id, 'two');
  assert.equal(api.filterRequests(requests, '201').length, 1);
  assert.deepEqual(api.buildWaterfall([]), []);
  const bars = api.buildWaterfall(requests);
  assert.equal(bars[0].width, 100);
  assert.equal(bars[1].offset, 10);
  assert.equal(api.buildWaterfall([{ id: 'x', startedAt: NaN, duration: -1 }])[0].width, 0);
  assert.equal(requests[0].startedAt, 10);
});

test('controlled selection, query, details, redaction and escaped payload', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function App() {
    const [selectedId, onSelect] = useState(null);
    const [query, onQueryChange] = useState('');
    return React.createElement(api.NetworkInspector, {
      requests,
      selectedId,
      onSelect,
      query,
      onQueryChange,
      redactHeaderNames: ['X-Trace'],
    });
  }
  try {
    await act(async () => root.render(React.createElement(App)));
    await act(async () => host.querySelector('tbody button').click());
    assert.match(host.textContent, /Waiting: 20 ms/);
    assert.match(host.textContent, /\[REDACTED\]/);
    assert.doesNotMatch(host.textContent, /session=secret|private/);
    assert.equal(host.querySelector('script'), null);
    assert.match(host.textContent, /<script>not executable<\/script>/);
    const input = host.querySelector('input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(
        input,
        'health',
      );
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    assert.equal(host.querySelectorAll('tbody tr').length, 1);
    await act(async () => host.querySelector('tbody button').click());
    assert.match(host.querySelector('[role="alert"]').textContent, /Offline/);
    await act(async () =>
      root.render(
        React.createElement(api.NetworkInspector, {
          requests: [],
          selectedId: 'missing',
          query: 'x',
        }),
      ),
    );
    assert.match(host.textContent, /No matching requests/);
    assert.equal(host.querySelector('input').readOnly, true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test('CommonJS exports match ESM', () => {
  const cjs = createRequire(import.meta.url)('../dist/cjs/index.js');
  assert.deepEqual(Object.keys(cjs).sort(), Object.keys(api).sort());
  assert.deepEqual(cjs.redactHeaders({ Cookie: 'secret' }), { Cookie: '[REDACTED]' });
});
