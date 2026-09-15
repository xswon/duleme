(() => {
  const app = document.querySelector('.app-window');
  const params = new URLSearchParams(window.location.search);
  const stateButtons = [...document.querySelectorAll('.state-button')];
  const storyRows = [...document.querySelectorAll('.story-row')];
  const timelineList = document.querySelector('.timeline-list');
  const toolPage = document.querySelector('.tool-page');
  const toolDetail = document.querySelector('.tool-detail');
  const selectedContent = document.querySelector('.selected-content');
  const articleContent = document.querySelector('.article-content');
  const emptyContent = document.querySelector('.empty-content');
  const mobilePreview = document.querySelector('.mobile-preview');
  const mobileStories = [...document.querySelectorAll('.mobile-story')];
  const audioCard = document.querySelector('.audio-card-compact');
  const folderDialog = document.querySelector('.folder-dialog');
  const folderInput = document.querySelector('.folder-name-input');
  const folderError = document.querySelector('.dialog-error');
  const failurePanel = document.querySelector('.refresh-failure-panel');
  const settingsModal = document.querySelector('.settings-modal');
  const settingsModalBody = document.querySelector('.settings-modal-body');
  let scope = 'today';
  let contentFilter = 'all';
  let unreadOnly = false;
  let historyWindowDays = 30;
  const recentUnreadCounts = {
    today: params.get('test') === '99plus' ? '99+' : params.get('test') === 'zero-unread' ? '0' : '12',
    feed: params.get('test') === 'zero-unread' ? '0' : '3',
    folder: params.get('test') === 'zero-unread' ? '0' : '6',
    starred: '8',
  };
  let detail = params.get('view') === 'empty' ? 'empty' : 'selected';
  let tool = null;
  let selectedFolder = null;
  let mobileDetailOpen = false;
  let settingsOpen = false;
  let settingsTrigger = null;
  let bodyOverflowBeforeSettings = '';
  let bodyOverflowBeforeFolder = '';
  let toastTimer = null;
  let activePlaylistId = 'podcast';
  let playingPlaylistId = null;
  let playlistDetailId = null;
  let notesCount = 5;
  // Favorites are modelled per row via data-starred so the 收藏 scope can actually
  // empty out, and so "清空收藏" has something visible to clear.
  let starredCount = storyRows.filter((row) => row.dataset.starred === 'true').length;
  let playerStatus = ['loading', 'error'].includes(params.get('player')) ? params.get('player') : 'ready';
  let playerProgress = 28;
  let playlistSpeedIndex = 0;
  const playlistSpeeds = [1, 1.25, 1.5, 2];
  let audioPlaying = false;
  let audioProgress = 23;
  let audioCurrentSeconds = 522;
  let audioSpeedIndex = 0;
  const audioSpeeds = [1, 1.25, 1.5, 2];
  let playlistItems = [
    { id: 'podcast', title: '把注意力还给自己', source: '少数派', duration: '42 分钟', endTime: '42:16', remaining: '31 分钟', time: '12 分钟前', cover: '低噪音<br />信息饮食' },
    { id: 'diary', title: 'Vol. 118：我们为什么还在写日记？', source: '单读', duration: '36 分钟', endTime: '36:08', remaining: '36 分钟', time: '8 月 31 日', cover: '写下<br />今天' },
    { id: 'signal', title: '如何在噪声中保留信号', source: '少数派播客', duration: '28 分钟', endTime: '28:42', remaining: '28 分钟', time: '8 月 29 日', cover: '保留<br />信号' },
  ];
  const scopeLabels = { today: '时间线', starred: '收藏', feed: '少数派', folder: '科技 · 商业' };

  const icon = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
  const paths = {
    headphones: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />',
    search: '<path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" />',
    play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />',
    pause: '<rect x="14" y="3" width="5" height="18" rx="1" /><rect x="5" y="3" width="5" height="18" rx="1" />',
    close: '<path d="m6 6 12 12M18 6 6 18" />',
    trash: '<path d="M10 11v6M14 11v6M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />',
    // Lucide Eraser: "wipe the trace", i.e. a recoverable clear (queue / favorites),
    // as opposed to Trash2 which means an irreversible delete (notes).
    eraser: '<path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21" /><path d="m5.082 11.09 8.828 8.828" />',
    sparkle: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" />',
    fileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4M8 13h8M8 17h6" />',
    // Lucide AudioLines: standard vertical waveform bars for the transcript tab.
    audioLines: '<path d="M2 10v3" /><path d="M6 6v11" /><path d="M10 3v18" /><path d="M14 8v7" /><path d="M18 5v13" /><path d="M22 10v3" />',
    settings: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" />',
  };

  const articleSources = ['少数派', '晚点 LatePost', '极客公园', '单读', '单读'];
  storyRows.forEach((row, index) => {
    row.dataset.contentType = row.querySelector('.story-audio-meta') ? 'audio' : 'article';
    row.dataset.source = articleSources[index] || '少数派';
  });

  // Product-review enhancements: clearer timeline semantics, stable metadata,
  // content-type filtering, reader preferences and a persistent collapsed rail.
  const panelIcon = '<path d="M4 4h16v16H4z" /><path d="M9 4v16" />';
  const brand = document.querySelector('.brand-inline');
  if (brand) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'panel-toggle';
    toggle.dataset.action = 'toggle-sidebar';
    toggle.title = '收起边栏';
    toggle.setAttribute('aria-label', '收起边栏');
    toggle.innerHTML = icon(panelIcon);
    brand.prepend(toggle);
  }
  const prototypeNote = document.querySelector('.prototype-note');
  if (prototypeNote) {
    const railPreview = document.createElement('button');
    railPreview.type = 'button';
    railPreview.className = 'rail-preview-button';
    railPreview.dataset.action = 'toggle-sidebar';
    railPreview.textContent = '边栏细条';
    prototypeNote.before(railPreview);
  }
  document.querySelector('.nav-today > span:nth-child(2)')?.replaceChildren(document.createTextNode('时间线'));
  document.querySelector('.nav-unread')?.remove();
  const subscriptionHeading = document.querySelector('.subscription-heading');
  const toolsHeading = document.querySelector('.tools-heading');
  const primaryTools = [...document.querySelectorAll('.sidebar-scroll > .tool-nav')];
  const audioTool = document.querySelector('.sidebar-scroll > [data-tool="playlist"]');
  audioTool?.querySelector(':scope > span:nth-child(2)')?.replaceChildren(document.createTextNode('音频'));
  // Audio, notes and search are primary navigation peers directly below Favorites.
  // Keep Settings in the footer; there is no separate "Tools" section label.
  toolsHeading?.remove();
  const starredNav = document.querySelector('.sidebar-scroll > .nav-starred');
  if (starredNav) starredNav.after(...primaryTools);
  document.querySelector('.mobile-appbar strong')?.replaceChildren(document.createTextNode('时间线'));
  document.querySelectorAll('.drawer-group button').forEach((button) => {
    if (button.closest('.mobile-drawer')) {
      const label = button.textContent.trim();
      if (label.startsWith('今天')) button.dataset.scope = 'today';
      if (label.startsWith('收藏')) button.dataset.scope = 'starred';
      if (label.startsWith('播放列表')) button.dataset.tool = 'playlist';
      if (label.startsWith('笔记')) button.dataset.tool = 'notes';
      if (label === '搜索') button.dataset.tool = 'search';
      if (label === '设置') button.dataset.tool = 'settings';
      if (label === '刷新订阅源') button.dataset.action = 'refresh';
    }
    if (button.firstChild?.nodeType === Node.TEXT_NODE && button.firstChild.textContent.trim() === '今天') {
      button.firstChild.textContent = '时间线 ';
    }
    if (button.dataset.scope === 'unread' || button.textContent.trim().startsWith('未读')) button.remove();
    if (button.dataset.tool === 'playlist' || button.textContent.trim().startsWith('播放列表')) {
      const count = button.querySelector('b')?.outerHTML || '';
      button.innerHTML = `音频 ${count}`;
    }
  });
  document.querySelectorAll('.sidebar-drawer, .mobile-drawer').forEach((drawer) => {
    const groups = [...drawer.querySelectorAll(':scope > .drawer-group')];
    const readingGroup = groups.find((group) => group.querySelector(':scope > span')?.textContent.trim() === '阅读');
    const toolsGroup = groups.find((group) => group.querySelector(':scope > span')?.textContent.trim() === '工具');
    if (readingGroup && toolsGroup) {
      // Match the desktop hierarchy: the three primary tools follow Favorites.
      const primaryDrawerTools = [...toolsGroup.querySelectorAll(':scope > button[data-tool="playlist"], :scope > button[data-tool="notes"], :scope > button[data-tool="search"]')];
      const starredButton = readingGroup.querySelector(':scope > button[data-scope="starred"]');
      if (starredButton) starredButton.after(...primaryDrawerTools);
      toolsGroup.querySelector(':scope > span')?.remove();
      if (!toolsGroup.querySelector(':scope > button')) toolsGroup.remove();
    }
  });

  const toolbarContext = document.querySelector('.toolbar-context');
  const timelineWindow = document.createElement('span');
  timelineWindow.className = 'timeline-window';
  timelineWindow.textContent = '最近 30 天';
  toolbarContext?.append(timelineWindow);

  const filterBar = document.createElement('div');
  filterBar.className = 'timeline-filter';
  filterBar.setAttribute('aria-label', '时间线筛选');
  filterBar.innerHTML = `<div class="timeline-filter-segment" role="tablist" aria-label="内容类型"><button class="is-active" role="tab" aria-selected="true" data-action="content-filter" data-filter="all">全部</button><button role="tab" aria-selected="false" data-action="content-filter" data-filter="article">文章</button><button role="tab" aria-selected="false" data-action="content-filter" data-filter="audio">播客</button></div><button type="button" class="timeline-unread-filter" data-action="unread-filter" aria-pressed="false"><span>仅看未读</span><b>12</b></button>`;
  timelineList?.before(filterBar);

  const loadMore = document.querySelector('.timeline-load-more');
  if (loadMore) {
    loadMore.querySelector('span')?.remove();
    const button = loadMore.querySelector('button');
    button.dataset.action = 'load-older';
    button.textContent = '继续加载 30 天';
  }

  storyRows.forEach((row) => {
    const main = row.querySelector('.story-main');
    const heading = main?.querySelector('h2');
    if (!main || !heading) return;
    const meta = document.createElement('div');
    meta.className = 'story-source-meta';
    meta.innerHTML = `<span class="unread-dot" aria-label="${row.dataset.unread === 'true' ? '未读' : '已读'}"></span><span>${row.dataset.source}</span>`;
    main.insertBefore(meta, heading);
    row.title = `${row.dataset.source} · ${heading.textContent.trim()}`;
  });

  const emptyIcon = document.querySelector('.empty-content .empty-icon');
  if (emptyIcon) emptyIcon.innerHTML = '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22.5z" /><path d="M4 4.5v18" /><path d="M8 7h8M8 11h7" />';

  const readerTopbar = document.querySelector('.topbar-reader');
  if (readerTopbar) {
    const popover = document.createElement('div');
    popover.className = 'reader-settings-popover';
    popover.hidden = true;
    popover.innerHTML = `<strong>阅读设置</strong><label>字号 <span><button aria-label="减小字号">A</button><button class="is-selected" aria-label="标准字号">A</button><button aria-label="增大字号">A</button></span></label><label>行距 <span><button>1.5</button><button class="is-selected">1.8</button><button>2.0</button></span></label><label>版心 <span><button>紧凑</button><button class="is-selected">标准</button><button>宽松</button></span></label><label>主题 <span class="theme-swatches"><button class="theme-light is-selected" aria-label="浅色"></button><button class="theme-paper" aria-label="米黄"></button><button class="theme-dark" aria-label="深色"></button></span></label>`;
    readerTopbar.append(popover);
  }

  const mobileTabbar = document.querySelector('.mobile-tabbar');
  if (mobileTabbar) {
    mobileTabbar.innerHTML = `<button class="is-active">${icon('<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2" />')}<small>时间线</small></button><button>${icon(paths.search)}<small>搜索</small></button><button>${icon('<path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z" />')}<small>收藏</small></button><button>${icon('<circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />')}<small>更多</small></button>`;
  }
  // Runs before the labels below are captured: both the accessible name and the hover
  // hint are derived from the visible text, so a rename has to land first or they go stale.
  if (params.get('test') === 'long-name') document.querySelector('.feed-primary .feed-name').textContent = '这是一个很长很长的订阅源名称示例';
  // Navigation that renders its own text label needs an accessible name but no hover
  // hint — repeating the visible label tells the user nothing. That holds for the whole
  // sidebar, subscription tree included: 订阅源 / 文件夹 names are short enough to read
  // in place, so the tree gets aria-label only (screen readers still announce it) and
  // never a floating hint.
  document.querySelectorAll('.nav-item,.footer-action').forEach((button) => {
    const label = button.querySelector('.feed-name')?.textContent
      || button.querySelector('strong')?.textContent
      || [...button.querySelectorAll(':scope > span')].find((span) => !span.classList.contains('nav-leading') && !span.classList.contains('nav-count'))?.textContent
      || button.textContent;
    if (!label?.trim()) return;
    button.setAttribute('aria-label', label.trim());
  });

  const settingsIcon = document.querySelector('.footer-settings-icon');
  if (settingsIcon) settingsIcon.innerHTML = paths.settings;
  document.querySelectorAll('.story-audio-meta').forEach((meta) => {
    const duration = meta.querySelector('span');
    const headphone = meta.querySelector('svg');
    if (headphone) headphone.innerHTML = paths.headphones;
    if (duration) duration.textContent = ({ '42m': '42 分钟', '36m': '36 分钟' })[duration.textContent] || duration.textContent;
  });
  document.querySelectorAll('.story-time time,.mobile-story-time time').forEach((time) => {
    time.textContent = ({ '12m': '12 分钟前', '46m': '46 分钟前', '1d': '1 天前', 'Aug 31': '8 月 31 日' })[time.textContent] || time.textContent;
  });

  const formatAudioTime = (seconds) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.round(seconds % 60).toString().padStart(2, '0')}`;
  const syncAudioCard = () => {
    if (!audioCard) return;
    const duration = Number(audioCard.dataset.audioDuration) || 2536;
    const progress = audioCard.querySelector('.audio-progress');
    const fill = progress?.querySelector('i');
    const currentTime = Math.max(0, Math.min(duration, audioCurrentSeconds));
    if (fill) fill.style.width = `${audioProgress}%`;
    if (progress) progress.setAttribute('aria-valuenow', String(audioProgress));
    const times = audioCard.querySelectorAll('.audio-times span');
    if (times[0]) times[0].textContent = formatAudioTime(currentTime);
    if (times[1]) times[1].textContent = formatAudioTime(duration);
    const playButton = audioCard.querySelector('.audio-play-btn');
    if (playButton) {
      playButton.innerHTML = icon(audioPlaying ? paths.pause : paths.play);
      playButton.title = audioPlaying ? '暂停' : '播放';
      playButton.setAttribute('aria-label', playButton.title);
    }
    const seekBack = audioCard.querySelector('[data-action="seek-backward"]');
    const seekForward = audioCard.querySelector('[data-action="seek-forward"]');
    [[seekBack, '后退 15 秒', '-'], [seekForward, '快进 30 秒', '+']].forEach(([button, label, value]) => {
      if (!button) return;
      button.title = label; button.setAttribute('aria-label', label);
      const sign = button.querySelector('svg path:last-child');
      if (sign) sign.setAttribute('d', value === '-' ? 'M9 12h6' : 'M12 8v8M9 12h6');
    });
    audioCard.classList.toggle('is-playing', audioPlaying);
    const speedButton = audioCard.querySelector('.audio-speed-btn');
    if (speedButton) speedButton.textContent = `${audioSpeeds[audioSpeedIndex]}x`;
  };

  /* Capsule toolbar is now inline in HTML — no cloning needed */
  const audioTabs = [...(selectedContent?.querySelectorAll('.reader-tab') || [])];
  const audioArticleCopy = selectedContent?.querySelector('.article-copy');
  const audioArticleSource = selectedContent?.querySelector('.reader-source');
  let activeAudioTab = 'content';
  let localTranscriptProcessing = false;
  const setTabLabel = (tab, label) => {
    [...tab.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).forEach((node) => node.remove());
    tab.append(document.createTextNode(label));
  };
  const insightMarkup = (highlight, deepSummary) => `<div class="audio-insight-layout"><section class="audio-highlight-body">${highlight}</section><button type="button" class="audio-deep-summary-toggle" data-action="toggle-deep-summary" aria-expanded="false"><span>展开深度精华</span>${icon('<path d="m6 9 6 6 6-6" />')}</button><section class="audio-deep-summary" hidden>${deepSummary}</section></div>`;
  const audioInsightMarkup = () => {
    if (params.get('podcastAi') === 'empty') {
      return localTranscriptProcessing
        ? '<div class="audio-insight-empty" role="status">本机正在生成逐字稿 · 36%…</div>'
        : '<div class="audio-insight-empty"><p>只在你点击后使用本机 NextEcho 转录，不会自动调用 AI。</p><button type="button" data-action="start-local-transcript">使用本机生成逐字稿</button></div>';
    }
    return insightMarkup('<p>建立低噪音的信息饮食，关键不是减少所有输入，而是主动选择长期信任的信息源。</p><ul><li>把订阅源当作可持续维护的阅读边界。</li><li>让工具负责收集，自己保留判断和取舍。</li><li>定期清理不再阅读的来源，为重要主题留出空间。</li></ul>', '<p>本期从信息过载的日常体验出发，讨论如何通过更明确的订阅边界，降低无效输入带来的注意力消耗。重点不是追求清空所有未读，而是建立一套能够长期维护的选择机制。</p><p>节目进一步建议把收集、阅读与行动分开：工具可以帮助记忆和归档，但理解、取舍以及下一步行动仍应由读者完成。</p>');
  };
  const renderAudioTab = (name) => {
    if (!selectedContent || !audioArticleCopy || !audioArticleSource) return;
    activeAudioTab = name;
    audioTabs.filter((tab) => tab.isConnected).forEach((tab) => {
      const active = tab.dataset.readerTab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.setAttribute('tabindex', active ? '0' : '-1');
    });
    audioArticleCopy.hidden = name !== 'content';
    audioArticleSource.hidden = name !== 'content';
    selectedContent.querySelectorAll('.audio-tab-panel').forEach((panel) => { panel.hidden = panel.dataset.readerPanel !== name; });
    const insightPanel = selectedContent.querySelector('[data-reader-panel="ai"]');
    if (name === 'ai' && insightPanel) insightPanel.innerHTML = audioInsightMarkup();
  };
  if (audioTabs.length === 5 && audioArticleCopy && audioArticleSource) {
    const tabNames = ['content', 'ai', 'digest', 'transcript', 'notes'];
    audioTabs.forEach((tab, index) => { tab.dataset.readerTab = tabNames[index]; });
    setTabLabel(audioTabs[0], '正文');
    audioTabs[0].querySelector('svg').innerHTML = paths.fileText;
    setTabLabel(audioTabs[1], 'AI 摘要');
    audioTabs[1].querySelector('svg').innerHTML = paths.sparkle;
    audioTabs[2].remove();
    audioTabs[3].querySelector('svg').innerHTML = paths.audioLines;
    audioTabs[3].dataset.readerTab = 'transcript';
    audioTabs[4].dataset.readerTab = 'notes';
    audioTabs.filter((tab) => tab.isConnected).forEach((tab) => {
      tab.setAttribute('role', 'tab');
      tab.addEventListener('click', () => renderAudioTab(tab.dataset.readerTab));
    });
    audioArticleSource.insertAdjacentHTML('beforebegin', `<section class="audio-tab-panel" data-reader-panel="ai" hidden></section><section class="audio-tab-panel audio-transcript-panel" data-reader-panel="transcript" hidden><p><button type="button" class="transcript-time">08:42</button>真正重要的不是订阅数量，而是你能否持续判断哪些内容值得进入自己的注意力。</p><p><button type="button" class="transcript-time">16:20</button>工具负责收集与定位，理解和取舍依然应该留给自己。</p></section><section class="audio-tab-panel audio-notes-panel" data-reader-panel="notes" hidden><article><strong>给信息留出判断空间</strong><p>订阅不是阅读的终点，整理之后还需要形成自己的结论。</p></article><article><strong>定期清理信息源</strong><p>为真正关心的主题留下稳定空间。</p></article></section>`);
    renderAudioTab('content');
  }

  const renderPlaylistMarkup = () => {
    const active = playlistItems.find((item) => item.id === activePlaylistId) || playlistItems[0];
    const isPlaying = active && playingPlaylistId === active.id;
    const playerIcon = playerStatus === 'loading' ? '<span class="playlist-spinner player-spinner" aria-hidden="true"></span>' : playerStatus === 'error' ? icon('<path d="M12 8v5M12 17h.01" /><circle cx="12" cy="12" r="9" />') : icon(isPlaying ? paths.pause : paths.play);
    return `<div class="playlist-player${active ? '' : ' is-empty'}${playerStatus === 'error' ? ' is-error' : ''}"><div class="playlist-player-main"><div class="playlist-player-cover">低噪音<br />信息饮食</div><div class="playlist-player-body"><div class="playlist-player-copy"><strong>${active?.title || '播放列表为空'}</strong><span>${active?.source || '从音频文章添加节目'}</span></div><div class="playlist-timeline"><div class="playlist-progress player-track" data-action="seek-playlist" role="slider" aria-label="播放进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${playerProgress}" tabindex="0"><i style="width:${playerProgress}%"></i></div><div class="playlist-times player-times"><span>${active && playerProgress ? '11:48' : '00:00'}</span><span>${active?.endTime || '00:00'}</span></div>${playerStatus === 'error' ? '<button class="playlist-player-error" data-action="retry-player">播放失败，点击重试</button>' : ''}</div></div><div class="playlist-controls"><div class="playlist-primary-controls"><button class="player-icon-btn" data-action="playlist-previous" title="上一条" aria-label="上一条">${icon('<path d="M6 5v14M18 6l-9 6 9 6Z" />')}</button><button class="playlist-play player-toggle" data-action="toggle-playlist" data-playlist-id="${active?.id || ''}" title="${playerStatus === 'error' ? '重试播放' : isPlaying ? '暂停' : '播放'}" aria-label="${playerStatus === 'error' ? '重试播放' : isPlaying ? '暂停' : '播放'}" ${playerStatus === 'loading' ? 'disabled' : ''}>${playerIcon}</button><button class="player-icon-btn" data-action="playlist-next" title="下一条" aria-label="下一条">${icon('<path d="M18 5v14M6 6l9 6-9 6Z" />')}</button></div><button class="playlist-speed player-speed" data-action="cycle-playlist-speed" title="调整播放倍速" aria-label="播放倍速 ${playlistSpeeds[playlistSpeedIndex]} 倍">${playlistSpeeds[playlistSpeedIndex]}x</button></div></div></div><div class="playlist-list">${playlistItems.length ? playlistItems.map((item) => {
      const itemPlaying = playingPlaylistId === item.id;
      const activeClass = activePlaylistId === item.id ? ' is-active' : '';
      const viewedClass = playlistDetailId === item.id ? ' is-viewed' : '';
      return `<div class="playlist-row${activeClass}${viewedClass}"><button class="playlist-open" data-tool-item="${item.id}" data-playlist-id="${item.id}" title="查看文章：${item.title}"><span class="playlist-thumb cover-${item.id}">${item.cover}</span><span class="playlist-item-copy"><strong>${item.title} <span>｜${item.source}</span></strong><small>剩余 ${item.remaining} · ${item.time}</small></span></button><button class="playlist-row-play" data-action="toggle-playlist" data-playlist-id="${item.id}" title="${itemPlaying ? '暂停' : '播放'} ${item.title}" aria-label="${itemPlaying ? '暂停' : '播放'} ${item.title}">${icon(itemPlaying ? paths.pause : paths.play)}</button><button class="playlist-remove" data-action="delete-playlist-item" data-playlist-id="${item.id}" title="从播放列表删除" aria-label="从播放列表删除 ${item.title}">${icon(paths.trash)}</button></div>`;
    }).join('') : '<div class="playlist-empty"><strong>播放列表为空</strong><span>在音频文章中选择“加入播放列表”即可添加。</span></div>'}</div>`;
  };

  const toasts = [...document.querySelectorAll('.app-toast, .mobile-toast')];
  const hideToast = () => toasts.forEach((toast) => { toast.hidden = true; });
  const renderToast = (toast, type, message, actions = []) => {
    toast.className = `${toast.classList.contains('mobile-toast') ? 'mobile-toast' : 'app-toast'}${type === 'error' ? ' is-error' : ''}`;
    toast.replaceChildren();
    const label = document.createElement('span');
    label.textContent = message;
    toast.appendChild(label);
    actions.forEach(({ label: actionLabel, action, className = '' }) => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = actionLabel; button.className = className;
      button.addEventListener('click', action);
      toast.appendChild(button);
    });
    toast.hidden = false;
  };
  const showToast = (type, message, actions = []) => {
    window.clearTimeout(toastTimer);
    const allActions = [...actions, { label: '关闭', action: hideToast, className: 'toast-close' }];
    toasts.forEach((toast) => renderToast(toast, type, message, allActions));
    if (type === 'success' || type === 'info') toastTimer = window.setTimeout(hideToast, type === 'success' ? 3500 : 2600);
  };

  // ---- Hover hints -------------------------------------------------------
  // Until now the prototype relied on the native title attribute. The OS renders
  // those with a delay, they cannot be styled, they never appear in a screenshot,
  // and embedded webviews suppress them outright — so the hints looked "missing".
  // Now every titled control is migrated to data-tip and one singleton node is
  // positioned in JS, which also means scroll containers can never clip it.
  const tooltip = document.createElement('div');
  tooltip.className = 'app-tooltip';
  document.body.appendChild(tooltip);
  let tipAnchor = null;

  const hideTip = () => {
    tipAnchor = null;
    tooltip.classList.remove('is-visible');
  };
  const placeTip = (el) => {
    const rect = el.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(rect.left + rect.width / 2 - box.width / 2, window.innerWidth - box.width - margin));
    let top = rect.bottom + 8;
    if (top + box.height > window.innerHeight - margin) top = rect.top - box.height - 8;
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(Math.max(margin, top))}px`;
  };
  const showTip = (el) => {
    const text = el.dataset.tip;
    if (!text) { hideTip(); return; }
    tipAnchor = el;
    tooltip.textContent = text;
    tooltip.classList.add('is-visible');
    placeTip(el);
  };
  const nearestTip = (target) => (target && target.closest ? target.closest('[data-tip]') : null);
  // A hint is for a control whose meaning is not visible, so anything that already names
  // itself with text is skipped — 时间线 / 收藏 / 音频 / 笔记 / 搜索 / 设置 and every row in
  // the subscription tree would only have their own label echoed back at them. Story rows
  // are skipped too: a wide list row should not pop an instant floating card every time the
  // pointer crosses it.
  const HINTLESS = '.nav-item, .footer-action, .rail-preview-button';
  // Any title still present — static markup or a freshly rendered template — becomes a
  // data-tip. Native titles are always removed, so the OS tooltip can never double up.
  const migrateTitles = (root = document) => {
    root.querySelectorAll('[title]').forEach((el) => {
      if (el.matches(HINTLESS) || el.closest('.story-row, .mobile-story')) return;
      const text = el.getAttribute('title');
      if (!text) return;
      el.dataset.tip = text;
      if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', text);
      el.removeAttribute('title');
    });
  };
  // The collapsed rail hides every sidebar label, so those buttons stop naming themselves
  // and the hint becomes the only way to tell 时间线 / 收藏 / 音频 / 笔记 / 搜索 / 设置 apart.
  // Hints are therefore tied to the collapsed state rather than to the control type: same
  // button, hint only while its text is invisible. The rail toggle lives in the same
  // condition — it is icon-only in both states, and its wording flips with the state — so
  // it is labelled here too. Doing it in one place also fixes the ?sidebar=collapsed entry
  // path, where the static "收起边栏" used to survive into the collapsed rail.
  const syncRailState = () => {
    const collapsed = document.querySelector('.app-window')?.dataset.sidebarCollapsed === 'true';
    document.querySelectorAll('[data-action="toggle-sidebar"]').forEach((button) => {
      // The prototype-bar preview button carries its own text label; leave it alone.
      if (button.classList.contains('rail-preview-button')) return;
      button.classList.toggle('is-active', collapsed);
      button.dataset.tip = collapsed ? '展开边栏' : '收起边栏';
      button.setAttribute('aria-label', button.dataset.tip);
    });
    // Subscription-tree rows are excluded: the rail hides them outright rather than
    // shrinking them to an icon, so they can never be hovered in this state.
    document.querySelectorAll('.sidebar .nav-item:not(.feed-row):not(.folder-row), .sidebar .footer-action').forEach((el) => {
      const label = el.getAttribute('aria-label');
      if (collapsed && label) el.dataset.tip = label;
      else delete el.dataset.tip;
    });
  };
  document.addEventListener('mouseover', (event) => {
    const el = nearestTip(event.target);
    if (!el) { hideTip(); return; }
    if (el === tipAnchor) return;
    showTip(el);
  });
  document.addEventListener('mouseout', (event) => {
    const el = nearestTip(event.target);
    if (!el) return;
    if (event.relatedTarget && el.contains(event.relatedTarget)) return;
    hideTip();
  });
  document.addEventListener('focusin', (event) => { const el = nearestTip(event.target); if (el) showTip(el); });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('click', hideTip);
  window.addEventListener('scroll', hideTip, true);

  const closeDrawer = () => { app.dataset.drawerOpen = 'false'; document.querySelectorAll('.sidebar-drawer, .sidebar-drawer-backdrop').forEach((node) => { node.hidden = true; }); };
  const openDrawer = () => { app.dataset.drawerOpen = 'true'; document.querySelectorAll('.sidebar-drawer, .sidebar-drawer-backdrop').forEach((node) => { node.hidden = false; }); };
  const setMobileDrawer = (open) => { if (mobilePreview) mobilePreview.dataset.drawerOpen = String(open); };

  const openSettings = (trigger = null) => {
    if (!settingsModal || !settingsModalBody || settingsOpen) return;
    settingsOpen = true;
    settingsTrigger = trigger;
    closeDrawer();
    setMobileDrawer(false);
    settingsModalBody.innerHTML = toolMarkup.settings;
    prepareSettingsPage(settingsModalBody.querySelector('.settings-page'));
    settingsModal.hidden = false;
    bodyOverflowBeforeSettings = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.dataset.settingsOpen = 'true';
    bindSettingsControls();
    syncState();
    settingsModal.querySelector('.settings-modal-close')?.focus();
  };
  const closeSettings = () => {
    if (!settingsOpen) return;
    settingsOpen = false;
    settingsModal.hidden = true;
    settingsModalBody.replaceChildren();
    document.body.style.overflow = bodyOverflowBeforeSettings;
    document.body.dataset.settingsOpen = 'false';
    syncState();
    settingsTrigger?.focus?.();
    settingsTrigger = null;
  };

  const toolMarkup = {
    notes: () => `<div class="tool-list notes-tool-list">${notesCount ? '<button class="tool-row is-selected" data-tool-item="note"><span class="tool-icon note-icon">' + icon('<path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />') + '</span><span><strong>给信息留出判断空间</strong><small>把注意力还给自己 · 今天</small></span><span class="tool-time">2 条</span></button><button class="tool-row" data-tool-item="note2"><span class="tool-icon note-icon">' + icon('<path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />') + '</span><span><strong>收集不是阅读的终点</strong><small>AI Agent 的下一站 · 昨天</small></span><span class="tool-time">1 条</span></button>' : '<div class="tool-empty">暂无笔记</div>'}</div>`,
    search: `<div class="tool-heading search-heading"><div><span class="eyebrow">工具</span><h2>搜索</h2><p>在全部订阅源中查找文章。</p></div></div><label class="search-box">${icon(paths.search)}<input type="search" placeholder="搜索文章、订阅源或关键词" value="${params.get('q') || ''}" /><kbd>⌘K</kbd></label><div class="search-results"><button class="tool-row is-selected" data-tool-item="result"><span class="tool-icon">${icon('<path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h4" />')}</span><span><strong>把注意力还给自己：一份低噪音信息饮食指南</strong><small>少数派 · 信息系统</small></span><span class="tool-time">12 分钟前</span></button><button class="tool-row" data-tool-item="result2"><span class="tool-icon">${icon('<path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h4" />')}</span><span><strong>AI Agent 的下一站，不是更聪明，而是更可靠</strong><small>晚点 LatePost · 产品</small></span><span class="tool-time">46 分钟前</span></button></div>`,
    settings: `<div class="settings-page"><div class="settings-page-heading"><span class="eyebrow">工作区</span><h2>设置</h2><p>管理订阅、文件夹与阅读辅助功能。</p></div><div class="settings-tabs" role="tablist" aria-label="设置分类"><button type="button" class="settings-tab is-active" role="tab" aria-selected="true" data-settings-tab="subscriptions">订阅管理</button><button type="button" class="settings-tab" role="tab" aria-selected="false" data-settings-tab="ai">AI 设置</button></div><section class="settings-panel" data-settings-panel="subscriptions" role="tabpanel"><div class="settings-toolbar"><div><strong>订阅与文件夹</strong><span>按文件夹管理 29 个订阅源</span></div><div class="settings-toolbar-actions"><button type="button" class="settings-button secondary" data-settings-action="import">导入 OPML</button><button type="button" class="settings-button" data-settings-action="add-feed">添加订阅</button><button type="button" class="settings-button" data-settings-action="new-folder">新建文件夹</button></div></div><div class="settings-filters"><label class="settings-search">${icon(paths.search)}<input type="search" placeholder="搜索订阅源" aria-label="搜索订阅源" data-settings-search /></label><label>订阅排序<select aria-label="订阅排序" data-settings-sort="feeds"><option>最近更新</option><option>名称 A–Z</option><option>自定义拖动</option></select></label><label>文件夹排序<select aria-label="文件夹排序" data-settings-sort="folders"><option>自定义拖动</option><option>名称 A–Z</option><option>订阅数量</option></select></label></div><div class="settings-groups" data-settings-groups><section class="settings-group" data-settings-group="科技"><div class="settings-group-heading"><button type="button" class="settings-group-toggle" data-folder-toggle aria-expanded="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg><span class="settings-folder-icon">${icon('<path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3Z" /><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2" />')}</span><strong>科技</strong><small>2 个订阅源</small></button><button type="button" class="settings-more" data-settings-menu="folder-tech" aria-label="科技文件夹更多操作" title="更多操作">${icon('<circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />')}</button><div class="settings-menu" data-settings-menu-popover="folder-tech" hidden><button type="button" data-settings-action="rename-folder">重命名</button><button type="button" data-settings-action="delete-folder">删除文件夹</button></div></div><div class="settings-group-rows"><div class="settings-feed-row" draggable="true" data-feed-name="少数派"><span class="settings-drag" title="拖动排序" aria-label="拖动排序">${icon('<path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01" />')}</span><span class="settings-feed-icon cyan">少</span><span class="settings-feed-copy"><strong>少数派</strong><small>sspai.com · 12 篇未读</small></span><button type="button" class="settings-more" data-settings-menu="feed-sspai" aria-label="少数派更多操作" title="更多操作">${icon('<circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />')}</button><div class="settings-menu" data-settings-menu-popover="feed-sspai" hidden><button type="button" data-settings-action="edit-feed">编辑订阅源</button><button type="button" data-settings-action="move-feed">移动到文件夹</button><button type="button" class="danger" data-settings-action="delete-feed">删除订阅源</button></div></div><div class="settings-feed-row" draggable="true" data-feed-name="少数派播客"><span class="settings-drag" title="拖动排序" aria-label="拖动排序">${icon('<path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01" />')}</span><span class="settings-feed-icon purple">播</span><span class="settings-feed-copy"><strong>少数派播客</strong><small>podcast.sspai.com · 4 篇未读</small></span><button type="button" class="settings-more" data-settings-menu="feed-podcast" aria-label="少数派播客更多操作" title="更多操作">${icon('<circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />')}</button><div class="settings-menu" data-settings-menu-popover="feed-podcast" hidden><button type="button" data-settings-action="edit-feed">编辑订阅源</button><button type="button" data-settings-action="move-feed">移动到文件夹</button><button type="button" class="danger" data-settings-action="delete-feed">删除订阅源</button></div></div></div></section><section class="settings-group" data-settings-group="商业"><div class="settings-group-heading"><button type="button" class="settings-group-toggle" data-folder-toggle aria-expanded="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg><span class="settings-folder-icon">${icon('<path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3Z" /><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2" />')}</span><strong>商业</strong><small>1 个订阅源</small></button><button type="button" class="settings-more" data-settings-menu="folder-business" aria-label="商业文件夹更多操作" title="更多操作">${icon('<circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />')}</button><div class="settings-menu" data-settings-menu-popover="folder-business" hidden><button type="button" data-settings-action="rename-folder">重命名</button><button type="button" data-settings-action="delete-folder">删除文件夹</button></div></div><div class="settings-group-rows"><div class="settings-feed-row" draggable="true" data-feed-name="晚点 LatePost"><span class="settings-drag" title="拖动排序" aria-label="拖动排序">${icon('<path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01" />')}</span><span class="settings-feed-icon orange">晚</span><span class="settings-feed-copy"><strong>晚点 LatePost</strong><small>later.com · 2 篇未读</small></span><button type="button" class="settings-more" data-settings-menu="feed-latepost" aria-label="晚点 LatePost 更多操作" title="更多操作">${icon('<circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />')}</button><div class="settings-menu" data-settings-menu-popover="feed-latepost" hidden><button type="button" data-settings-action="edit-feed">编辑订阅源</button><button type="button" data-settings-action="move-feed">移动到文件夹</button><button type="button" class="danger" data-settings-action="delete-feed">删除订阅源</button></div></div></div></section><section class="settings-group is-empty" data-settings-group="稍后整理"><div class="settings-group-heading"><button type="button" class="settings-group-toggle" data-folder-toggle aria-expanded="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg><span class="settings-folder-icon">${icon('<path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3Z" /><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2" />')}</span><strong>稍后整理</strong><small>0 个订阅源</small></button><button type="button" class="settings-more" data-settings-menu="folder-empty" aria-label="稍后整理文件夹更多操作" title="更多操作">${icon('<circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />')}</button><div class="settings-menu" data-settings-menu-popover="folder-empty" hidden><button type="button" data-settings-action="rename-folder">重命名</button><button type="button" data-settings-action="delete-folder">删除文件夹</button></div></div><p class="settings-empty-message">暂无订阅源，可从其他分组移动至此。</p></section></div></section><section class="settings-panel" data-settings-panel="ai" role="tabpanel" hidden><div class="settings-ai-card"><span class="settings-ai-icon">${icon(paths.sparkle)}</span><div><h3>AI 设置</h3><p>配置摘要、整理和失败重试偏好，保持阅读流程可控。</p></div></div><label class="settings-switch-row"><span><strong>在文章中显示 AI 摘要</strong><small>生成后在正文顶部展示摘要卡片</small></span><input type="checkbox" checked /></label><label class="settings-switch-row"><span><strong>允许自动整理订阅</strong><small>仅在你确认后移动或归档订阅源</small></span><input type="checkbox" /></label></section></div>`,
  };

  const prepareSettingsPage = (page) => {
    if (!page) return;
    page.querySelector('.settings-page-heading')?.remove();
    page.querySelectorAll('.settings-feed-row').forEach((row) => {
      const detail = row.querySelector('.settings-feed-copy small');
      if (detail) detail.textContent = detail.textContent.split(' · ')[0];
      row.querySelector('.settings-more')?.remove();
      row.querySelector('.settings-menu')?.remove();
      const actions = document.createElement('span');
      actions.className = 'settings-feed-actions';
      actions.innerHTML = `<button type="button" data-settings-action="edit-feed" aria-label="编辑订阅源" title="编辑订阅源">${icon(paths.pencil)}</button><button type="button" class="danger" data-settings-action="delete-feed" aria-label="删除订阅源" title="删除订阅源">${icon(paths.trash)}</button>`;
      row.append(actions);
    });
    const aiPanel = page.querySelector('[data-settings-panel="ai"]');
    if (aiPanel) aiPanel.innerHTML = `<section class="settings-ai-config" aria-labelledby="prototype-ai-settings-title"><div class="settings-ai-heading"><h3 id="prototype-ai-settings-title">AI 整理</h3><p>配置生成播客摘要与内容精华时使用的服务。音频转录仍在本机完成。</p></div><div class="settings-ai-fields"><label>服务地址<input aria-label="Base URL" type="url" placeholder="服务地址" /></label><label>模型<input aria-label="模型" type="text" placeholder="模型名称" /></label><label>API Key<input aria-label="API Key" type="password" autocomplete="off" placeholder="尚未配置" /></label><p class="settings-ai-status" role="status">状态：未配置</p></div><div class="settings-ai-actions"><button type="button" class="settings-button secondary" data-settings-action="test-ai">测试连接</button><button type="button" class="settings-button" data-settings-action="save-ai">保存设置</button></div></section>`;
  };

  const bindSettingsControls = () => {
    const page = settingsModalBody?.querySelector('.settings-page') || toolPage?.querySelector('.settings-page');
    if (!page || page.dataset.bound === 'true') return;
    page.dataset.bound = 'true';
    page.querySelectorAll('[data-settings-tab]').forEach((tab) => tab.addEventListener('click', () => {
      const target = tab.dataset.settingsTab;
      page.querySelectorAll('[data-settings-menu-popover]').forEach((menu) => { menu.hidden = true; });
      page.querySelectorAll('[data-settings-tab]').forEach((item) => { const active = item === tab; item.classList.toggle('is-active', active); item.setAttribute('aria-selected', String(active)); });
      page.querySelectorAll('[data-settings-panel]').forEach((panel) => { panel.hidden = panel.dataset.settingsPanel !== target; });
    }));
    page.querySelectorAll('[data-folder-toggle]').forEach((toggle) => toggle.addEventListener('click', () => {
      const group = toggle.closest('.settings-group');
      const collapsed = group.classList.toggle('is-collapsed');
      toggle.setAttribute('aria-expanded', String(!collapsed));
    }));
    page.querySelectorAll('[data-settings-menu]').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation();
      const target = button.dataset.settingsMenu;
      page.querySelectorAll('[data-settings-menu-popover]').forEach((menu) => { menu.hidden = menu.dataset.settingsMenuPopover !== target || !menu.hidden; });
    }));
    page.querySelector('[data-settings-search]')?.addEventListener('input', (event) => {
      const query = event.target.value.trim().toLowerCase();
      page.querySelectorAll('.settings-feed-row').forEach((row) => { row.hidden = query && !row.dataset.feedName.toLowerCase().includes(query); });
      page.querySelectorAll('.settings-group').forEach((group) => { group.hidden = query && !group.querySelector('.settings-feed-row:not([hidden])'); });
    });
    page.addEventListener('click', (event) => {
      const action = event.target.closest('[data-settings-action]')?.dataset.settingsAction;
      if (!action) return;
      page.querySelectorAll('[data-settings-menu-popover]').forEach((menu) => { menu.hidden = true; });
      if (action === 'test-ai' || action === 'save-ai') {
        const status = page.querySelector('.settings-ai-status');
        if (status) status.textContent = action === 'test-ai' ? '连接测试成功。' : '设置已保存。API Key 仅保存在 NextEcho 本机设置中。';
        return;
      }
      const messages = { 'add-feed': '已打开添加订阅源流程，可输入 URL 或导入 OPML', import: '已打开 OPML 导入流程', 'new-folder': '新建文件夹入口已就绪', 'rename-folder': '可编辑文件夹名称后保存', 'delete-folder': '删除文件夹前会保留其中的订阅源', 'edit-feed': '已打开订阅源编辑', 'move-feed': '已打开文件夹选择器', 'delete-feed': '删除订阅源前会请求确认' };
      showToast(action.startsWith('delete') ? 'error' : 'info', messages[action] || '设置已更新');
    });
  };

  const syncVisibleRows = () => {
    const unread = storyRows.filter((row) => !row.classList.contains('is-read'));
    const starred = storyRows.filter((row) => row.dataset.starred === 'true');
    storyRows.forEach((row) => {
      const hiddenByScope = unreadOnly && row.classList.contains('is-read');
      const hiddenByType = contentFilter !== 'all' && row.dataset.contentType !== contentFilter;
      const hiddenByStarred = scope === 'starred' && row.dataset.starred !== 'true';
      row.hidden = hiddenByScope || hiddenByType || hiddenByStarred;
    });
    const timelineEmpty = document.querySelector('.timeline-empty');
    if (timelineEmpty) {
      const emptyStarred = scope === 'starred' && starred.length === 0;
      const emptyUnread = unreadOnly && unread.length === 0;
      timelineEmpty.hidden = !(emptyStarred || emptyUnread);
      const title = timelineEmpty.querySelector('strong');
      const hint = timelineEmpty.querySelector('span');
      const glyph = timelineEmpty.querySelector('svg');
      if (title) title.textContent = emptyStarred ? '还没有收藏内容' : '当前范围已读完';
      if (hint) hint.textContent = emptyStarred ? '在文章详情点击收藏，之后会出现在这里。' : '切换到其他入口，继续阅读新的内容。';
      if (glyph) glyph.innerHTML = emptyStarred ? '<path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z" />' : '<path d="M4 6.5h16v11H4z" /><path d="m4.5 7 7.5 6 7.5-6" />';
    }
  };
  let activeArticleTab = 'article';
  const renderArticleTab = (name) => {
    if (!articleContent) return;
    activeArticleTab = name;
    articleContent.querySelectorAll('[data-article-tab]').forEach((tab) => {
      const active = tab.dataset.articleTab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.setAttribute('tabindex', active ? '0' : '-1');
    });
    const cover = articleContent.querySelector('.article-cover');
    if (cover) cover.hidden = name !== 'article';
    const copy = articleContent.querySelector('.article-copy');
    if (copy) copy.hidden = name !== 'article';
    const aiPanel = articleContent.querySelector('[data-article-panel="ai"]');
    if (aiPanel) aiPanel.hidden = name !== 'ai';
  };
  const ensureArticleTabs = () => {
    if (!articleContent || articleContent.querySelector('.article-reader-tabs')) return;
    const cover = articleContent.querySelector('.article-cover');
    if (!cover) return;
    cover.insertAdjacentHTML('beforebegin', `<div class="reader-tabs article-reader-tabs" role="tablist" aria-label="文章内容"><button type="button" class="reader-tab is-active" role="tab" aria-selected="true" data-article-tab="article">${icon(paths.fileText)}正文</button><button type="button" class="reader-tab" role="tab" aria-selected="false" tabindex="-1" data-article-tab="ai">${icon(paths.sparkle)}AI 摘要</button></div><section class="audio-tab-panel article-ai-panel" data-article-panel="ai" hidden></section>`);
    articleContent.querySelectorAll('[data-article-tab]').forEach((tab) => tab.addEventListener('click', () => renderArticleTab(tab.dataset.articleTab)));
  };
  const syncArticleFromRow = (row) => {
    if (!articleContent || !row) return;
    const title = row.querySelector('h2')?.textContent.trim();
    const source = row.dataset.source || '少数派';
    const time = row.querySelector('.story-time time')?.textContent.trim() || '今天';
    const cover = row.querySelector('.story-thumbnail')?.innerHTML || '';
    const heading = articleContent.querySelector('h3');
    const sourceNode = articleContent.querySelector('.reader-subtitle strong');
    const timeNode = articleContent.querySelector('.reader-subtitle span:last-child');
    const coverNode = articleContent.querySelector('.article-cover');
    if (heading && title) heading.textContent = title;
    if (sourceNode) sourceNode.textContent = source;
    if (timeNode) timeNode.textContent = time;
    if (coverNode && cover) {
      coverNode.innerHTML = cover;
      coverNode.setAttribute('aria-label', `${title || '文章'}封面`);
    }
  };
  const syncArticle = () => {
    ensureArticleTabs();
    const panel = articleContent?.querySelector('[data-article-panel="ai"]');
    if (!panel) return;
    const state = ['processing', 'success', 'failed'].includes(params.get('ai')) ? params.get('ai') : 'success';
    panel.innerHTML = state === 'processing'
      ? '<div class="audio-insight-empty" role="status">AI 正在一次生成内容精华与深度摘要…</div>'
      : state === 'failed'
        ? '<div class="audio-insight-empty"><p>摘要暂时无法生成，请重试。</p><button type="button" data-action="retry-article-ai">重试</button></div>'
        : insightMarkup('<p>这篇文章讨论如何在信息过载中建立自己的判断边界，并把阅读结果转化为可执行的行动。</p><ul><li>减少无效输入，保留必要上下文。</li><li>用清晰的选择标准维护长期信息源。</li><li>让阅读最终沉淀为自己的理解。</li></ul>', '<p>文章从信息过载带来的注意力消耗切入，强调阅读系统的价值并不在于收集更多，而在于帮助读者形成稳定的筛选标准。明确来源边界后，未读数量不再是需要清空的任务，而是可按需取用的信息池。</p><p>作者建议将工具定位为记忆与检索的辅助，把理解、判断和行动留给读者自己，从而建立更可持续的阅读习惯。</p>');
    renderArticleTab(activeArticleTab);
  };
  // The reader capsule's star reflects whichever row is selected, so clearing
  // favorites from the top bar has a visible counterpart on the right pane.
  const syncStarButton = () => {
    const selectedRow = storyRows.find((row) => row.classList.contains('is-selected'));
    const isStarred = selectedRow ? selectedRow.dataset.starred === 'true' : false;
    document.querySelectorAll('[data-action="toggle-star"]').forEach((button) => {
      button.classList.toggle('starred', isStarred);
      const label = isStarred ? '取消收藏' : '收藏';
      button.title = label;
      button.setAttribute('aria-label', label);
    });
  };
  const syncState = () => {
    syncAudioCard();
    const view = tool || (scope === 'feed' ? 'feed' : scope === 'folder' ? 'selected' : detail);
    app.dataset.view = view;
    app.dataset.detailOpen = (!tool && (detail === 'selected' || detail === 'article')) ? 'true' : 'false';
    document.body.dataset.preview = view;
    const timelineTitleNode = document.querySelector('.timeline-title');
    if (timelineTitleNode) {
      const title = tool ? ({ playlist: '音频', notes: '笔记', search: '搜索' }[tool]) : (scopeLabels[scope] || scopeLabels.today);
      timelineTitleNode.replaceChildren(document.createTextNode(title));
      if (tool === 'playlist' || tool === 'notes') {
        const count = document.createElement('span');
        count.className = 'timeline-title-count';
        count.textContent = `${tool === 'playlist' ? playlistItems.length : notesCount} 条`;
        timelineTitleNode.append(count);
      }
    }
    const timelineBadge = document.querySelector('.nav-today .nav-count');
    const unreadFilter = document.querySelector('.timeline-unread-filter');
    const unreadFilterBadge = unreadFilter?.querySelector('b');
    if (timelineBadge) timelineBadge.textContent = recentUnreadCounts.today;
    if (unreadFilterBadge) unreadFilterBadge.textContent = recentUnreadCounts[scope] ?? recentUnreadCounts.today;
    if (unreadFilter) unreadFilter.hidden = Boolean(tool || scope === 'starred');
    app.dataset.scope = scope;
    if (timelineWindow) {
      timelineWindow.textContent = `最近 ${historyWindowDays} 天`;
      timelineWindow.hidden = Boolean(tool || !['today', 'feed'].includes(scope));
    }
    const timelineTools = document.querySelector('.timeline-tools');
    if (timelineTools) timelineTools.hidden = tool === 'search';
    const markReadButton = document.querySelector('[data-action="mark-read"]');
    if (markReadButton) {
      // One top-bar slot expresses every "act on everything" intent. Recoverable clears
      // (queue / favorites) share the Eraser icon plus the word 清空; the irreversible
      // note delete keeps Trash2. The strings below are the exact hover tooltips.
      const clearingPlaylist = tool === 'playlist';
      const clearingStarred = !tool && scope === 'starred';
      const deletingNotes = tool === 'notes';
      const clearLabel = clearingPlaylist ? '清空播放列表' : clearingStarred ? '清空收藏' : '';
      markReadButton.innerHTML = clearLabel
        ? icon(paths.eraser)
        : deletingNotes
          ? icon(paths.trash)
          : icon('<path d="M4 6.5h16v11H4z" /><path d="m4.5 7 7.5 6 7.5-6" />');
      markReadButton.title = clearLabel || (deletingNotes ? '删除全部笔记' : (['today', 'feed'].includes(scope) ? `将最近 ${historyWindowDays} 天的当前筛选结果标为已读` : '将当前筛选结果标为已读'));
      markReadButton.setAttribute('aria-label', markReadButton.title);
      markReadButton.disabled = (clearingPlaylist && playlistItems.length === 0) || (deletingNotes && notesCount === 0) || (clearingStarred && starredCount === 0);
    }
    document.querySelectorAll('[data-scope="starred"] .nav-count, [data-scope="starred"] b').forEach((count) => { count.textContent = String(starredCount); });
    syncStarButton();
    document.querySelectorAll('[data-tool="playlist"] .nav-count').forEach((count) => { count.textContent = String(playlistItems.length); });
    document.querySelectorAll('[data-tool="notes"] .nav-count, .sidebar-drawer [data-tool="notes"] b').forEach((count) => { count.textContent = String(notesCount); });
    const sortButton = document.querySelector('[data-action="sort"]');
    if (sortButton && tool === 'playlist') { sortButton.title = sortButton.dataset.sort === 'oldest' ? '排序：按反向加入顺序' : '排序：按加入顺序'; sortButton.setAttribute('aria-label', sortButton.title); }
    stateButtons.forEach((button) => { const active = settingsOpen ? button.dataset.view === 'settings' : button.dataset.view === view; button.classList.toggle('is-active', active); button.setAttribute('aria-selected', String(active)); });
    document.querySelectorAll('[data-scope], .folder-row').forEach((node) => {
      const isFeedSelection = scope === 'feed' ? node.classList.contains('feed-primary') : true;
      const isFolderSelection = scope === 'folder' && node.classList.contains('folder-row') && node.dataset.folder === selectedFolder;
      node.classList.toggle('is-selected', (node.dataset.scope === scope && isFeedSelection || isFolderSelection) && !tool);
    });
    document.querySelectorAll('[data-tool]').forEach((node) => node.classList.toggle('is-selected', node.dataset.tool === tool));
    filterBar.hidden = Boolean(tool);
    document.querySelector('.timeline-list').hidden = Boolean(tool);
    if (tool) { toolPage.hidden = false; toolPage.innerHTML = tool === 'playlist' ? renderPlaylistMarkup() : typeof toolMarkup[tool] === 'function' ? toolMarkup[tool]() : toolMarkup[tool]; if (tool === 'settings') { if (toolDetail) toolDetail.hidden = true; bindSettingsControls(); } else renderToolDetail(tool, tool === 'playlist' && playlistDetailId ? toolPage.querySelector(`[data-tool-item="${playlistDetailId}"]`) : tool === 'playlist' ? null : toolPage.querySelector('[data-tool-item]')); } else toolPage.hidden = true;
    if (toolDetail && !tool) toolDetail.hidden = true;
    selectedContent.hidden = Boolean(tool || detail !== 'selected' || detail === 'article');
    articleContent.hidden = Boolean(tool || detail !== 'article');
    emptyContent.hidden = Boolean(tool || detail !== 'empty');
    document.querySelectorAll('[data-detail-tools]').forEach((tools) => { tools.hidden = Boolean(tool || detail === 'empty'); });
    document.querySelector('.timeline-load-more').classList.toggle('is-visible', ['today', 'feed'].includes(scope) && !tool);
    syncVisibleRows();
    if (mobilePreview) mobilePreview.dataset.detailOpen = String(mobileDetailOpen);
    if (detail === 'article') syncArticle();
    // Must run last: the tool page and playlist rows are injected above, so any
    // title they carry only exists by this point.
    migrateTitles();
    syncRailState();
  };
  const setView = (view) => {
    if (view === 'settings') { openSettings(document.querySelector('.state-button[data-view="settings"]')); return; }
    if (settingsOpen) closeSettings();
    if (['selected', 'empty', 'article', 'feed', 'mobile'].includes(view)) {
      unreadOnly = false;
      historyWindowDays = 30;
      const unreadFilter = document.querySelector('.timeline-unread-filter');
      unreadFilter?.classList.remove('is-active');
      unreadFilter?.setAttribute('aria-pressed', 'false');
    }
    tool = ['playlist', 'notes', 'search'].includes(view) ? view : null;
    if (view === 'feed') { scope = 'feed'; detail = 'selected'; }
    else if (view === 'empty') { scope = 'today'; detail = 'empty'; }
    else if (view === 'selected') { scope = 'today'; detail = 'selected'; }
    else if (view === 'article') { scope = 'today'; detail = 'article'; const articleRow = storyRows.find((row) => row.dataset.contentType === 'article'); if (articleRow) { storyRows.forEach((item) => item.classList.remove('is-selected')); articleRow.classList.add('is-selected'); syncArticleFromRow(articleRow); } }
    else if (view === 'mobile') { scope = 'today'; detail = 'selected'; mobileDetailOpen = false; }
    else if (tool) { detail = 'empty'; if (tool === 'playlist') playlistDetailId = null; }
    syncState();
  };
  const setScope = (nextScope, label = '') => { tool = null; scope = nextScope; detail = 'selected'; selectedFolder = nextScope === 'folder' ? label : null; unreadOnly = false; historyWindowDays = 30; document.querySelector('.timeline-unread-filter')?.classList.remove('is-active'); document.querySelector('.timeline-unread-filter')?.setAttribute('aria-pressed', 'false'); if (label) scopeLabels.folder = label; closeDrawer(); setMobileDrawer(false); syncState(); };

  const renderToolDetail = (kind, item) => {
    if (!toolDetail) return;
    toolDetail.hidden = false;
    toolDetail.classList.toggle('is-playlist-masked', kind === 'playlist' && !item);
    if (kind === 'playlist' && !item) toolDetail.innerHTML = `<div class="playlist-mask-preview" role="status">${icon(paths.headphones)}<strong>选择一个节目查看详情</strong><span>从中栏播放列表选择标题或封面，详情会显示在这里。</span></div>`;
    else if (kind === 'playlist') {
      const selected = playlistItems.find((entry) => entry.id === item.dataset.playlistId);
      toolDetail.innerHTML = `<article class="playlist-article"><span class="eyebrow">${selected.source}</span><h3>${selected.title}</h3><p>${selected.duration} · 音频文章</p><div class="playlist-article-cover">低噪音<br />信息饮食</div><p>信息不是越多越好。真正重要的是，在需要的时候找到它，并在阅读之后留下自己的判断。</p></article>`;
    }
    else if (kind === 'notes' && !item) { toolDetail.hidden = true; return; }
    else if (kind === 'notes') toolDetail.innerHTML = '<div class="tool-detail-copy"><span class="eyebrow">笔记详情</span><h3>给信息留出判断空间</h3><p>一个低噪音的阅读系统，首先要有明确边界；工具替你记住，自己保留理解和取舍。</p></div>';
    else toolDetail.innerHTML = '<div class="tool-detail-copy"><span class="eyebrow">搜索结果</span><h3>把注意力还给自己：一份低噪音信息饮食指南</h3><p>少数派 · 信息系统 · 12 分钟前</p><p>如何从订阅源开始，搭建更可持续的阅读系统？</p></div>';
    toolDetail.hidden = false;
  };

  const runRefresh = (button, failure = false) => {
    if (!button || button.disabled) return;
    button.disabled = true; button.classList.add('is-refreshing');
    window.setTimeout(() => { button.disabled = false; button.classList.remove('is-refreshing'); if (failure) { showToast('error', '刷新订阅源失败', [{ label: '查看', action: () => { failurePanel.hidden = false; } }, { label: '重试', action: () => runRefresh(button, false) }]); } else { failurePanel.hidden = true; showToast('success', '订阅源已刷新'); } }, 650);
  };

  document.addEventListener('click', (event) => {
    const node = event.target.closest('button, [data-action]');
    if (!node) return;
    const action = node.dataset.action;
    if (node.classList.contains('state-button')) { if (node.dataset.view === 'settings') openSettings(node); else setView(node.dataset.view); return; }
    if (action === 'close-settings') { closeSettings(); return; }
    if (action === 'toggle-sidebar') {
      const collapsed = app.dataset.sidebarCollapsed !== 'true';
      app.dataset.sidebarCollapsed = String(collapsed);
      // This path does not run syncState(), so refresh the tooltip layer by hand: the
      // toggle's own wording and every rail hint are both derived from the state we just
      // flipped.
      syncRailState();
      return;
    }
    if (action === 'content-filter') {
      contentFilter = node.dataset.filter || 'all';
      document.querySelectorAll('[data-action="content-filter"]').forEach((button) => {
        const active = button === node;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
      });
      syncVisibleRows();
      return;
    }
    if (action === 'unread-filter') {
      unreadOnly = !unreadOnly;
      node.classList.toggle('is-active', unreadOnly);
      node.setAttribute('aria-pressed', String(unreadOnly));
      syncVisibleRows();
      return;
    }
    if (action === 'load-older') {
      historyWindowDays += 30;
      const remaining = Math.max(0, 25 - ((historyWindowDays / 30) - 1) * 17);
      if (!remaining) node.hidden = true;
      syncState();
      showToast('success', `已显示最近 ${historyWindowDays} 天，左栏仍统计最近 30 天未读`);
      return;
    }
    if (action === 'toggle-reader-settings') {
      const popover = document.querySelector('.reader-settings-popover');
      if (popover) popover.hidden = !popover.hidden;
      return;
    }
    if (action === 'toggle-star') {
      const row = storyRows.find((item) => item.classList.contains('is-selected'));
      if (!row) { showToast('info', '先在时间线里选择一篇文章'); return; }
      const next = row.dataset.starred !== 'true';
      row.dataset.starred = String(next);
      starredCount = storyRows.filter((item) => item.dataset.starred === 'true').length;
      syncState();
      showToast('success', next ? '已加入收藏' : '已取消收藏');
      return;
    }
    if (action === 'open-drawer') { openDrawer(); return; }
    if (action === 'close-drawer') { closeDrawer(); return; }
    if (action === 'mobile-menu') { setMobileDrawer(mobilePreview?.dataset.drawerOpen !== 'true'); return; }
    if (action === 'back-list') { mobileDetailOpen = false; app.dataset.detailOpen = 'false'; if (mobilePreview) mobilePreview.dataset.detailOpen = 'false'; return; }
    if (action === 'refresh') { runRefresh(node, event.shiftKey || params.get('refresh') === 'error'); return; }
    if (action === 'close-failures') { failurePanel.hidden = true; return; }
    if (action === 'retry-feed') { node.disabled = true; node.textContent = '重试中…'; window.setTimeout(() => { node.closest('div').remove(); if (!failurePanel.querySelector('.failure-list').children.length) { failurePanel.hidden = true; showToast('success', '失败订阅源已恢复'); } }, 550); return; }
    if (action === 'toggle-audio') { audioPlaying = !audioPlaying; syncState(); return; }
    if (action === 'seek-backward' || action === 'seek-forward') {
      const duration = Number(audioCard?.dataset.audioDuration) || 2536;
      const seconds = action === 'seek-backward' ? -15 : 30;
      audioCurrentSeconds = Math.max(0, Math.min(duration, audioCurrentSeconds + seconds));
      audioProgress = Math.max(0, Math.min(100, audioProgress + seconds / duration * 100));
      syncState();
      return;
    }
    if (action === 'seek-audio') {
      const box = node.getBoundingClientRect();
      audioProgress = Math.max(0, Math.min(100, ((event.clientX - box.left) / box.width) * 100));
      audioCurrentSeconds = Math.round((Number(audioCard?.dataset.audioDuration) || 2536) * audioProgress / 100);
      syncState();
      return;
    }
    if (action === 'cycle-audio-speed') { audioSpeedIndex = (audioSpeedIndex + 1) % audioSpeeds.length; syncState(); return; }
    if (action === 'queue-audio') { activePlaylistId = 'podcast'; showToast('success', '已加入播放列表'); return; }
    if (action === 'start-local-transcript') { localTranscriptProcessing = true; renderAudioTab('ai'); return; }
    if (action === 'toggle-deep-summary') {
      const summary = node.nextElementSibling;
      const expanded = node.getAttribute('aria-expanded') === 'true';
      node.setAttribute('aria-expanded', String(!expanded));
      node.querySelector('span').textContent = expanded ? '展开深度精华' : '收起深度精华';
      if (summary) summary.hidden = expanded;
      return;
    }
    if (action === 'retry-article-ai') { params.set('ai', 'processing'); syncArticle(); return; }
    if (action === 'toggle-playlist') {
      const id = node.dataset.playlistId;
      if (!id) return;
      if (activePlaylistId !== id) playerProgress = 0;
      activePlaylistId = id;
      if (playerStatus === 'error') { playerStatus = 'loading'; syncState(); window.setTimeout(() => { playerStatus = 'ready'; playingPlaylistId = id; syncState(); }, 650); return; }
      playingPlaylistId = playingPlaylistId === id ? null : id;
      syncState();
      return;
    }
    if (action === 'retry-player') { playerStatus = 'loading'; syncState(); window.setTimeout(() => { playerStatus = 'ready'; syncState(); }, 650); return; }
    if (action === 'cycle-playlist-speed') { playlistSpeedIndex = (playlistSpeedIndex + 1) % playlistSpeeds.length; syncState(); return; }
    if (action === 'seek-playlist') { const box = node.getBoundingClientRect(); playerProgress = Math.max(0, Math.min(100, Math.round(((event.clientX - box.left) / box.width) * 100))); syncState(); return; }
    if (action === 'playlist-previous' || action === 'playlist-next') {
      if (!playlistItems.length) return;
      const currentIndex = Math.max(0, playlistItems.findIndex((item) => item.id === activePlaylistId));
      const offset = action === 'playlist-next' ? 1 : -1;
      activePlaylistId = playlistItems[(currentIndex + offset + playlistItems.length) % playlistItems.length].id;
      playingPlaylistId = null;
      playerStatus = 'ready';
      playerProgress = 0;
      syncState();
      return;
    }
    if (action === 'delete-playlist-item') {
      const removedId = node.dataset.playlistId;
      const removedIndex = playlistItems.findIndex((item) => item.id === removedId);
      playlistItems = playlistItems.filter((item) => item.id !== removedId);
      if (playingPlaylistId === removedId) playingPlaylistId = null;
      if (activePlaylistId === removedId) activePlaylistId = playlistItems[Math.min(removedIndex, playlistItems.length - 1)]?.id || null;
      if (playlistDetailId === removedId) playlistDetailId = playlistItems[Math.min(removedIndex, playlistItems.length - 1)]?.id || null;
      playerStatus = 'ready';
      if (activePlaylistId !== removedId) playerProgress = 0;
      syncState(); showToast('success', '已从播放列表删除'); return;
    }
    if (action === 'add-feed') { document.querySelector('.subscription-add-menu').hidden = true; closeDrawer(); showToast('info', '已打开添加订阅源流程，可输入 URL 或导入 OPML'); return; }
    if (action === 'add-folder') { document.querySelector('.subscription-add-menu').hidden = true; closeDrawer(); bodyOverflowBeforeFolder = document.body.style.overflow; document.body.style.overflow = 'hidden'; folderDialog.hidden = false; folderError.textContent = ''; folderInput.value = ''; window.setTimeout(() => folderInput.focus(), 0); return; }
    if (action === 'close-folder') { folderDialog.hidden = true; document.body.style.overflow = bodyOverflowBeforeFolder; return; }
    if (action === 'create-folder') {
      const name = folderInput.value.trim(); const names = [...document.querySelectorAll('.folder-row strong')].map((el) => el.textContent.trim());
      if (!name) { folderError.textContent = '请输入文件夹名称'; return; }
      if (names.includes(name)) { folderError.textContent = '已有同名文件夹，请换一个名称'; return; }
      if (/失败|error/i.test(name)) { folderError.textContent = '创建失败，请稍后重试'; return; }
      const row = document.createElement('button'); row.className = 'nav-item folder-row is-collapsed'; row.dataset.folder = name; row.innerHTML = '<span class="folder-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3Z" /><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2" /></svg></span><strong></strong>'; row.querySelector('strong').textContent = name; document.querySelector('.subscription-tree').appendChild(row); folderDialog.hidden = true; document.body.style.overflow = bodyOverflowBeforeFolder; bindFolder(row); showToast('success', `文件夹“${name}”已添加`); return;
    }
    if (node.dataset.scope === 'today' || node.dataset.scope === 'starred' || node.dataset.scope === 'feed') { setScope(node.dataset.scope); return; }
    if (node.dataset.scope === 'folder') { setScope('folder', node.dataset.folder || node.textContent.trim()); return; }
    if (node.dataset.tool) { if (node.dataset.tool === 'settings') openSettings(node); else setView(node.dataset.tool); closeDrawer(); return; }
    if (node.dataset.toolItem) { document.querySelectorAll('.tool-row').forEach((row) => row.classList.remove('is-selected')); node.classList.add('is-selected'); if (tool === 'playlist') playlistDetailId = node.dataset.playlistId; renderToolDetail(tool, node); return; }
  });
  document.querySelectorAll('.story-row').forEach((row) => row.addEventListener('click', () => { storyRows.forEach((item) => item.classList.remove('is-selected')); row.classList.add('is-selected'); detail = row.dataset.contentType === 'article' ? 'article' : 'selected'; tool = null; if (detail === 'article') syncArticleFromRow(row); syncState(); }));
  mobileStories.forEach((story) => story.addEventListener('click', () => { mobileDetailOpen = true; if (mobilePreview) { mobilePreview.dataset.detailOpen = 'true'; mobilePreview.dataset.drawerOpen = 'false'; } }));
  document.querySelectorAll('.reader-tab:not([data-reader-tab])').forEach((tab) => tab.addEventListener('click', () => { document.querySelectorAll('.reader-tab').forEach((item) => item.classList.remove('is-active')); tab.classList.add('is-active'); }));
  document.querySelector('[data-action="sort"]')?.addEventListener('click', (event) => { const button = event.currentTarget; const oldest = button.dataset.sort === 'oldest'; button.dataset.sort = oldest ? 'newest' : 'oldest'; if (tool === 'playlist') { playlistItems.reverse(); button.title = oldest ? '排序：按加入顺序' : '排序：按反向加入顺序'; button.setAttribute('aria-label', button.title); syncState(); return; } button.title = oldest ? '排序：从新至旧' : '排序：从旧至新'; button.setAttribute('aria-label', button.title); const rows = oldest ? storyRows : [...storyRows].reverse(); rows.forEach((row) => timelineList.insertBefore(row, document.querySelector('.timeline-load-more'))); });
  document.querySelector('[data-action="mark-read"]')?.addEventListener('click', () => {
    // No secondary confirmation: the hover tooltip already states the outcome, and
    // the recoverable clears can be reversed by adding items back.
    if (tool === 'playlist') {
      playlistItems = []; activePlaylistId = null; playingPlaylistId = null; playlistDetailId = null; playerStatus = 'ready'; playerProgress = 0;
      syncState(); showToast('success', '播放列表已清空'); return;
    }
    if (tool === 'notes') {
      notesCount = 0; syncState(); showToast('success', '笔记已全部删除'); return;
    }
    if (!tool && scope === 'starred') {
      storyRows.forEach((row) => { row.dataset.starred = 'false'; });
      starredCount = 0;
      syncState(); showToast('success', '收藏已清空'); return;
    }
    const visible = storyRows.filter((row) => !row.hidden); visible.forEach((row) => { row.classList.add('is-read'); row.dataset.unread = 'false'; row.querySelector('.unread-dot')?.setAttribute('aria-label', '已读'); }); if (contentFilter === 'all') recentUnreadCounts[scope] = '0'; if (scope === 'feed' && contentFilter === 'all') { const feedCount = document.querySelector('.feed-primary .nav-count'); if (feedCount) feedCount.textContent = '0'; } syncState(); showToast('success', ['today', 'feed'].includes(scope) ? `最近 ${historyWindowDays} 天的当前筛选结果已标为已读` : '当前筛选结果已标为已读');
  });
  const bindFolder = (row) => row.addEventListener('click', (event) => { if (event.target.closest('.folder-icon')) { row.classList.toggle('is-collapsed'); return; } setScope('folder', row.dataset.folder); });
  document.querySelectorAll('.folder-row').forEach(bindFolder);
  document.querySelector('.section-action')?.addEventListener('click', (event) => { event.stopPropagation(); const menu = document.querySelector('.subscription-add-menu'); menu.hidden = !menu.hidden; });
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-settings-menu]')) return;
    document.querySelectorAll('[data-settings-menu-popover]').forEach((menu) => { menu.hidden = true; });
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && settingsOpen) { event.preventDefault(); closeSettings(); return; } if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setView('search'); window.setTimeout(() => document.querySelector('.search-box input')?.focus(), 0); return; } if (event.target.classList?.contains('playlist-progress') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); playerProgress = event.key === 'Home' ? 0 : event.key === 'End' ? 100 : Math.max(0, Math.min(100, playerProgress + (event.key === 'ArrowRight' ? 5 : -5))); syncState(); window.setTimeout(() => document.querySelector('.playlist-progress')?.focus(), 0); } });
  document.addEventListener('keydown', (event) => { if (!event.target.classList?.contains('audio-progress') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); audioProgress = event.key === 'Home' ? 0 : event.key === 'End' ? 100 : Math.max(0, Math.min(100, audioProgress + (event.key === 'ArrowRight' ? 5 : -5))); audioCurrentSeconds = Math.round((Number(audioCard?.dataset.audioDuration) || 2536) * audioProgress / 100); syncState(); window.setTimeout(() => audioCard?.querySelector('.audio-progress')?.focus(), 0); });
  document.querySelector('.folder-dialog')?.addEventListener('keydown', (event) => { if (event.key === 'Escape') { folderDialog.hidden = true; document.body.style.overflow = bodyOverflowBeforeFolder; } });

  if (params.get('test') === 'zero-unread') document.querySelectorAll('.nav-count').forEach((count) => { if (count.closest('.folder-row')) count.textContent = '0'; });
  if (params.get('test') === 'image-fail') { document.querySelectorAll('.story-thumbnail').forEach((thumb) => { thumb.classList.add('image-failed'); thumb.innerHTML = '<span>图片加载失败</span>'; }); document.querySelector('.article-cover')?.classList.add('image-failed'); }
  if (params.get('cover') === 'none') document.querySelector('.article-cover')?.setAttribute('hidden', '');
  app.dataset.sidebarCollapsed = String(params.get('sidebar') === 'collapsed');
  setView(params.get('view') || 'selected');
  if (params.get('reader') === 'open') {
    const popover = document.querySelector('.reader-settings-popover');
    if (popover) popover.hidden = false;
  }
  if (params.get('refresh') === 'error') window.setTimeout(() => runRefresh(document.querySelector('[data-action="refresh"]'), true), 200);
  if (params.get('clean') === '1') document.body.dataset.clean = 'true';
  if (params.get('canvas') === '390') document.body.dataset.mobileCanvas = 'true';
})();
