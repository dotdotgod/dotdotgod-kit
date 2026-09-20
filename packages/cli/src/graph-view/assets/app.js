(() => {
  const COLORS = { seed: '#1857c8', doc: '#6b47a8', test: '#16734b', code: '#42515e', contract: '#c66a12', heading: '#8b9690', other: '#66727b' };
  const MORPH_DURATION = 380;
  const MOTION_MODES = new Set(['instant', 'layer', 'sequence']);
  const savedMotionMode = localStorage.getItem('dotdotgod:graph-motion');
  const state = { payload: null, renderer: null, graph: null, selected: null, enabledRelations: new Set(), previousPositions: new Map(), animationFrame: null, positioned: [], firstRender: true, motionMode: MOTION_MODES.has(savedMotionMode) ? savedMotionMode : 'layer', revealToken: 0 };
  const elements = {
    graph: document.querySelector('#graph'), fallback: document.querySelector('#graph-fallback'), filters: document.querySelector('#relation-filters'), motionMode: document.querySelector('#motion-mode'), skipReveal: document.querySelector('#skip-reveal'), list: document.querySelector('#result-list'), inspection: document.querySelector('#inspection'), status: document.querySelector('#status'), summary: document.querySelector('#plot-summary'), count: document.querySelector('#result-count'), form: document.querySelector('#reroot-form'), input: document.querySelector('#reroot-path'), reset: document.querySelector('#reset-camera'), search: document.querySelector('#node-search-input'), searchResults: document.querySelector('#node-search-results'),
  };

  function nodeKind(node) {
    if (node.seed) return 'seed';
    if (node.type === 'contract') return 'contract';
    if (node.type === 'heading' || node.id.startsWith('heading:')) return 'heading';
    if (node.path?.startsWith('docs/')) return 'doc';
    if (/(^|\/)(test|tests)\//.test(node.path ?? '') || /\.(test|spec)\./.test(node.path ?? '')) return 'test';
    if (node.type === 'file') return 'code';
    return 'other';
  }

  function relationLabel(value) { return value.replace(/^incoming:/, '').replaceAll('_', ' '); }
  function safe(value) { const span = document.createElement('span'); span.textContent = value ?? ''; return span.innerHTML; }

  function layoutNodes(nodes, edges) {
    const width = Math.max(elements.graph.clientWidth, 600);
    const height = Math.max(elements.graph.clientHeight, 500);
    const center = { x: width / 2, y: height / 2 };
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const layerCounts = new Map();
    const simulationNodes = [...nodes].sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id)).map((node) => {
      const layerIndex = layerCounts.get(node.depth) ?? 0;
      layerCounts.set(node.depth, layerIndex + 1);
      const radius = node.depth === 0 ? Math.min(34, nodes.filter((candidate) => candidate.depth === 0).length * 8) : 66 + node.depth * 76;
      const angle = layerIndex * goldenAngle + node.depth * .35;
      return { ...node, targetX: center.x + Math.cos(angle) * radius, targetY: center.y + Math.sin(angle) * radius, x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
    });
    const byId = new Map(simulationNodes.map((node) => [node.id, node]));
    const simulationEdges = edges.map((edge) => ({ ...edge, source: byId.get(edge.source), target: byId.get(edge.target) })).filter((edge) => edge.source && edge.target);
    const simulation = d3.forceSimulation(simulationNodes)
      .force('charge', d3.forceManyBody().strength((node) => node.type === 'heading' ? -16 : node.seed ? -220 : -48))
      .force('link', d3.forceLink(simulationEdges).id((node) => node.id).distance((edge) => edge.relation === 'contains_heading' ? 18 : edge.source.seed || edge.target.seed ? 72 : 38).strength((edge) => edge.relation === 'contains_heading' ? .72 : .34))
      .force('x', d3.forceX((node) => node.targetX).strength(.16))
      .force('y', d3.forceY((node) => node.targetY).strength(.16))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(.025))
      .force('collide', d3.forceCollide().radius((node) => node.type === 'heading' ? 3.5 : 6 + Math.sqrt(node.impactScore || 0)))
      .stop();
    const ticks = nodes.length > 1400 ? 70 : nodes.length > 700 ? 100 : nodes.length > 300 ? 130 : 180;
    for (let index = 0; index < ticks; index += 1) simulation.tick();
    return simulationNodes;
  }

  function visibleModel() {
    const sourceNodes = state.payload.graph.nodes;
    const sourceIds = new Set(sourceNodes.map((node) => node.id));
    return { nodes: sourceNodes, edges: state.payload.graph.edges.filter((edge) => state.enabledRelations.has(edge.relation) && sourceIds.has(edge.source) && sourceIds.has(edge.target)) };
  }

  function revealDelay(node, index, maximumDepth, totalNodes) {
    if (!state.firstRender || state.motionMode === 'instant') return 0;
    if (state.motionMode === 'sequence') return index * Math.min(32, 1200 / Math.max(totalNodes, 1));
    return node.depth * Math.min(70, 650 / Math.max(maximumDepth, 1));
  }

  function finishReveal(positioned) {
    cancelAnimationFrame(state.animationFrame);
    state.revealToken += 1;
    for (const node of positioned) {
      if (!state.graph?.hasNode(node.id)) continue;
      state.graph.setNodeAttribute(node.id, 'x', node.x);
      state.graph.setNodeAttribute(node.id, 'y', node.y);
      state.graph.setNodeAttribute(node.id, 'size', node.renderSize ?? 4);
    }
    state.renderer?.refresh();
    state.previousPositions = new Map(positioned.map((node) => [node.id, { x: node.x, y: node.y }]));
    state.firstRender = false;
    elements.skipReveal.hidden = true;
  }

  function animatePositions(graph, positioned) {
    cancelAnimationFrame(state.animationFrame);
    const token = ++state.revealToken;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mode = reduced ? 'instant' : state.motionMode;
    const maximumDepth = Math.max(0, ...positioned.map((node) => node.depth));
    const ordered = [...positioned].sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id));
    const orderById = new Map(ordered.map((node, index) => [node.id, index]));
    const starts = new Map(positioned.map((node) => {
      const prior = state.previousPositions.get(node.id);
      const root = positioned.find((candidate) => candidate.id === node.nearestRoot);
      return [node.id, prior ?? { x: root?.x ?? node.x, y: root?.y ?? node.y }];
    }));
    const lastDelay = mode === 'instant' ? 0 : Math.max(0, ...positioned.map((node) => revealDelay(node, orderById.get(node.id), maximumDepth, positioned.length)));
    const duration = mode === 'instant' ? 0 : MORPH_DURATION + lastDelay;
    const startedAt = performance.now();
    elements.skipReveal.hidden = duration === 0;
    const tick = (now) => {
      if (token !== state.revealToken) return;
      const elapsed = now - startedAt;
      for (const node of positioned) {
        const delay = mode === 'instant' ? 0 : revealDelay(node, orderById.get(node.id), maximumDepth, positioned.length);
        const progress = duration === 0 ? 1 : Math.max(0, Math.min(1, (elapsed - delay) / MORPH_DURATION));
        const eased = 1 - Math.pow(1 - progress, 4);
        const start = starts.get(node.id);
        graph.setNodeAttribute(node.id, 'x', start.x + (node.x - start.x) * eased);
        graph.setNodeAttribute(node.id, 'y', start.y + (node.y - start.y) * eased);
        graph.setNodeAttribute(node.id, 'size', (node.renderSize ?? 4) * (progress === 0 ? 0 : .18 + .82 * eased));
      }
      state.renderer?.refresh();
      if (elapsed < duration) state.animationFrame = requestAnimationFrame(tick);
      else finishReveal(positioned);
    };
    state.animationFrame = requestAnimationFrame(tick);
  }

  function renderFilters(edges) {
    const relations = [...new Set(edges.map((edge) => edge.relation))].sort();
    const previous = state.enabledRelations;
    state.enabledRelations = new Set(relations.filter((relation) => previous.size === 0 || previous.has(relation)));
    elements.filters.replaceChildren(...relations.map((relation) => {
      const label = document.createElement('label'); label.className = 'filter-control';
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = state.enabledRelations.has(relation); input.value = relation;
      input.addEventListener('change', () => { input.checked ? state.enabledRelations.add(relation) : state.enabledRelations.delete(relation); renderGraph(); });
      const text = document.createElement('span'); text.textContent = relationLabel(relation);
      const count = document.createElement('code'); count.textContent = String(edges.filter((edge) => edge.relation === relation).length);
      label.append(input, text, count); return label;
    }));
  }

  function renderGraph() {
    if (state.graph) state.previousPositions = new Map(state.graph.nodes().map((id) => [id, { x: state.graph.getNodeAttribute(id, 'x'), y: state.graph.getNodeAttribute(id, 'y') }]));
    cancelAnimationFrame(state.animationFrame);
    state.renderer?.kill();
    const model = visibleModel();
    const visibleNodes = model.nodes;
    const positioned = layoutNodes(visibleNodes, model.edges);
    state.positioned = positioned;
    try {
      const graph = new graphology.MultiDirectedGraph();
      for (const node of positioned) {
        node.renderSize = node.seed ? 14 : node.type === 'heading' ? 2 : 4 + Math.sqrt(Math.max(node.impactScore, 1)) * .55;
        const start = state.previousPositions.get(node.id) ?? positioned.find((candidate) => candidate.id === node.nearestRoot) ?? node;
        graph.addNode(node.id, { label: node.label, x: start.x, y: start.y, size: node.renderSize, color: COLORS[nodeKind(node)], node });
      }
      model.edges.forEach((edge, index) => graph.addDirectedEdgeWithKey(`edge-${index}`, edge.source, edge.target, { color: edge.relation === 'vector_similarity' ? '#c66a12' : '#9ca8a3', size: edge.weight ? Math.min(3, 1 + edge.weight / 7) : 1, type: 'arrow', relation: edge.relation }));
      state.graph = graph;
      state.renderer = new Sigma(graph, elements.graph, { renderEdgeLabels: false, labelDensity: visibleNodes.length > 500 ? .03 : .1, labelRenderedSizeThreshold: visibleNodes.length > 500 ? 11 : 7, defaultEdgeType: 'arrow', zIndex: true, nodeReducer: (id, data) => {
        if (!state.selected || !state.graph.hasNode(state.selected)) return data;
        const neighbors = new Set(state.graph.neighbors(state.selected));
        if (id === state.selected || neighbors.has(id)) return { ...data, highlighted: true, zIndex: 2 };
        return { ...data, color: '#cbd1ce', label: '', zIndex: 0 };
      }, edgeReducer: (key, data) => {
        if (!state.selected || !state.graph.hasNode(state.selected)) return data;
        const [source, target] = state.graph.extremities(key);
        return source === state.selected || target === state.selected ? { ...data, color: '#1857c8', size: 2.4, zIndex: 2 } : { ...data, color: '#d8dedb', zIndex: 0 };
      } });
      state.renderer.on('clickNode', ({ node }) => selectNode(node, true));
      animatePositions(graph, positioned);
      elements.fallback.hidden = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Impact graph rendering failed:', error);
      elements.fallback.textContent = `Graph rendering failed: ${message}`;
      elements.fallback.hidden = false;
    }
  }

  function renderList() {
    const related = state.payload.impact.related;
    elements.count.textContent = `${related.length} results`;
    elements.list.replaceChildren(...related.map((item, index) => {
      const entry = document.createElement('li');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'result-button'; button.dataset.nodeId = item.id; button.setAttribute('aria-current', item.id === state.selected ? 'true' : 'false');
      button.innerHTML = `<span class="rank">${String(index + 1).padStart(2, '0')}</span><span class="result-copy"><span class="result-path">${safe(item.path ?? item.title ?? item.id)}</span><span class="result-reason">${safe((item.reasons ?? []).slice(0, 2).map(relationLabel).join(' · '))}</span></span><span class="score">${item.impactScore}</span>`;
      button.addEventListener('click', () => selectNode(item.id, true)); entry.append(button); return entry;
    }));
  }

  function renderSearch() {
    const query = elements.search.value.trim().toLocaleLowerCase();
    if (!query) { elements.searchResults.replaceChildren(); return; }
    const matches = state.payload.graph.nodes.filter((node) => `${node.label} ${node.path ?? ''} ${node.id}`.toLocaleLowerCase().includes(query)).slice(0, 30);
    elements.searchResults.replaceChildren(...matches.map((node) => {
      const item = document.createElement('li'); const button = document.createElement('button'); button.type = 'button'; button.textContent = node.label ?? node.id;
      button.addEventListener('click', () => { selectNode(node.id); elements.searchResults.replaceChildren(); });
      item.append(button); return item;
    }));
  }

  function renderInspection(node) {
    if (!node) return;
    const score = node.seed ? 100 : node.impactScore;
    const reasons = (node.reasons ?? []).map(relationLabel).join(', ') || 'whole graph node';
    const ppr = node.scoreBreakdown?.connection?.ppr;
    const memory = node.scoreBreakdown?.memory;
    elements.inspection.innerHTML = `<h3>${safe(node.label ?? node.path ?? node.id)}</h3><dl><dt>Type</dt><dd>${safe(node.type)}</dd><dt>Impact score</dt><dd>${safe(String(score))}</dd><dt>Evidence</dt><dd>${safe(reasons)}</dd><dt>Component</dt><dd>${safe(String((node.component ?? 0) + 1))}</dd>${ppr !== undefined ? `<dt>PPR contribution</dt><dd>${safe(String(ppr))}</dd>` : ''}${memory ? `<dt>Memory contribution</dt><dd>${safe(String((memory.priority ?? 0) + (memory.policyAdjustments ?? 0)))}</dd>` : ''}${node.vectorEvidence?.score ? `<dt>Similarity</dt><dd>${safe(String(node.vectorEvidence.score))}</dd>` : ''}<dt>Path</dt><dd>${safe(node.path ?? node.id)}</dd></dl>${node.path && !node.seed ? '<button type="button" class="reroot-selected">Re-root from this file</button>' : ''}`;
    elements.inspection.querySelector('.reroot-selected')?.addEventListener('click', () => loadImpact([node.path]));
  }

  function selectNode(id, focusList = false) {
    state.selected = id;
    state.renderer?.refresh();
    for (const button of elements.list.querySelectorAll('.result-button')) button.setAttribute('aria-current', button.dataset.nodeId === id ? 'true' : 'false');
    if (focusList) elements.list.querySelector(`[data-node-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
    renderInspection(state.payload.graph.nodes.find((node) => node.id === id));
    history.replaceState(null, '', `#${encodeURIComponent(id)}`);
  }

  async function loadImpact(paths) {
    elements.status.textContent = 'Calculating impact…';
    const query = paths.map((path) => `changed=${encodeURIComponent(path)}`).join('&');
    const response = await fetch(`/api/reroot?${query}`);
    const payload = await response.json();
    if (!response.ok || !payload.ok) { elements.status.textContent = payload.error?.message ?? 'Impact calculation failed.'; return; }
    applyPayload(payload);
  }

  function applyPayload(payload) {
    state.payload = payload;
    state.selected = payload.graph.changedFiles.length === 1 ? `file:${payload.graph.changedFiles[0]}` : null;
    elements.input.value = payload.graph.changedFiles[0] ?? '';
    elements.status.textContent = payload.impact.semantic.status === 'available' ? 'Shared structural graph · semantic ranking available' : 'Shared structural graph · structural ranking';
    const omitted = payload.graph.diagnostics?.disconnectedNodesOmitted ?? 0;
    const depth = payload.graph.diagnostics?.maximumDepth ?? 0;
    elements.summary.textContent = `${payload.graph.nodes.length} connected nodes · ${payload.graph.edges.length} relations · ${depth} hops · ${omitted} disconnected omitted`;
    renderFilters(payload.graph.edges); renderGraph(); renderList(); renderSearch();
    if (state.selected && payload.graph.nodes.some((node) => node.id === state.selected)) renderInspection(payload.graph.nodes.find((node) => node.id === state.selected));
    else if (payload.graph.nodes.length === 0) elements.inspection.innerHTML = '<h3>No shared structural nodes</h3><p>Add indexable shared files or relations to populate this graph. Local memory and headings are intentionally hidden.</p>';
  }

  elements.motionMode.value = state.motionMode;
  elements.motionMode.addEventListener('change', () => {
    state.motionMode = MOTION_MODES.has(elements.motionMode.value) ? elements.motionMode.value : 'layer';
    localStorage.setItem('dotdotgod:graph-motion', state.motionMode);
    state.firstRender = true;
    state.previousPositions.clear();
    renderGraph();
  });
  elements.skipReveal.addEventListener('click', () => finishReveal(state.positioned));
  elements.form.addEventListener('submit', (event) => { event.preventDefault(); const path = elements.input.value.trim(); if (path) loadImpact([path]); });
  elements.reset.addEventListener('click', () => state.renderer?.getCamera().animatedReset({ duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250 }));
  elements.search.addEventListener('input', renderSearch);
  addEventListener('resize', () => state.renderer?.refresh());
  fetch('/api/impact').then((response) => response.json()).then(applyPayload).catch((error) => { console.error(error); elements.status.textContent = 'Unable to load impact data.'; });
})();
