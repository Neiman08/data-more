(function () {
  const sports = [
    {
      key: 'mlb',
      href: '/mlb.html',
      icon: '⚾',
      name: 'MLB',
      subtitle: 'Major League Baseball'
    },
    {
      key: 'soccer',
      href: '/soccer.html',
      icon: '⚽',
      name: 'SOCCER',
      subtitle: 'World Football'
    },
    {
      key: 'horse',
      href: '/horse.html',
      icon: '🏇',
      name: 'HORSE RACING',
      subtitle: 'AI Racing Picks'
    },
    {
      key: 'ufc',
      href: '/ufc.html',
      icon: '🥊',
      name: 'UFC',
      subtitle: 'Fight Predictions'
    }
  ];

  function inferActiveSport() {
    const path = window.location.pathname.toLowerCase();

    if (path.includes('mlb')) return 'mlb';
    if (path.includes('soccer')) return 'soccer';
    if (path.includes('horse')) return 'horse';
    if (path.includes('ufc')) return 'ufc';

    return '';
  }

  function renderSportSwitcher(root) {
    const active = root.dataset.active || inferActiveSport();

    root.innerHTML = sports.map(sport => `
      <a
        class="sport-switcher-card ${active === sport.key ? 'is-active' : ''}"
        data-sport="${sport.key}"
        href="${sport.href}"
        aria-label="${sport.name} - ${sport.subtitle}"
      >
        <span class="sport-switcher-icon" aria-hidden="true">${sport.icon}</span>
        <span class="sport-switcher-copy">
          <span class="sport-switcher-name">${sport.name}</span>
          <span class="sport-switcher-subtitle">${sport.subtitle}</span>
        </span>
      </a>
    `).join('');
  }

  document.addEventListener('DOMContentLoaded', () => {
    document
      .querySelectorAll('.sport-switcher')
      .forEach(renderSportSwitcher);
  });
})();
