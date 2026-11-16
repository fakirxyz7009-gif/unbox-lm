'use strict';

/** A fresh disposable profile reaches the same first-run chooser as an ordinary user. */
async function createWelcomeProject(page) {
  const welcome = page.getByRole('dialog', { name: 'Welcome to Unbox Studio', exact: true });
  await welcome.getByRole('button', { name: /Empty project/ }).click({ timeout: 10_000 });
  try {
    await welcome.waitFor({ state: 'hidden', timeout: 15_000 });
  } catch (error) {
    const status = await page.locator('[role="status"], [role="alert"]').allTextContents();
    const chooser = await welcome.innerText().catch(() => 'closed');
    throw new Error(`The initial project did not open. Chooser: ${chooser}. Status: ${status.join(' | ')}`, { cause: error });
  }
}

module.exports = { createWelcomeProject };
