'use strict';
const image = document.getElementById('app-image');
const fullImage = document.getElementById('full-image');
for (const button of document.querySelectorAll('[data-appearance]')) {
  button.addEventListener('click', () => {
    const appearance = button.dataset.appearance;
    const path = `assets/tuff-11-chat-${appearance}.png`;
    image.src = path;
    fullImage.href = path;
    for (const option of document.querySelectorAll('[data-appearance]')) {
      option.setAttribute('aria-pressed', String(option === button));
    }
  });
}
document.getElementById('copy').addEventListener('click', async () => {
  const status = document.getElementById('copy-status');
  try {
    await navigator.clipboard.writeText(document.getElementById('brew').textContent);
    status.textContent = 'Homebrew command copied.';
  } catch {
    status.textContent = 'Select and copy the command above.';
  }
});
