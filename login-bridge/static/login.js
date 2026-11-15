const DEFAULT_TEST_PASSWORD = "PortalLmrei2026!";

async function handleFormSubmit(event) {
  event.preventDefault();
  const username = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value;
  await performLogin(username, password);
}

async function quickLogin(username) {
  const userField = document.getElementById('usernameInput');
  const passField = document.getElementById('passwordInput');
  if (userField) userField.value = username;
  if (passField) passField.value = DEFAULT_TEST_PASSWORD;
  await performLogin(username, DEFAULT_TEST_PASSWORD);
}

async function performLogin(username, password) {
  const alertBox = document.getElementById('alertBox');
  const submitBtn = document.getElementById('submitBtn');
  const btnText = submitBtn ? submitBtn.querySelector('.btn-text') : null;
  const btnSpinner = submitBtn ? submitBtn.querySelector('.btn-spinner') : null;

  if (alertBox) alertBox.classList.add('hidden');
  if (btnText) btnText.textContent = "Mengautentikasi...";
  if (btnSpinner) btnSpinner.classList.remove('hidden');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonPayload(username, password)
    });

    const data = await res.json();
    if (res.ok && data.success) {
      if (btnText) btnText.textContent = "Berhasil! Mengalihkan...";
      
      // Store in localStorage as well for local cross-origin bridge support if needed
      if (data.user) {
        localStorage.setItem('portal_user', JSON.stringify(data.user));
      }
      
      const targetUrl = data.redirectUrl || 'https://user-shell-app.lmrei.id';
      setTimeout(() => {
        window.location.href = targetUrl;
      }, 400);
    } else {
      showError(data.message || data.error || "Gagal masuk. Periksa kembali username dan password.");
    }
  } catch (err) {
    console.error("Login fetch error:", err);
    showError("Terjadi kesalahan jaringan saat menghubungi SSO Bridge.");
  } finally {
    if (btnText && (!btnText.textContent.startsWith("Berhasil"))) {
      btnText.textContent = "Masuk ke Portal";
    }
    if (btnSpinner) btnSpinner.classList.add('hidden');
    if (submitBtn) submitBtn.disabled = false;
  }
}

function jsonPayload(u, p) {
  return JSON.stringify({ email: u, password: p });
}

function showError(msg) {
  const alertBox = document.getElementById('alertBox');
  if (alertBox) {
    alertBox.textContent = msg;
    alertBox.classList.remove('hidden');
  } else {
    alert(msg);
  }
}
