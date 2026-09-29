(() => {
  const root = document.documentElement;
  const sidebar = document.querySelector('#sidebar');
  const menuButton = document.querySelector('#menuButton');
  const themeButton = document.querySelector('#themeButton');
  const input = document.querySelector('#searchInput');
  const searchButton = document.querySelector('#searchButton');
  const searchHelp = document.querySelector('#searchHelp');
  const progressBar = document.querySelector('#progressBar');
  const progressText = document.querySelector('#progressText');
  const headings = [...document.querySelectorAll('.content > h1')];
  const progressKey = 'toby-study-progress-v1';

  const storedTheme = localStorage.getItem('toby-theme');
  if (storedTheme) root.dataset.theme = storedTheme;

  themeButton.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    localStorage.setItem('toby-theme', next);
  });

  menuButton.addEventListener('click', () => sidebar.classList.toggle('open'));
  document.querySelectorAll('.toc a').forEach(link => {
    link.addEventListener('click', () => sidebar.classList.remove('open'));
  });

  let done = new Set(JSON.parse(localStorage.getItem(progressKey) || '[]'));
  const updateProgress = () => {
    const total = headings.length || 1;
    const percentage = Math.round((done.size / total) * 100);
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `${percentage}%`;
    localStorage.setItem(progressKey, JSON.stringify([...done]));
  };

  headings.forEach(heading => {
    if (!heading.id) return;
    const button = document.createElement('button');
    button.className = `complete-button${done.has(heading.id) ? ' done' : ''}`;
    button.textContent = done.has(heading.id) ? '✓' : '○';
    button.title = '이 대단원 완료 표시';
    button.setAttribute('aria-label', `${heading.textContent} 완료 표시`);
    button.addEventListener('click', () => {
      if (done.has(heading.id)) done.delete(heading.id);
      else done.add(heading.id);
      button.classList.toggle('done');
      button.textContent = done.has(heading.id) ? '✓' : '○';
      updateProgress();
    });
    heading.appendChild(button);
  });
  updateProgress();

  const tocLinks = [...document.querySelectorAll('.toc a')];
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    tocLinks.forEach(link => {
      const show = !query || link.textContent.toLowerCase().includes(query);
      link.closest('li').classList.toggle('hidden', !show);
    });
    searchHelp.textContent = query ? '목차를 걸러냈습니다. Enter로 본문 검색.' : 'Enter를 누르면 본문에서 찾습니다.';
  });

  const findInBody = () => {
    document.querySelectorAll('.search-hit').forEach(node => node.classList.remove('search-hit'));
    const query = input.value.trim().toLowerCase();
    if (!query) return;
    const candidates = [...document.querySelectorAll('.content h1, .content h2, .content h3, .content p, .content li')];
    const found = candidates.find(node => node.textContent.toLowerCase().includes(query));
    if (found) {
      found.classList.add('search-hit');
      found.scrollIntoView({ behavior: 'smooth', block: 'center' });
      searchHelp.textContent = '본문에서 첫 결과를 찾았습니다.';
    } else {
      searchHelp.textContent = '검색 결과가 없습니다.';
    }
  };
  input.addEventListener('keydown', event => { if (event.key === 'Enter') findInBody(); });
  searchButton.addEventListener('click', findInBody);

  const linkMap = {
    '00-learning-map.md': '전체-지도-코드-한-덩어리가-스프링-설계로-변하는-과정',
    '01-prerequisites.md': '선수지식-아무-배경-없이-시작하기',
    '02-volume1-core.md': '1권-핵심-해설-문제를-해결하며-스프링에-도착하기',
    '03-volume2-aop-test.md': '2권-보충-aopltw테스트-컨텍스트',
    '04-recall-workbook.md': '회상-워크북',
    '05-glossary.md': '초심자-용어-사전',
    '06-study-log.md': '실제-학습-계획과-기록지'
  };
  document.querySelectorAll('a[href$=".md"]').forEach(link => {
    const file = link.getAttribute('href').split('/').pop();
    if (linkMap[file]) link.setAttribute('href', `#${linkMap[file]}`);
  });

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      tocLinks.forEach(link => link.classList.toggle('active', link.hash === `#${entry.target.id}`));
    });
  }, { rootMargin: '-15% 0px -75%' });
  document.querySelectorAll('.content h1, .content h2').forEach(h => observer.observe(h));

  document.querySelector('#toTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
})();
