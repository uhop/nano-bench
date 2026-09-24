// classic script in <head>: applies the saved theme before first paint
{
  let mode = null;
  try {
    mode = localStorage.getItem('nano-bench-theme');
  } catch {
    // storage blocked: follow the OS
  }
  if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode;
}
