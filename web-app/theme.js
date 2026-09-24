const KEY = 'nano-bench-theme';

const icon = body =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const buttons = [
  [
    'auto',
    'Auto',
    icon('<circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20Z" fill="currentColor"/>')
  ],
  [
    'light',
    'Light',
    icon(
      '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>'
    )
  ],
  ['dark', 'Dark', icon('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>')]
];

const current = () => document.documentElement.dataset.theme ?? 'auto';

const setMode = (group, mode) => {
  if (mode === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  try {
    if (mode === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    // storage blocked: the choice lasts for this page only
  }
  group.dataset.state = mode;
};

for (const group of document.querySelectorAll('#theme-toggle')) {
  group.innerHTML = buttons
    .map(
      ([mode, label, svg]) =>
        `<button type="button" data-mode="${mode}" aria-label="${label} theme" title="${label}">${svg}</button>`
    )
    .join('');
  group.dataset.state = current();
  group.addEventListener('click', event => {
    const button = /** @type {Element} */ (event.target).closest('button[data-mode]');
    if (button) setMode(group, /** @type {HTMLElement} */ (button).dataset.mode);
  });
}
