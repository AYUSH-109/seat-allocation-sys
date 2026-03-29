(function () {
  try {
    const theme = localStorage.getItem('theme');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {
    // no-op
  }

  document.documentElement.classList.add('no-transition');
  window.addEventListener('load', function () {
    document.documentElement.classList.remove('no-transition');
  });
})();
