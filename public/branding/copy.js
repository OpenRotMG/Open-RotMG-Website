const status = document.getElementById('copy-status');
for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    button.closest('section').append(status);
    status.textContent = '';
    try {
      const field = document.getElementById(button.dataset.copy);
      if (!field) throw new Error(`Missing copy field: ${button.dataset.copy}`);
      if (!navigator.clipboard) throw new Error('Clipboard access requires HTTPS and browser permission.');
      await navigator.clipboard.writeText(field.value);
      status.textContent = button.dataset.copy === 'discourse-code' ? 'Embed copied.' : 'Image URL copied.';
    } catch (error) {
      console.error('Branding copy failed', error);
      status.textContent = `Copy failed: ${error.message}`;
    }
  });
}
