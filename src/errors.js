// Turns a download or GPU failure into one plain sentence and what to do next.
export function plainError(e) {
  const name = e?.name || '', msg = String(e?.message || e || '');
  if (e?.kind === 'gpu') return `This browser cannot run the model: ${msg} Try Chrome or Edge on a computer with a graphics card.`;
  if (name === 'QuotaExceededError' || /quota|storage|disk space/i.test(msg)) return 'Not enough storage space. The model needs about 2.8 GB of free browser storage. Free up disk space, or leave private browsing, then try again.';
  if (/failed to fetch|networkerror|network|load failed|err_|timed? ?out/i.test(msg)) return 'The download stopped, likely a network drop. Check your connection and press the button again; parts already downloaded are kept.';
  if (/device.*lost|gpu|webgpu|out of memory/i.test(msg)) return 'The graphics card stopped responding or ran out of memory. Close other heavy tabs and press the button again.';
  return `The model could not run here (${msg.slice(0, 120)}).`;
}
