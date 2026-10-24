window.OpenRotMGBugReport = {
  start(key, player) {
    const panel = document.querySelector('#bug-report');
    const form = document.querySelector('#bug-form');
    const description = document.querySelector('#bug-description');
    const image = document.querySelector('#bug-screenshot');
    const status = document.querySelector('#bug-status');
    const submit = form.querySelector('button[type="submit"]');
    let screenshot, submitting = false;
    async function capture() {
      if (submitting) return;
      submit.disabled = true;
      status.textContent = 'Capturing your game…';
      try {
        screenshot = await new Promise((resolve, reject) => requestAnimationFrame(() => {
          try {
            const canvas = player.shadowRoot.querySelector('canvas');
            if (!canvas || !canvas.width || !canvas.height) throw new Error('Game image is not available yet.');
            const copy = document.createElement('canvas');
            copy.width = canvas.width; copy.height = canvas.height;
            copy.getContext('2d').drawImage(canvas, 0, 0);
            resolve(copy.toDataURL('image/png'));
          } catch (error) { reject(error); }
        }));
        if (screenshot.length > 1_400_022) throw new Error('Game screenshot exceeds 1 MiB.');
        image.src = screenshot;
        image.hidden = false;
        submit.disabled = false;
        status.textContent = '';
      } catch (error) {
        screenshot = undefined;
        image.hidden = true;
        status.textContent = 'Screenshot failed: ' + error.message + ' Use Refresh screenshot to try again.';
      }
    }
    panel.addEventListener('toggle', () => { if (panel.open) void capture(); });
    document.querySelector('#bug-refresh').addEventListener('click', () => void capture());
    document.querySelector('a[href="/#bug-report"]').addEventListener('click', event => {
      event.preventDefault(); panel.open = true; panel.scrollIntoView({block: 'nearest'});
    });
    if (location.hash === '#bug-report') panel.open = true;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit.disabled || submitting) return;
      submitting = true;
      submit.disabled = true;
      status.textContent = 'Submitting report…';
      try {
        if (!description.value.trim()) throw new Error('Describe the bug before submitting.');
        if (!screenshot) throw new Error('Refresh the game screenshot before submitting.');
        const response = await OpenRotMGBackend.fetch(`/api/diagnostics/${key}/report`, {
          method: 'POST', headers: {'content-type': 'application/json'},
          body: JSON.stringify({message: description.value, screenshot: screenshot.slice('data:image/png;base64,'.length)}),
          signal: AbortSignal.timeout(35000), redirect: 'error'
        });
        const result = await response.json();
        if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : `Report rejected (HTTP ${response.status}).`);
        if (!/^[a-f0-9]{24}$/.test(result.id)) throw new Error('Invalid submission confirmation; check the bug backlog before retrying.');
        description.value = '';
        status.textContent = 'Report submitted! Thank you. Report ID: ' + result.id;
      } catch (error) {
        status.textContent = 'Could not confirm submission: ' + error.message + ' Your description has been kept.';
      } finally { submitting = false; submit.disabled = false; }
    });
  }
};
