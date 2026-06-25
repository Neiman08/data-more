(function () {
  function readUser() {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }

  function getDisplayName(user) {
    if (!user) return 'User';
    return user.nombre || (user.email ? user.email.split('@')[0] : 'User');
  }

  function getPlanLabel(user) {
    return user && user.proActivo ? 'PRO ACTIVE' : 'FREE';
  }

  function injectAuthHeaderStyles() {
    if (document.getElementById('authHeaderStyles')) return;

    const style = document.createElement('style');
    style.id = 'authHeaderStyles';
    style.textContent = `
      .auth-user-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: #fff;
        font-size: 12px;
        font-weight: 800;
        white-space: nowrap;
      }

      .auth-plan {
        color: var(--green, #6bff19);
        font-size: 10px;
        font-weight: 900;
        letter-spacing: .5px;
      }

      .btn-logout {
        background: #ef4444;
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 8px 18px;
        font-size: 12px;
        font-weight: 900;
        cursor: pointer;
      }

      .btn-logout:hover {
        filter: brightness(1.08);
      }
    `;

    document.head.appendChild(style);
  }

  function renderAuthHeader() {
    const container =
      document.getElementById('headerActions') ||
      document.querySelector('.header-actions');

    if (!container) return;

    injectAuthHeaderStyles();

    const user = readUser();

    if (!user) {
      container.innerHTML = `
        <a href="login.html" class="btn-login">LOG IN</a>
        <a href="registro.html" class="btn-reg">SIGN UP</a>
      `;
      return;
    }

    container.innerHTML = `
      <span class="auth-user-chip">
        👤 ${getDisplayName(user)}
        <span class="auth-plan">${getPlanLabel(user)}</span>
      </span>
      <button class="btn-logout" type="button" data-auth-logout>LOG OUT</button>
    `;
  }

  function logout() {
    localStorage.removeItem('user');
    window.location.href = 'index.html';
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-auth-logout]')) {
      logout();
    }
  });

  document.addEventListener('DOMContentLoaded', renderAuthHeader);

  window.renderAuthHeader = renderAuthHeader;
  window.logout = logout;
})();
