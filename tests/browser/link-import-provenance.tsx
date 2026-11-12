import React from 'react';
import { createRoot } from 'react-dom/client';
import { LinkImport } from '../../src/components/browser/LinkImport.tsx';

const result = document.querySelector<HTMLPreElement>('#result')!;
const editor = document.querySelector<HTMLDivElement>('#editor')!;
const root = createRoot(editor);
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function expect(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function until(test: () => boolean, message: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (test()) return;
    await wait(20);
  }
  throw new Error(message);
}

function setValue(element: HTMLInputElement | HTMLSelectElement, value: string): void {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) throw new Error('The browser did not expose a native value setter');
  setter.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

async function run(): Promise<void> {
  const originalFetch = window.fetch;
  window.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/import/status')) {
      return new Response(JSON.stringify({ ytDlp: true, ffmpeg: true }), { headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected network request: ${url}`);
  }) as typeof window.fetch;
  try {
    root.render(<LinkImport onImported={() => { throw new Error('The declaration probe must not download audio'); }} />);
    const url = () => editor.querySelector<HTMLInputElement>('input[aria-label="Link to import"]');
    const rights = () => editor.querySelector<HTMLSelectElement>('select[aria-label="Rights basis for linked audio"]');
    const action = () => [...editor.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.trim() === 'Import audio');
    await until(() => !!url() && !!rights() && !!action() && !url()!.disabled, 'Link importer did not become ready');

    setValue(url()!, 'https://example.org/artist/recording');
    expect(action()!.disabled, 'A bare link enabled audio import without a rights declaration');
    setValue(rights()!, 'cc-by');
    const confirmation = editor.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(confirmation, 'Link-import declaration confirmation is missing');
    confirmation.click();
    await wait(20);
    expect(action()!.disabled, 'CC-BY audio became importable without its required credit');

    const credit = editor.querySelector<HTMLInputElement>('input[aria-label="Required CC-BY credit for linked audio"]');
    expect(credit, 'CC-BY credit field did not appear');
    setValue(credit, 'Example Artist — Recording title — CC-BY-4.0');
    await until(() => !action()!.disabled, 'A complete CC-BY declaration did not enable import');
    result.dataset.status = 'passed';
    result.textContent = 'PASS · Linked-audio import requires a source URL, explicit rights basis and confirmation; CC-BY additionally requires an attribution record.';
  } finally {
    root.unmount();
    window.fetch = originalFetch;
  }
}

void run().catch((error: unknown) => {
  result.dataset.status = 'failed';
  result.textContent = `FAIL · ${error instanceof Error ? error.stack ?? error.message : String(error)}`;
});
