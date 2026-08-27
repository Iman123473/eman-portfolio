/* ============================================================
   app.js — wires the page to the world: scroll progress,
   chapter navigation, reveal animations, loader.
   ============================================================ */

(function () {
  const sections = Array.from(document.querySelectorAll('main section[data-chapter]'));
  const nav = document.getElementById('chapterNav');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------
  // Top navbar: smooth scroll + mobile toggle
  // ---------------------------------------------------------
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
    navLinks.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => navLinks.classList.remove('open'));
    });
  }

  // ---------------------------------------------------------
  // Build chapter nav (diamond markers)
  // ---------------------------------------------------------
  sections.forEach((sec) => {
    const btn = document.createElement('button');
    btn.innerHTML = `<span class="mark"></span><span class="label">${sec.dataset.chapter}</span>`;
    btn.addEventListener('click', () => {
      sec.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    });
    btn.dataset.target = sec.id;
    nav.appendChild(btn);
  });
  const navButtons = Array.from(nav.children);

  const activeObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const idx = sections.indexOf(entry.target);
        if (entry.isIntersecting) {
          navButtons.forEach((b) => b.classList.remove('active'));
          navButtons[idx].classList.add('active');
        }
      });
    },
    { threshold: 0.5 }
  );
  sections.forEach((s) => activeObserver.observe(s));

  // ---------------------------------------------------------
  // Scroll progress -> WorldScene
  // ---------------------------------------------------------
  function computeProgress() {
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - window.innerHeight;
    return scrollable > 0 ? window.scrollY / scrollable : 0;
  }

  function onScroll() {
    if (window.WorldScene) window.WorldScene.setProgress(computeProgress());
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------------------------------------------------------
  // GSAP reveals
  // ---------------------------------------------------------
  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);

    const scrollReveals = Array.from(document.querySelectorAll('.reveal')).filter(
      (el) => !el.closest('#hero')
    );
    scrollReveals.forEach((el, i) => {
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: reduceMotion ? 0.01 : 1.1,
        ease: 'power3.out',
        delay: reduceMotion ? 0 : (i % 6) * 0.06,
        scrollTrigger: {
          trigger: el,
          start: 'top 88%',
          toggleActions: 'play none none reverse',
        },
      });
    });

    // hero plays immediately on load rather than waiting for scroll trigger
    gsap.utils.toArray('#hero .reveal').forEach((el, i) => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 36 },
        { opacity: 1, y: 0, duration: 1.2, ease: 'power3.out', delay: 0.3 + i * 0.12 }
      );
    });
  } else {
    // fallback: just show everything
    document.querySelectorAll('.reveal').forEach((el) => {
      el.style.opacity = 1;
      el.style.transform = 'none';
    });
  }

  // ---------------------------------------------------------
  // Contact form -> Web3Forms (sends straight to your inbox)
  // ---------------------------------------------------------
  const form = document.getElementById('contactForm');
  const status = document.getElementById('formStatus');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const key = form.querySelector('[name="access_key"]').value;
      const submitBtn = form.querySelector('.form-submit');

      if (!key || key === 'YOUR_ACCESS_KEY_HERE') {
        status.textContent = 'This form needs a Web3Forms access key — see the code comment above the form.';
        status.classList.add('error');
        return;
      }

      submitBtn.disabled = true;
      status.classList.remove('error');
      status.textContent = 'Sending…';

      try {
        const formData = new FormData(form);
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: formData,
        });
        const result = await res.json();
        if (result.success) {
          status.textContent = 'Message sent — thank you! I\u2019ll get back to you soon.';
          form.reset();
        } else {
          status.textContent = 'Something went wrong. Please try again or email me directly.';
          status.classList.add('error');
        }
      } catch (err) {
        status.textContent = 'Network error — please try again or email me directly.';
        status.classList.add('error');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  // ---------------------------------------------------------
  // Loader
  // ---------------------------------------------------------
  const loader = document.getElementById('loader');
  const minShow = 900;
  const started = performance.now();
  window.addEventListener('load', () => {
    const elapsed = performance.now() - started;
    const wait = Math.max(0, minShow - elapsed);
    setTimeout(() => loader.classList.add('hidden'), wait);
  });
  // safety net in case 'load' never fires cleanly
  setTimeout(() => loader.classList.add('hidden'), 3500);
})();
