const { Plugin, Notice, getLanguage } = require('obsidian');
const { translate } = require('./i18n.cjs');
const { validateGraph, graphPath, normalizeOptions } = require('./validation.cjs');
const { TraceabilitySettings } = require('./settings.cjs');
const { attach } = require('./renderer.cjs');

module.exports = class TraceabilityPlugin extends Plugin {
  t(key) { return translate(getLanguage(), key); }
  report(error, key = 'loadError') { console.error('[dotdotgod]', error); new Notice(this.t(key)); }
  async onload() {
    this.bindings = new Map();
    this.unsupported = new WeakSet();
    this.stopped = false;
    this.options = normalizeOptions(await this.loadData());
    this.addSettingTab(new TraceabilitySettings(this.app, this));
    this.addCommand({ id: 'refresh', name: this.t('reload'), callback: () => this.loadGraph().catch(error => this.report(error)) });
    this.app.workspace.onLayoutReady(() => {
      if (!this.stopped) return this.loadGraph().catch(error => this.report(error));
    });
    this.registerInterval(setInterval(() => { if (!this.stopped) this.refresh(); }, 500));
  }
  async loadGraph() {
    if (this.loading) return this.loading;
    this.loading = this.readGraph();
    try { return await this.loading; } finally { this.loading = null; }
  }
  async readGraph() {
    const path = graphPath(this.options.graphPath);
    const graph = validateGraph(JSON.parse(await this.app.vault.adapter.read(path)));
    graph.edges = graph.edges.filter(edge => [edge.source, edge.target].every(path => {
      const file = this.app.vault.getAbstractFileByPath(path);
      return file && typeof file.extension === 'string';
    }));
    if (this.stopped || path !== this.options.graphPath) return;
    this.detach();
    this.graph = graph;
    this.refresh();
  }
  detach() {
    for (const [renderer, binding] of this.bindings) {
      this.bindings.delete(renderer);
      try { binding.restore(true); } catch (error) { this.report(error, 'unsupported'); }
    }
  }
  refresh() {
    if (!this.graph || this.stopped) return;
    const leaves = this.app.workspace.getLeavesOfType('graph');
    for (const [renderer, binding] of this.bindings) {
      if (!leaves.some(l => l.view.renderer === renderer)) { binding.restore(false); this.bindings.delete(renderer); }
    }
    for (const { view } of leaves) {
      const r = view.renderer;
      if (!r?.px?.stage || this.bindings.has(r) || this.unsupported.has(r)) continue;
      try {
        const template = view.dataEngine?.controlsEl?.querySelector('.graph-control-section > .tree-item-self');
        if (!template?.querySelector('.graph-control-section-header') || !template.querySelector('.collapse-icon') ||
            !r.interactiveEl?.addEventListener || !r.containerEl?.ownerDocument ||
            !Array.isArray(r.nodes) || !Array.isArray(r.links) || !r.nodeLookup ||
            ['setData', 'renderCallback', 'changed', 'getHighlightNode'].some(key => typeof r[key] !== 'function') ||
            typeof view.dataEngine?.render !== 'function') throw new Error(this.t('unsupported'));
        attach.call(this, view);
      } catch (error) {
        try { this.bindings.get(r)?.restore(true); } catch (restoreError) { console.error('[dotdotgod]', restoreError); }
        finally { this.bindings.delete(r); this.unsupported.add(r); }
        this.report(error, 'unsupported');
      }
    }
  }
  onunload() { this.stopped = true; this.detach(); }
};
