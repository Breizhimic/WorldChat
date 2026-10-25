import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';
import type { TranslationRequest, TranslationResponse, Language } from '../../src/translation';

test('mobile onboarding, empty inbox and honest backend configuration state', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Ton pseudo').fill('Camille');
  await page.getByRole('button', { name: 'Ouvrir mes conversations' }).click();
  await expect(page.getByRole('heading', { name: 'Conversations.' })).toBeVisible();
  await expect(page.getByText('Tout commence par un bonjour.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nouveau salon' })).toBeDisabled();
  await expect(page.getByText('Aucun message ne peut être envoyé.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Configurer Supabase' }).click();
  await expect(page.getByRole('dialog')).toContainText('connexions anonymes');
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('Ton pseudo')).toHaveCount(0);
  const manifest = await page.locator('link[rel="manifest"]').getAttribute('href');
  const response = await page.request.get(manifest!);
  expect(await response.json()).toMatchObject({ start_url: '/WorldChat/', display: 'standalone' });
});

test('preferences separate sending and reading languages and opt in to translation', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Ton pseudo').fill('Camille');
  await page.getByRole('button', { name: 'Ouvrir mes conversations' }).click();
  await page.getByRole('button', { name: /Camille/ }).click();
  await page.getByLabel('J’écris en', { exact: true }).selectOption('fr');
  await page.getByLabel('Je lis en', { exact: true }).selectOption('en');
  await page.getByLabel('Traduire automatiquement les messages reçus').check();
  await expect(page.getByText(/Sur iPhone : ouvre dans Safari/)).toBeVisible();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /Camille/ }).click();
  await expect(page.getByLabel('Je lis en', { exact: true })).toHaveValue('en');
  await expect(page.getByLabel('J’écris en', { exact: true })).toHaveValue('fr');
  await expect(page.getByLabel('Traduire automatiquement les messages reçus')).toBeChecked();
});

test('an invitation survives onboarding without being treated as a public room ID', async ({ page }) => {
  await page.goto(`./#invite=${'a'.repeat(64)}`);
  await page.getByLabel('Ton pseudo').fill('Invité');
  await page.getByRole('button', { name: 'Ouvrir mes conversations' }).click();
  await expect(page.getByRole('dialog')).toContainText('Rejoindre la conversation');
  await expect(page.getByLabel('Lien ou code d’invitation')).toHaveValue('a'.repeat(64));
  await expect(page.getByRole('button', { name: 'Rejoindre le salon', exact: true })).toBeDisabled();
});

test('real local translation engine works in both directions and after an offline reload', async ({ page, context }) => {
  test.skip(process.env.REAL_TRANSLATION !== '1', 'Opt in: downloads actual model weights.');
  test.setTimeout(300000);
  const asset = readdirSync(new URL('../../dist/assets', import.meta.url))
    .find((name) => /^translation\.worker-.*\.js$/.test(name));
  expect(asset).toBeDefined();
  await page.goto('./');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  async function translate(text: string, source: Language) {
    return page.evaluate(({ asset, text, source }) => new Promise<string>((resolve, reject) => {
      const worker = new Worker(`/WorldChat/assets/${asset}`, { type: 'module' });
      worker.onmessage = ({ data }: MessageEvent<TranslationResponse>) => {
        if (data.type === 'result') { worker.terminate(); resolve(data.text); }
        if (data.type === 'error') { worker.terminate(); reject(new Error(data.message)); }
      };
      worker.onerror = () => { worker.terminate(); reject(new Error('Worker failed')); };
      worker.postMessage({ type: 'translate', id: 1, source, text } satisfies TranslationRequest);
    }), { asset, text, source });
  }
  expect(await translate('Bonjour le monde !', 'fr')).toMatch(/hello.*world/i);
  expect(await translate('Hello, how are you?', 'en')).toMatch(/comment.*(vous|tu)/i);
  await context.setOffline(true);
  await page.reload();
  expect(await translate('Hello, how are you?', 'en')).toMatch(/comment.*(vous|tu)/i);
});
